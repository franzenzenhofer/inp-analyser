import type { NonCompositedAnimation } from '../model/measurement.js';
import type { TraceInteraction } from './interactions.js';
import { Trace, type TraceEvent } from './trace-engine-adapter.js';

/**
 * Animations active during the interaction that failed compositing (compositeFailed != 0) and so need
 * main-thread style/layout/paint every frame (https://developer.chrome.com/docs/lighthouse/performance/non-composited-animations).
 * Reads raw Animation events: the engine's AnimationHandler only keeps begin/end pairs, so an infinite
 * animation still running when the trace stops (a spinner) would be lost.
 */
interface AnimationState {
  begin?: { ts: number; name: string; nodeName: string };
  end?: number;
  failure?: { code: number; properties: readonly string[] };
}

/** Animation async events are linked by id2.local (TraceEvents.ts Animation interface). */
function keyOf(event: Trace.Types.Events.Animation): string {
  return event.id2?.local ?? '';
}

function collect(events: readonly TraceEvent[]): Map<string, AnimationState> {
  const states = new Map<string, AnimationState>();
  for (const event of events) {
    if (!Trace.Types.Events.isAnimation(event)) continue;
    const state = states.get(keyOf(event)) ?? {};
    // Real-world production traces carry Animation end events without args.data, although the engine types it as present.
    const args: { readonly data?: Trace.Types.Events.Animation['args']['data'] } = event.args;
    const data = args.data ?? {};
    if (event.ph === Trace.Types.Events.Phase.ASYNC_NESTABLE_START) state.begin = { ts: event.ts, name: data.displayName ?? data.name ?? '(animation)', nodeName: data.nodeName ?? '' };
    if (event.ph === Trace.Types.Events.Phase.ASYNC_NESTABLE_END) state.end = event.ts;
    if ((data.compositeFailed ?? 0) !== 0) state.failure = { code: data.compositeFailed ?? 0, properties: data.unsupportedProperties ?? [] };
    states.set(keyOf(event), state);
  }
  return states;
}

export function nonCompositedAnimations(interaction: TraceInteraction, events: readonly TraceEvent[]): NonCompositedAnimation[] {
  const found: NonCompositedAnimation[] = [];
  for (const state of collect(events).values()) {
    const { begin, failure } = state;
    if (begin === undefined || failure === undefined) continue;
    const active = begin.ts <= interaction.endTs && (state.end === undefined || state.end >= interaction.ts);
    if (active) found.push({ name: begin.name, nodeName: begin.nodeName, failureCode: failure.code, unsupportedProperties: failure.properties });
  }
  return found;
}
