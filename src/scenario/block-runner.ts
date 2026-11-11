import type { BrowserHost } from '../browser/browser-host.js';
import { benchmarkDrift, benchmarkIndex, MAX_BENCHMARK_DRIFT } from '../machine/health.js';
import { judgeSentinel, type SentinelServer } from '../machine/sentinel.js';
import type { MachineSnapshot, RunRecord } from '../model/run.js';
import type { RunMode, Scenario, Stage, Target } from '../model/scenario.js';
import { BotWallError } from '../safety/bot-wall.js';
import type { Politeness } from '../safety/politeness.js';
import type { RunStore } from '../store/jsonl.js';
import { executeRun, type RunPlan, type RunResult } from './execute-run.js';
import { sequential } from './sequential.js';

export interface BlockRun { readonly scenario: Scenario; readonly target: Target; readonly stage: Stage; readonly block: number; readonly mode: RunMode }

export interface BlockDeps {
  /** Relaunches Chrome when it is lost mid analysis; a lost run is retried once in the fresh browser. */
  readonly host: BrowserHost;
  readonly store: RunStore;
  readonly politeness: Politeness;
  readonly sentinel: { readonly server: SentinelServer; readonly reference: readonly number[] };
  readonly plan: Pick<RunPlan, 'url' | 'entityMap' | 'guardPolicy'>;
  readonly blockedUrlPatterns: (scenario: Scenario) => readonly string[];
  readonly nextRunId: () => string;
  readonly machine: (benchmark: number) => MachineSnapshot;
}

function failedRun(run: BlockRun, plan: RunPlan, error: unknown, machine: MachineSnapshot): RunResult {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[block] run ${plan.runId} (${run.scenario.id}) failed: ${reason}`);
  const record: RunRecord = {
    runId: plan.runId, scenarioId: run.scenario.id, stage: run.stage, block: run.block, mode: run.mode, startedAt: new Date().toISOString(),
    chromeVersion: '', outcome: { kind: 'missed', reason: `run error: ${reason}` }, pageExceptions: [], blockedRequests: [], machine, notes: [],
  };
  return { record, traceEvents: [] };
}

/**
 * Write an attribution trace to disk right after its run and drop the events from memory. Holding every trace of a
 * block until the block ends ran Node out of heap on ad-heavy pages (with consent accepted: ~190 MB per trace in memory).
 */
async function persistTrace(result: RunResult, store: RunStore): Promise<RunResult> {
  if (result.record.mode !== 'attribution' || result.traceEvents.length === 0) return { record: result.record, traceEvents: [] };
  const tracePath = await store.saveTrace(result.record.runId, result.traceEvents);
  return { record: { ...result.record, tracePath }, traceEvents: [] };
}

async function runOne(run: BlockRun, deps: BlockDeps, machine: MachineSnapshot): Promise<RunResult> {
  const plan: RunPlan = { ...deps.plan, runId: deps.nextRunId(), scenario: run.scenario, target: run.target, stage: run.stage, block: run.block, mode: run.mode, blockedUrlPatterns: deps.blockedUrlPatterns(run.scenario) };
  const attempt = async (): Promise<RunResult> => {
    await deps.politeness.beforeLoad(plan.url);
    return persistTrace(await executeRun(await deps.host.get(), plan, machine), deps.store);
  };
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof BotWallError) throw error;
    if (!(await deps.host.recover(error))) return failedRun(run, plan, error, machine);
    console.error(`[block] run ${plan.runId} (${run.scenario.id}) lost its browser, retrying once`);
    try {
      return await attempt();
    } catch (retryError) {
      if (retryError instanceof BotWallError) throw retryError;
      return failedRun(run, plan, retryError, machine);
    }
  }
}

async function sentinelValue(deps: BlockDeps, template: BlockRun, machine: MachineSnapshot): Promise<number | undefined> {
  const scenario: Scenario = { id: 'sentinel', targetId: 'sentinel', phase: 'idle', condition: template.scenario.condition };
  const plan: RunPlan = { ...deps.plan, url: deps.sentinel.server.url, runId: `${deps.nextRunId()}-sentinel`, scenario, target: deps.sentinel.server.target, stage: template.stage, block: template.block, mode: 'timing', blockedUrlPatterns: [] };
  try {
    const { record } = await executeRun(await deps.host.get(), plan, machine);
    return record.outcome.kind === 'measured' ? record.outcome.timing.durationExact : undefined;
  } catch (error) {
    // A lost browser invalidates the block (no sentinel value) but never the analysis.
    if (await deps.host.recover(error)) return undefined;
    throw error;
  }
}

/** Why a finished block must not count, or undefined if machine and sentinel stayed stable. */
async function exclusionReason(deps: BlockDeps, before: number, sentinel: number | undefined): Promise<string | undefined> {
  const drift = benchmarkDrift(before, await benchmarkIndex(await deps.host.get()));
  if (drift > MAX_BENCHMARK_DRIFT) return `benchmarkIndex drifted ${(drift * 100).toFixed(1)}% during the block`;
  if (sentinel === undefined) return 'sentinel run produced no measurement';
  const verdict = judgeSentinel(deps.sentinel.reference, sentinel);
  return verdict.valid ? undefined : `sentinel ${Math.round(sentinel)} ms outside ${Math.round(verdict.referenceMs)} +/- ${Math.round(verdict.toleranceMs)} ms`;
}

/** Runs one block sequentially, then gates it on benchmark drift and the sentinel; every record is stored. */
export async function runBlock(runs: readonly BlockRun[], deps: BlockDeps): Promise<RunResult[]> {
  const first = runs[0];
  if (first === undefined) return [];
  const machine = deps.machine(await benchmarkIndex(await deps.host.get()));
  const results = await sequential(runs, (run) => runOne(run, deps, machine));
  const excluded = await exclusionReason(deps, machine.benchmarkIndex, await sentinelValue(deps, first, machine));
  if (excluded !== undefined) console.error(`[block] block ${first.block} (${first.stage}) excluded: ${excluded}`);
  const final = await sequential(results, async (r) => {
    const record: RunRecord = { ...r.record, ...(excluded === undefined ? {} : { excluded }) };
    await deps.store.append(record);
    return { ...r, record };
  });
  return final;
}
