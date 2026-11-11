import type { TimingPhase } from '../model/measurement.js';
import type { TraceInteraction } from './interactions.js';

/** Trace-clock microsecond interval [start, end). */
export interface Span { readonly start: number; readonly end: number }

export function overlap(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/**
 * Phase spans of one interaction, per Event Timing:
 * input delay = start..processingStart, processing = processingStart..processingEnd,
 * presentation = processingEnd..start+duration (https://w3c.github.io/event-timing/#sec-example).
 */
export function phaseSpans(interaction: TraceInteraction): ReadonlyMap<TimingPhase, Span> {
  return new Map<TimingPhase, Span>([
    ['input-delay', { start: interaction.ts, end: interaction.processingStartTs }],
    ['processing', { start: interaction.processingStartTs, end: interaction.processingEndTs }],
    ['presentation', { start: interaction.processingEndTs, end: interaction.endTs }],
  ]);
}

export function interactionSpan(interaction: TraceInteraction): Span {
  return { start: interaction.ts, end: interaction.endTs };
}

/** Split `amount` of a [start,end) event across the phases it overlaps, proportional to time overlap. */
export function distributeOverPhases(event: Span, amount: number, phases: ReadonlyMap<TimingPhase, Span>): Map<TimingPhase, number> {
  const length = event.end - event.start;
  const shares = new Map<TimingPhase, number>();
  if (length <= 0) return shares;
  for (const [phase, span] of phases) {
    const share = overlap(event, span) / length;
    if (share > 0) shares.set(phase, amount * share);
  }
  return shares;
}
