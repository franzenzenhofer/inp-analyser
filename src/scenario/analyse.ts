import { availableParallelism, loadavg } from 'node:os';
import type { EntityMap } from '../analysis/entities.js';
import { bootOffsets } from '../analysis/hazard.js';
import { blockPatterns } from '../browser/block-third-parties.js';
import { createBrowserHost, type BrowserHost } from '../browser/browser-host.js';
import { launchChrome } from '../browser/launch.js';
import type { DiscoveryResult } from '../discovery/types.js';
import { assertMachineFit, keepAwake, machineSnapshot, powerState } from '../machine/health.js';
import { startSentinel, type SentinelServer } from '../machine/sentinel.js';
import type { RunRecord } from '../model/run.js';
import type { Condition, Phase, Scenario } from '../model/scenario.js';
import { createPoliteness, SYSTEM_CLOCK, type Politeness } from '../safety/politeness.js';
import type { GuardPolicy } from '../safety/request-guard.js';
import type { RunStore } from '../store/jsonl.js';
import { bootGeometry } from './boot-geometry.js';
import { discoverStable } from './discover-stable.js';
import { recordPreflight, type PreflightTrace } from './preflight.js';
import { seededRandom } from './random.js';
import { runCausal } from './run-causal.js';
import { runDeepDive, runScreening } from './run-stages.js';
import { sentinelReference } from './sentinel-reference.js';
import type { StageContext } from './stage-context.js';
import { screeningScenarios } from './stages.js';

export interface AnalyseConfig {
  readonly url: string;
  readonly condition: Condition;
  readonly phases: readonly Phase[];
  readonly seed: number;
  readonly budgetMs: number;
  readonly quick: boolean;
  readonly maxTargets: number;
  readonly minLoadIntervalMs: number;
  readonly entityMap: EntityMap;
  readonly guardPolicy: GuardPolicy;
  /** Only for the local test site: map its fake hosts to 127.0.0.1. */
  readonly hostResolverRules?: string;
  /** Proxy for page traffic (see LaunchOptions.proxyServer). */
  readonly proxyServer?: string;
  /** Busy-machine limit for the start gate (1-minute load); default: half the cores. */
  readonly maxLoad?: number;
}

export interface AnalysisRun {
  readonly preflight: PreflightTrace;
  readonly discovery: DiscoveryResult;
  readonly scenarios: readonly Scenario[];
  readonly deepDived: readonly string[];
  readonly records: readonly RunRecord[];
  readonly sentinelReference: readonly number[];
  readonly chromeVersion: string;
  readonly loads: number;
  readonly incomplete?: string;
}

function snapshotFactory(): (benchmark: number) => RunRecord['machine'] {
  return (benchmarkIndex) => ({ benchmarkIndex, loadAverage1m: loadavg()[0] ?? 0, onBattery: powerState().onBattery });
}

interface Setup {
  readonly host: BrowserHost;
  readonly sentinel: SentinelServer;
  readonly reference: number[];
  readonly politeness: Politeness;
}

async function prepare(config: AnalyseConfig, host: BrowserHost, sentinel: SentinelServer): Promise<Setup> {
  const browser = await host.get();
  const machine = await machineSnapshot(browser);
  assertMachineFit(machine, config.maxLoad);
  console.log(`[analyse] ${config.url} | ${config.condition.device} cpu ${config.condition.cpuRate}x | seed ${config.seed} | cores ${availableParallelism()} | benchmarkIndex ${Math.round(machine.benchmarkIndex)}`);
  const reference = await sentinelReference(browser, sentinel, config.condition, machine);
  return { host, sentinel, reference, politeness: createPoliteness({ minIntervalMs: config.minLoadIntervalMs, clock: SYSTEM_CLOCK }) };
}

function stageContext(config: AnalyseConfig, setup: Setup, input: { store: RunStore; preflight: PreflightTrace; discovery: DiscoveryResult }): StageContext {
  const { host, politeness, sentinel, reference } = setup;
  return {
    deps: {
      host, store: input.store, politeness, sentinel: { server: sentinel, reference },
      plan: { url: config.url, entityMap: config.entityMap, guardPolicy: config.guardPolicy },
      blockedUrlPatterns: (s) => blockPatterns(s.condition.thirdParty, { pageUrl: config.url, observedUrls: input.preflight.requestUrls, entityMap: config.entityMap }),
      nextRunId: counter(), machine: snapshotFactory(),
    },
    targets: new Map(input.discovery.targets.map((t) => [t.target.id, t.target])),
    random: seededRandom(config.seed), deadline: Date.now() + config.budgetMs, records: [],
  };
}

async function measure(config: AnalyseConfig, setup: Setup, store: RunStore): Promise<AnalysisRun> {
  await setup.politeness.beforeLoad(config.url);
  const preflight = await recordPreflight(await setup.host.get(), config.url, { condition: config.condition, entityMap: config.entityMap });
  const discovery = await discoverStable({ browser: await setup.host.get(), url: config.url, condition: config.condition, maxTargets: config.maxTargets, politeness: setup.politeness });
  const ctx = stageContext(config, setup, { store, preflight, discovery });
  const targets = [...ctx.targets.values()];
  await setup.politeness.beforeLoad(config.url);
  const geometry = await bootGeometry(await setup.host.get(), { url: config.url, condition: config.condition, targets, offsetsMs: bootOffsets(preflight.timeline) });
  const scenarios = screeningScenarios({ targets, phases: config.phases, condition: config.condition, bootGeometry: geometry });
  await runScreening(ctx, scenarios);
  const deep = config.quick ? [] : await runDeepDive(ctx, scenarios);
  const variants = config.quick ? [] : await runCausal(ctx, deep);
  const base = { preflight, discovery, scenarios: [...scenarios, ...variants], deepDived: deep.map((s) => s.id), records: ctx.records, sentinelReference: setup.reference, chromeVersion: await (await setup.host.get()).version(), loads: setup.politeness.totalLoads() };
  if (setup.host.relaunches() > 0) console.error(`[analyse] Chrome was relaunched ${setup.host.relaunches()} time(s) after a lost browser; affected runs were retried`);
  return ctx.incomplete === undefined ? base : { ...base, incomplete: ctx.incomplete };
}

/** Stage 0 -> 1 -> 2 for one URL; every run lands in the store as its block finishes. */
export async function analyse(config: AnalyseConfig, store: RunStore): Promise<AnalysisRun> {
  keepAwake();
  await store.init();
  const host = await createBrowserHost(() => launchChrome({
    ...(config.hostResolverRules === undefined ? {} : { hostResolverRules: config.hostResolverRules }),
    ...(config.proxyServer === undefined ? {} : { proxyServer: config.proxyServer }),
  }));
  const sentinel = await startSentinel();
  try {
    return await measure(config, await prepare(config, host, sentinel), store);
  } finally {
    await sentinel.close();
    await host.close();
  }
}

function counter(): () => string {
  let n = 0;
  return () => `run-${String(++n).padStart(4, '0')}`;
}
