import type { RunRecord } from '../model/run.js';
import type { Scenario } from '../model/scenario.js';
import { cliffsDelta, type CliffMagnitude } from '../stats/cliffs-delta.js';
import { median } from '../stats/descriptive.js';
import { hodgesLehmannShift } from '../stats/hodges-lehmann.js';
import { holmAdjust } from '../stats/holm.js';
import { mannWhitney } from '../stats/mann-whitney.js';

/** Fewer runs per arm cannot carry a two-sample comparison worth reporting. */
export const COMPARISON_MIN_RUNS = 5;
export const ALPHA = 0.05;

export interface Comparison {
  readonly kind: 'phase' | 'third-party';
  readonly label: string;
  readonly baselineScenarioId: string;
  readonly variantScenarioId: string;
  readonly nBaseline: number;
  readonly nVariant: number;
  readonly medianBaselineMs: number;
  readonly medianVariantMs: number;
  /** Hodges-Lehmann shift variant - baseline in ms with 95% CI (positive = variant slower). */
  readonly shift: { readonly estimate: number; readonly low: number; readonly high: number };
  readonly p: number;
  readonly pHolm: number;
  readonly cliffsDelta: number;
  readonly magnitude: CliffMagnitude;
  /** Holm-adjusted p < 0.05 and the shift CI excludes 0. */
  readonly significant: boolean;
  readonly confounded?: string;
}

export type ComparisonDraft = Omit<Comparison, 'pHolm' | 'significant'>;

export function durationsOf(records: readonly RunRecord[], scenarioId: string): number[] {
  return records.flatMap((r) => (r.scenarioId === scenarioId && r.excluded === undefined && r.outcome.kind === 'measured' ? [r.outcome.timing.durationExact] : []));
}

export function compareSamples(meta: Pick<Comparison, 'kind' | 'label' | 'baselineScenarioId' | 'variantScenarioId'>, baseline: readonly number[], variant: readonly number[]): ComparisonDraft | undefined {
  if (baseline.length < COMPARISON_MIN_RUNS || variant.length < COMPARISON_MIN_RUNS) return undefined;
  const shift = hodgesLehmannShift(baseline, variant);
  const delta = cliffsDelta(variant, baseline);
  return {
    ...meta, nBaseline: baseline.length, nVariant: variant.length, medianBaselineMs: median(baseline), medianVariantMs: median(variant),
    shift: { estimate: shift.estimate, low: shift.low, high: shift.high }, p: mannWhitney(baseline, variant).p, cliffsDelta: delta.delta, magnitude: delta.magnitude,
  };
}

/** Holm over every confirmatory test of one report (as R p.adjust "holm": https://github.com/wch/r-source/blob/trunk/src/library/stats/R/p.adjust.R). */
export function finaliseComparisons(drafts: readonly ComparisonDraft[]): Comparison[] {
  if (drafts.length === 0) return [];
  const adjusted = holmAdjust(drafts.map((d) => d.p));
  return drafts.map((d, i) => {
    const pHolm = adjusted[i] ?? 1;
    return { ...d, pHolm, significant: pHolm < ALPHA && (d.shift.low > 0 || d.shift.high < 0) };
  });
}

/** The same target tapped during boot vs when idle (boot-vs-idle method, automated). */
export function phaseComparisons(scenarios: readonly Scenario[], records: readonly RunRecord[]): ComparisonDraft[] {
  const idle = new Map(scenarios.filter((s) => s.phase === 'idle').map((s) => [s.targetId, s]));
  return scenarios.filter((s) => s.phase === 'boot').flatMap((boot) => {
    const base = idle.get(boot.targetId);
    if (base === undefined) return [];
    const meta = { kind: 'phase' as const, label: `${boot.targetId}: boot @${boot.offsetMs ?? 0} ms vs idle`, baselineScenarioId: base.id, variantScenarioId: boot.id };
    return compareSamples(meta, durationsOf(records, base.id), durationsOf(records, boot.id)) ?? [];
  });
}
