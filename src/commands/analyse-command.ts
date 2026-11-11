import { join } from 'node:path';
import type { EntityMap } from '../analysis/entities.js';
import { loadEntityMap } from '../analysis/entities.js';
import { loadConsentState } from '../consent/consent-state.js';
import { buildFieldSummary } from '../field/field-summary.js';
import { readGoogleApiKey } from '../field/http.js';
import type { Condition, Phase } from '../model/scenario.js';
import { buildReport } from '../report/build-report.js';
import type { RunMeta } from '../report/run-meta.js';
import { writeReports } from '../report/write-reports.js';
import { analyse, type AnalysisRun } from '../scenario/analyse.js';
import { RunStore } from '../store/jsonl.js';
import { TOOL } from '../tool.js';

export interface AnalyseOptions {
  readonly device: 'mobile' | 'desktop';
  readonly cpu: number;
  readonly budgetMinutes: number;
  readonly quick: boolean;
  readonly maxTargets: number;
  readonly seed: number;
  readonly out: string;
  readonly entityMap?: string;
  readonly allowMutations?: string;
  readonly minLoadIntervalSeconds: number;
  readonly field: boolean;
  readonly phases: readonly Phase[];
  readonly hostResolverRules?: string;
  readonly proxyServer?: string;
  /** Path to a consent-state JSON; the run then measures the consent-accepted (returning visitor) page. */
  readonly consentState?: string;
  readonly maxLoad?: number;
}

function toMeta(url: string, run: AnalysisRun, input: { seed: number; condition: Condition; startedAt: string }): RunMeta {
  return {
    url, seed: input.seed, startedAt: input.startedAt, finishedAt: new Date().toISOString(), chromeVersion: run.chromeVersion, condition: input.condition,
    hazard: run.preflight.timeline, targets: run.discovery.targets.map((t) => t.target), excludedTargets: run.discovery.excluded.map((t) => t.target),
    globalListeners: run.discovery.globalListeners, scenarios: run.scenarios, deepDived: run.deepDived, sentinelReferenceMs: run.sentinelReference, loads: run.loads,
    ...(run.incomplete === undefined ? {} : { incomplete: run.incomplete }),
  };
}

async function entityMapFrom(path: string | undefined): Promise<EntityMap> {
  return path === undefined ? { entities: [] } : loadEntityMap(path);
}

export async function analyseCommand(url: string, options: AnalyseOptions): Promise<string> {
  const startedAt = new Date().toISOString();
  const store = new RunStore(options.out);
  await store.init();
  const field = options.field ? await buildFieldSummary(url, readGoogleApiKey()) : undefined;
  if (field !== undefined) await store.writeJson('field.json', field);
  const base: Condition = { device: options.device, cpuRate: options.cpu, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };
  const condition: Condition = options.consentState === undefined ? base : { ...base, consent: 'accept', consentState: await loadConsentState(options.consentState) };
  const run = await analyse({
    url, condition, phases: options.phases, seed: options.seed, budgetMs: options.budgetMinutes * 60_000, quick: options.quick, maxTargets: options.maxTargets,
    minLoadIntervalMs: options.minLoadIntervalSeconds * 1000, entityMap: await entityMapFrom(options.entityMap),
    guardPolicy: { allowMutations: options.allowMutations === undefined ? null : new RegExp(options.allowMutations) },
    ...(options.hostResolverRules === undefined ? {} : { hostResolverRules: options.hostResolverRules }),
    ...(options.proxyServer === undefined ? {} : { proxyServer: options.proxyServer }),
    ...(options.maxLoad === undefined ? {} : { maxLoad: options.maxLoad }),
  }, store);
  const meta = toMeta(url, run, { seed: options.seed, condition, startedAt });
  await store.writeJson('meta.json', meta);
  const report = buildReport({ meta, records: await store.readAll(), ...(field === undefined ? {} : { field }), tool: TOOL });
  await writeReports(store, report);
  return join(options.out, 'report.json');
}
