import type { ScriptCost, TimingPhase } from '../model/measurement.js';
import type { EntityResolver } from './entities.js';
import type { TraceInteraction } from './interactions.js';
import { toMs } from './main-thread.js';
import type { ParsedTrace, Trace } from './trace-engine-adapter.js';
import { distributeOverPhases, interactionSpan, overlap, phaseSpans } from './windows.js';

type RendererThread = Trace.Handlers.ModelHandlers.Renderer.RendererThread;
type ProfileCall = Trace.Types.Events.SyntheticProfileCall;

export interface ScriptCostContext {
  readonly parsed: ParsedTrace;
  readonly thread: RendererThread;
  readonly entities: EntityResolver;
}

function keyOf(call: ProfileCall, phase: TimingPhase): string {
  const f = call.callFrame;
  return `${f.url}|${f.functionName}|${f.lineNumber}|${f.columnNumber}|${phase}`;
}

function toCost(call: ProfileCall, phase: TimingPhase, ctx: ScriptCostContext): ScriptCost {
  const f = call.callFrame;
  const entity = ctx.entities.forEvent(call, f.url);
  return {
    url: f.url, entity: entity.name, isFirstParty: entity.isFirstParty,
    functionName: f.functionName === '' ? '(anonymous)' : f.functionName,
    line: f.lineNumber + 1, column: f.columnNumber + 1,
    selfMs: 0, phase, invokerType: 'unknown', invoker: '',
  };
}

interface Share { readonly call: ProfileCall; readonly phase: TimingPhase; readonly ms: number }

function addShare(acc: Map<string, ScriptCost>, share: Share, ctx: ScriptCostContext): void {
  const key = keyOf(share.call, share.phase);
  const prev = acc.get(key) ?? toCost(share.call, share.phase, ctx);
  acc.set(key, { ...prev, selfMs: prev.selfMs + share.ms });
}

/**
 * JS self time (CPU-profile samples, the DevTools bottom-up view) inside the interaction, split by phase.
 * Needs the disabled-by-default-v8.cpu_profiler trace category; returns [] when the trace has no samples.
 */
export function scriptCosts(interaction: TraceInteraction, ctx: ScriptCostContext): ScriptCost[] {
  const window = interactionSpan(interaction);
  const phases = phaseSpans(interaction);
  const acc = new Map<string, ScriptCost>();
  for (const call of ctx.thread.profileCalls) {
    const span = { start: call.ts, end: call.ts + (call.dur ?? 0) };
    if (overlap(span, window) === 0) continue;
    const self = ctx.parsed.data.Renderer.entryToNode.get(call)?.selfTime ?? 0;
    for (const [phase, micros] of distributeOverPhases(span, self, phases)) addShare(acc, { call, phase, ms: toMs(micros) }, ctx);
  }
  return [...acc.values()].filter((c) => c.selfMs >= 0.5).toSorted((a, b) => b.selfMs - a.selfMs);
}
