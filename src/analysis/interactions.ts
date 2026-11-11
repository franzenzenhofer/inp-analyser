import type { InteractionTiming } from '../model/measurement.js';
import { toMs } from './main-thread.js';
import type { ParsedTrace, Trace } from './trace-engine-adapter.js';

type InteractionPair = Trace.Types.Events.SyntheticInteractionPair;

/** Event Timing durations are reported in 8 ms steps: https://w3c.github.io/event-timing/#sec-performance-event-timing */
export const DURATION_GRANULARITY_MS = 8;

export function roundTo8(ms: number): number {
  return Math.round(ms / DURATION_GRANULARITY_MS) * DURATION_GRANULARITY_MS;
}

export interface TimeOrigin {
  readonly kind: 'navigation' | 'trace-start';
  /** Microseconds, trace clock. */
  readonly ts: number;
}

/** Interaction times are relative to the latest main-frame navigation before them, or the trace start if the trace has none. */
export function timeOriginFor(parsed: ParsedTrace, ts: number): TimeOrigin {
  const navigations = parsed.data.Meta.mainFrameNavigations.filter((n) => n.ts <= ts);
  const last = navigations.at(-1);
  return last === undefined ? { kind: 'trace-start', ts: parsed.data.Meta.traceBounds.min } : { kind: 'navigation', ts: last.ts };
}

function eventTypesById(pairs: readonly InteractionPair[]): Map<number, string[]> {
  const byId = new Map<number, string[]>();
  for (const pair of pairs) {
    const types = byId.get(pair.interactionId) ?? [];
    types.push(pair.type);
    byId.set(pair.interactionId, types);
  }
  return byId;
}

function toTiming(pair: InteractionPair, types: readonly string[], origin: TimeOrigin): InteractionTiming {
  const durationExact = toMs(pair.dur);
  return {
    interactionId: pair.interactionId,
    interactionType: types.some((t) => t.startsWith('key')) ? 'keyboard' : 'pointer',
    eventTypes: types,
    startTime: toMs(pair.ts - origin.ts),
    durationExact,
    durationRounded: roundTo8(durationExact),
    inputDelay: toMs(pair.inputDelay),
    processing: toMs(pair.mainThreadHandling),
    presentationDelay: toMs(pair.presentationDelay),
    backendNodeId: pair.args.data.beginEvent.args.data.nodeId,
  };
}

export interface TraceInteraction {
  readonly timing: InteractionTiming;
  readonly origin: TimeOrigin;
  /** Trace-clock microseconds, for window computations. */
  readonly ts: number;
  readonly processingStartTs: number;
  readonly processingEndTs: number;
  readonly endTs: number;
}

/**
 * The interaction's latency is the longest duration among its events (https://web.dev/articles/inp#whats_in_an_interaction).
 * On touch, pointerdown/pointerup can paint early while the click (same interactionId) runs much later,
 * so grouping must use interactionId, not DevTools' end-time de-nesting alone.
 */
function longestPerInteraction(pairs: readonly InteractionPair[]): InteractionPair[] {
  const longest = new Map<number, InteractionPair>();
  for (const pair of pairs) {
    const prev = longest.get(pair.interactionId);
    if (prev === undefined || pair.dur > prev.dur) longest.set(pair.interactionId, pair);
  }
  return [...longest.values()].toSorted((a, b) => a.ts - b.ts);
}

/** One entry per interactionId: its longest event, with that event's phases (UserInteractionsHandler.ts pairs). */
export function extractInteractions(parsed: ParsedTrace): TraceInteraction[] {
  const data = parsed.data.UserInteractions;
  const types = eventTypesById(data.interactionEvents);
  return longestPerInteraction(data.interactionEvents).map((pair) => {
    const origin = timeOriginFor(parsed, pair.ts);
    return {
      timing: toTiming(pair, types.get(pair.interactionId) ?? [pair.type], origin),
      origin,
      ts: pair.ts,
      processingStartTs: pair.processingStart,
      processingEndTs: pair.processingEnd,
      endTs: pair.ts + pair.dur,
    };
  });
}
