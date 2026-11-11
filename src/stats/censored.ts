/**
 * Censored INP values. Event Timing only reports interactions with duration >= durationThreshold (min 16 ms,
 * https://w3c.github.io/event-timing/#dom-performanceobservercallbackoptions-durationthreshold); a run without
 * an entry is "below threshold", a real but unknown value, never dropped (ticket 0001, "Isolation & timing").
 *
 * Rule: every censored run becomes the same placeholder value thresholdMs / 2 (midpoint of [0, threshold)).
 * All censored runs are therefore TIED with each other at the LOWEST rank, strictly below every measured value
 * (validated: a measured value <= placeholder throws). Rank statistics (order-statistic CIs, Mann-Whitney,
 * Wilcoxon, Cliff's delta) are then exact for this ordering. An estimate or CI bound that equals placeholderMs
 * must be reported as "< thresholdMs", never as the placeholder number.
 */

/** Sentinel for "no Event Timing entry at the observation threshold" in a numeric sample. */
export const CENSORED_SENTINEL = -1;

export interface CensoredInput {
  /** Measured latencies in ms, with CENSORED_SENTINEL for censored runs. */
  readonly values: readonly number[];
  readonly thresholdMs: number;
}

export interface RankableSample {
  readonly values: readonly number[];
  readonly censoredCount: number;
  readonly placeholderMs: number;
}

export function censoredAsLowestTies(input: CensoredInput): RankableSample {
  const { values, thresholdMs } = input;
  if (!(Number.isFinite(thresholdMs) && thresholdMs > 0)) throw new Error(`censoredAsLowestTies: thresholdMs must be > 0, got ${thresholdMs}`);
  if (values.length === 0) throw new Error('censoredAsLowestTies: sample is empty');
  const placeholderMs = thresholdMs / 2;
  const resolved = values.map((value, index) => {
    if (value === CENSORED_SENTINEL) return placeholderMs;
    if (!Number.isFinite(value) || value <= placeholderMs) {
      throw new Error(`censoredAsLowestTies: value at index ${index} (${value}) is not a measured latency above ${placeholderMs} ms`);
    }
    return value;
  });
  return { values: resolved, censoredCount: values.filter((v) => v === CENSORED_SENTINEL).length, placeholderMs };
}

/** True when a reported number is the censoring placeholder and must be shown as "< threshold". */
export function isCensoredPlaceholder(value: number, sample: RankableSample): boolean {
  return sample.censoredCount > 0 && value === sample.placeholderMs;
}
