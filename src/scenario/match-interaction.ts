import type { TraceInteraction } from '../analysis/interactions.js';

/** A scheduled tap and its Event Timing timestamp differ by dispatch latency; beyond this it is another interaction. */
export const MATCH_TOLERANCE_MS = 150;

/**
 * The trace interaction caused by our input: closest start time to the expected one (both ms since navigation
 * start), never earlier than the input minus tolerance and never later than the tolerance window.
 */
export function matchInteraction(candidates: readonly TraceInteraction[], expectedStartMs: number): TraceInteraction | undefined {
  let best: TraceInteraction | undefined;
  for (const c of candidates) {
    if (c.origin.kind !== 'navigation') continue;
    const distance = Math.abs(c.timing.startTime - expectedStartMs);
    if (distance > MATCH_TOLERANCE_MS) continue;
    if (best === undefined || distance < Math.abs(best.timing.startTime - expectedStartMs)) best = c;
  }
  return best;
}
