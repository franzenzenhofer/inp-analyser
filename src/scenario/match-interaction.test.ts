import { describe, expect, it } from 'vitest';
import type { TraceInteraction } from '../analysis/interactions.js';
import { matchInteraction } from './match-interaction.js';

function interaction(startTime: number, kind: 'navigation' | 'trace-start' = 'navigation'): TraceInteraction {
  return {
    timing: { interactionId: startTime, interactionType: 'pointer', eventTypes: ['click'], startTime, durationExact: 100, durationRounded: 104, inputDelay: 1, processing: 98, presentationDelay: 1 },
    origin: { kind, ts: 0 }, ts: 0, processingStartTs: 0, processingEndTs: 0, endTs: 0,
  };
}

describe('matchInteraction', () => {
  it('picks the interaction closest to the expected start', () => {
    expect(matchInteraction([interaction(900), interaction(1020), interaction(1300)], 1000)?.timing.startTime).toBe(1020);
  });
  it('returns undefined when nothing lies within the tolerance', () => {
    expect(matchInteraction([interaction(500), interaction(1400)], 1000)).toBeUndefined();
  });
  it('ignores interactions not anchored to a navigation', () => {
    expect(matchInteraction([interaction(1000, 'trace-start')], 1000)).toBeUndefined();
  });
});
