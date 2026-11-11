import { medianCi } from './order-ci.js';
import type { OrderStatisticCi } from './order-ci.js';

/**
 * Deep-dive precision stopping rule (ticket 0001, stage 2): stop once the half-width of the exact
 * order-statistic CI of the median, (high - low) / 2, is <= max(absoluteMs, relative * median).
 * Defaults 16 ms (two 8 ms rounding steps of PerformanceEventTiming.duration) and 10 %. Precision rule,
 * not a significance test. Throws (via medianCi) while n is too small to form the CI at all.
 */

export interface StoppingInput {
  readonly values: readonly number[];
  readonly absoluteMs?: number;
  readonly relative?: number;
  readonly confidence?: number;
}

export interface StoppingDecision {
  readonly stop: boolean;
  readonly n: number;
  readonly median: OrderStatisticCi;
  readonly halfWidthMs: number;
  readonly targetHalfWidthMs: number;
}

export function precisionReached(input: StoppingInput): StoppingDecision {
  const absoluteMs = input.absoluteMs ?? 16;
  const relative = input.relative ?? 0.1;
  if (!(absoluteMs >= 0 && relative >= 0)) throw new Error(`precisionReached: thresholds must be >= 0, got ${absoluteMs} ms / ${relative}`);
  const median = medianCi(input.values, input.confidence ?? 0.95);
  const halfWidthMs = (median.high - median.low) / 2;
  const targetHalfWidthMs = Math.max(absoluteMs, relative * median.estimate);
  return { stop: halfWidthMs <= targetHalfWidthMs, n: input.values.length, median, halfWidthMs, targetHalfWidthMs };
}
