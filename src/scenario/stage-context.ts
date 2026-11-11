import type { RunRecord } from '../model/run.js';
import type { Scenario, Target } from '../model/scenario.js';
import type { BlockDeps, BlockRun } from './block-runner.js';
import { runBlock } from './block-runner.js';
import { summariseScenario, type ScenarioSummary } from './summarise.js';

/** Shared state of one analysis while stages run; records are appended to the store as blocks finish. */
export interface StageContext {
  readonly deps: BlockDeps;
  readonly targets: ReadonlyMap<string, Target>;
  readonly random: () => number;
  readonly deadline: number;
  readonly records: RunRecord[];
  incomplete?: string;
}

export function targetOf(ctx: StageContext, scenario: Scenario): Target {
  const target = ctx.targets.get(scenario.targetId);
  if (target === undefined) throw new Error(`[stages] scenario ${scenario.id} references unknown target ${scenario.targetId}`);
  return target;
}

/** Runs a block unless the budget is spent; returns false when the stage must stop. */
export async function runBudgetedBlock(ctx: StageContext, runs: readonly BlockRun[]): Promise<boolean> {
  if (Date.now() >= ctx.deadline) {
    ctx.incomplete ??= `time budget reached before ${runs[0]?.stage ?? 'a'} block ${runs[0]?.block ?? 0}`;
    return false;
  }
  const results = await runBlock(runs, ctx.deps);
  ctx.records.push(...results.map((r) => r.record));
  return true;
}

/** Statistics only ever use runs from valid blocks. */
export function validRecords(ctx: StageContext): RunRecord[] {
  return ctx.records.filter((r) => r.excluded === undefined);
}

export function summaries(ctx: StageContext, scenarios: readonly Scenario[]): ScenarioSummary[] {
  const valid = validRecords(ctx);
  return scenarios.map((s) => summariseScenario(s.id, valid));
}
