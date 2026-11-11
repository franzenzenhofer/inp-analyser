import type { RunRecord } from '../model/run.js';
import type { MeasuredRun } from './types.js';

/** Attribution-mode runs with a measured interaction: the only runs rules are evaluated on. */
export function measuredAttributionRuns(records: readonly RunRecord[]): MeasuredRun[] {
  return records.flatMap((record) => {
    if (record.mode !== 'attribution' || record.outcome.kind !== 'measured' || record.attribution === undefined) return [];
    const base = { record, timing: record.outcome.timing, attribution: record.attribution };
    return [record.page === undefined ? base : { ...base, page: record.page }];
  });
}

/** Exact durations of all measured runs of a scenario (timing and attribution mode). */
export function measuredDurations(records: readonly RunRecord[]): number[] {
  return records.flatMap((r) => (r.outcome.kind === 'measured' ? [r.outcome.timing.durationExact] : []));
}
