import type { RunRecord } from '../model/run.js';
import type { Scenario } from '../model/scenario.js';
import { median } from '../stats/descriptive.js';
import { baseScenarioId, VARIANT_SEPARATOR } from '../scenario/causal-plan.js';
import { compareSamples, type ComparisonDraft } from './comparisons.js';

function causalRuns(records: readonly RunRecord[], scenarioId: string, mode: 'timing' | 'attribution'): RunRecord[] {
  return records.filter((r) => r.scenarioId === scenarioId && r.stage === 'causal' && r.mode === mode && r.excluded === undefined);
}

function durations(records: readonly RunRecord[]): number[] {
  return records.flatMap((r) => (r.outcome.kind === 'measured' ? [r.outcome.timing.durationExact] : []));
}

function mutations(runs: readonly RunRecord[]): number[] {
  return runs.flatMap((r) => (r.attribution?.live === undefined ? [] : [r.attribution.live.mutationsAfterInput]));
}

/**
 * Blocking a third party is not a clean experiment when first-party code depended on it: new page exceptions,
 * or the interaction doing far less DOM work, mean "faster" may only be "broken" (plan, stage 3).
 */
export function confounding(base: readonly RunRecord[], variant: readonly RunRecord[]): string | undefined {
  const known = new Set(base.flatMap((r) => r.pageExceptions));
  const fresh = [...new Set(variant.flatMap((r) => r.pageExceptions).filter((e) => !known.has(e)))];
  if (fresh.length > 0) return `blocking caused page exceptions: ${fresh.slice(0, 3).join(' | ')}`;
  const [b, v] = [mutations(base), mutations(variant)];
  if (b.length === 0 || v.length === 0) return undefined;
  return median(b) > 0 && median(v) < 0.5 * median(b) ? `blocking cut the interaction's DOM changes from ${median(b)} to ${median(v)} nodes` : undefined;
}

/** Third-party arm vs its base scenario, causal-stage runs only (paired blocks, same time window). */
export function thirdPartyComparisons(scenarios: readonly Scenario[], records: readonly RunRecord[]): ComparisonDraft[] {
  return scenarios.filter((s) => s.id.includes(VARIANT_SEPARATOR)).flatMap((variant) => {
    const baseId = baseScenarioId(variant.id);
    const arm = variant.condition.thirdParty;
    const label = arm.kind === 'block-entity' ? `${baseId}: without ${arm.entity}` : `${baseId}: all third parties blocked`;
    const draft = compareSamples({ kind: 'third-party', label, baselineScenarioId: baseId, variantScenarioId: variant.id }, durations(causalRuns(records, baseId, 'timing')), durations(causalRuns(records, variant.id, 'timing')));
    if (draft === undefined) return [];
    const confounded = confounding(causalRuns(records, baseId, 'attribution'), causalRuns(records, variant.id, 'attribution'));
    return [confounded === undefined ? draft : { ...draft, confounded }];
  });
}
