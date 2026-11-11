import type { Scenario } from '../model/scenario.js';
import { baseScenarioId, causalCandidates, variantScenarios } from './causal-plan.js';
import { shuffled } from './random.js';
import { runBudgetedBlock, targetOf, validRecords, type StageContext } from './stage-context.js';

/** Paired blocks: every block runs each base scenario and each 3P-blocked variant once, in random order. */
export const CAUSAL_BLOCKS = 10;
/** Blocks failing the health gate are replaced, up to twice the planned number. */
export const CAUSAL_MAX_BLOCKS = 20;
/** Attribution runs per arm for the confounding check (exceptions, DOM mutations). */
export const CAUSAL_ATTRIBUTION_RUNS = 2;

function runsOf(ctx: StageContext, list: readonly Scenario[], block: number, mode: 'timing' | 'attribution') {
  return list.map((scenario) => ({ scenario, target: targetOf(ctx, scenario), stage: 'causal' as const, block, mode }));
}

function validCausalBlocks(ctx: StageContext): number {
  return new Set(validRecords(ctx).filter((r) => r.stage === 'causal' && r.mode === 'timing').map((r) => r.block)).size;
}

async function pairedBlocks(ctx: StageContext, arms: readonly Scenario[], attempt: number): Promise<void> {
  if (validCausalBlocks(ctx) >= CAUSAL_BLOCKS || attempt >= CAUSAL_MAX_BLOCKS) return;
  if (!(await runBudgetedBlock(ctx, runsOf(ctx, shuffled(arms, ctx.random), 300 + attempt, 'timing')))) return;
  await pairedBlocks(ctx, arms, attempt + 1);
}

/**
 * Stage 3: does blocking third parties (all, or one entity) make the interaction faster? Returns the variant
 * scenarios it measured. Consent managers are never blocked (src/browser/block-third-parties.ts).
 */
export async function runCausal(ctx: StageContext, deepScenarios: readonly Scenario[]): Promise<Scenario[]> {
  const candidates = causalCandidates(deepScenarios, validRecords(ctx));
  const variants = variantScenarios(candidates);
  console.log(`[stages] causal: ${candidates.length} scenario(s) with third-party time, ${variants.length} blocked variant(s)`);
  if (variants.length === 0) return [];
  const bases = deepScenarios.filter((s) => variants.some((v) => baseScenarioId(v.id) === s.id));
  const arms = [...bases, ...variants];
  await pairedBlocks(ctx, arms, 0);
  const attribution = Array.from({ length: CAUSAL_ATTRIBUTION_RUNS }, () => shuffled(arms, ctx.random)).flat();
  await runBudgetedBlock(ctx, runsOf(ctx, attribution, 399, 'attribution'));
  return variants;
}
