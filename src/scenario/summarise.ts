import type { RunRecord } from '../model/run.js';
import { max, median, min } from '../stats/descriptive.js';
import { medianCi, type OrderStatisticCi } from '../stats/order-ci.js';

/**
 * Smallest n with a distribution-free 95% median CI: 2 * 0.5^n < 0.05 -> n = 6.
 * Below it the report shows the range only (src/stats/order-ci.ts).
 */
export const MEDIAN_CI_MIN_RUNS = 6;

export interface ScenarioSummary {
  readonly scenarioId: string;
  readonly runs: number;
  readonly measured: number;
  /** Exact interaction durations (ms) of measured runs. */
  readonly values: readonly number[];
  readonly median?: number;
  readonly min?: number;
  readonly max?: number;
  readonly medianCi?: OrderStatisticCi;
  readonly outcomes: Readonly<Record<string, number>>;
}

function countOutcomes(records: readonly RunRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.outcome.kind] = (counts[r.outcome.kind] ?? 0) + 1;
  return counts;
}

export function summariseScenario(scenarioId: string, records: readonly RunRecord[]): ScenarioSummary {
  const own = records.filter((r) => r.scenarioId === scenarioId);
  const values = own.flatMap((r) => (r.outcome.kind === 'measured' ? [r.outcome.timing.durationExact] : []));
  const base = { scenarioId, runs: own.length, measured: values.length, values, outcomes: countOutcomes(own) };
  if (values.length === 0) return base;
  const range = { median: median(values), min: min(values), max: max(values) };
  return values.length >= MEDIAN_CI_MIN_RUNS ? { ...base, ...range, medianCi: medianCi(values) } : { ...base, ...range };
}
