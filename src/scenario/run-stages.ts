import type { RunMode, Scenario, Stage } from '../model/scenario.js';
import { precisionReached } from '../stats/stopping.js';
import { shuffled } from './random.js';
import { sequential } from './sequential.js';
import { runBudgetedBlock, summaries, targetOf, validRecords, type StageContext } from './stage-context.js';
import { ATTRIBUTION_RUNS, blockOrder, DEEP_BLOCK_RUNS, DEEP_MAX_RUNS, DEEP_MIN_RUNS, SCREENING_RUNS, selectDeepDive } from './stages.js';

function runsFor(ctx: StageContext, list: readonly Scenario[], meta: { stage: Stage; block: number; mode: RunMode }) {
  return list.map((scenario) => ({ scenario, target: targetOf(ctx, scenario), ...meta }));
}

/** Stage 1: 3 interleaved blocks; block 0 in attribution mode so every scenario has at least one explained run. */
export async function runScreening(ctx: StageContext, scenarios: readonly Scenario[]): Promise<void> {
  const order = blockOrder(scenarios, SCREENING_RUNS, ctx.random);
  const blocks = Array.from({ length: SCREENING_RUNS }, (_, b) => order.filter((r) => r.block === b).map((r) => r.scenario));
  await sequential(blocks, (list, block) => runBudgetedBlock(ctx, runsFor(ctx, list, { stage: 'screening', block, mode: block === 0 ? 'attribution' : 'timing' })));
}

function timingValues(ctx: StageContext, scenarioId: string): number[] {
  return validRecords(ctx).flatMap((r) => (r.scenarioId === scenarioId && r.mode === 'timing' && r.outcome.kind === 'measured' ? [r.outcome.timing.durationExact] : []));
}

function stillOpen(ctx: StageContext, scenario: Scenario): boolean {
  const values = timingValues(ctx, scenario.id);
  if (values.length < DEEP_MIN_RUNS) return true;
  return values.length < DEEP_MAX_RUNS && !precisionReached({ values }).stop;
}

async function deepTimingBlocks(ctx: StageContext, selected: readonly Scenario[], block: number): Promise<void> {
  const open = selected.filter((s) => stillOpen(ctx, s));
  if (open.length === 0) return;
  const rounds = Array.from({ length: DEEP_BLOCK_RUNS }, () => shuffled(open, ctx.random)).flat();
  if (!(await runBudgetedBlock(ctx, runsFor(ctx, rounds, { stage: 'deep-dive', block, mode: 'timing' })))) return;
  await deepTimingBlocks(ctx, selected, block + 1);
}

/** Stage 2: timing blocks until each scenario's median CI is narrow enough, then attribution runs. */
export async function runDeepDive(ctx: StageContext, scenarios: readonly Scenario[]): Promise<Scenario[]> {
  const ids = new Set(selectDeepDive(summaries(ctx, scenarios)));
  // A deep-dived boot scenario brings its idle twin along: the boot-vs-idle comparison needs >= 5 runs per arm.
  const bootTargets = new Set(scenarios.filter((s) => ids.has(s.id) && s.phase === 'boot').map((s) => s.targetId));
  const selected = scenarios.filter((s) => ids.has(s.id) || (s.phase === 'idle' && bootTargets.has(s.targetId)));
  console.log(`[stages] deep-dive on ${selected.length} of ${scenarios.length} scenarios`);
  if (selected.length === 0) return [];
  await deepTimingBlocks(ctx, selected, 100);
  const attributionRounds = Array.from({ length: ATTRIBUTION_RUNS }, () => shuffled(selected, ctx.random)).flat();
  await runBudgetedBlock(ctx, runsFor(ctx, attributionRounds, { stage: 'deep-dive', block: 200, mode: 'attribution' }));
  return selected;
}
