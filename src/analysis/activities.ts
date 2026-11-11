import type { ActivityCost } from '../model/measurement.js';
import type { TraceInteraction } from './interactions.js';
import { toMs } from './main-thread.js';
import { Trace, type ParsedTrace } from './trace-engine-adapter.js';
import { interactionSpan, overlap } from './windows.js';

type RendererThread = Trace.Handlers.ModelHandlers.Renderer.RendererThread;

/** Counted elsewhere: JS samples (script-costs) and rendering events (rendering-costs). */
const COUNTED_ELSEWHERE = new Set<string>([
  Trace.Types.Events.Name.PROFILE_CALL, Trace.Types.Events.Name.RECALC_STYLE, Trace.Types.Events.Name.LAYOUT,
  Trace.Types.Events.Name.PRE_PAINT, Trace.Types.Events.Name.PAINT, Trace.Types.Events.Name.LAYERIZE, Trace.Types.Events.Name.COMMIT,
]);

/** Work done by the measuring tool itself, seen in recordings started while the page was busy. */
const TOOL_ARTIFACTS: ReadonlySet<string> = new Set(['CpuProfiler::StartProfiling', 'TracingStartedInBrowser']);
const ARTIFACT_MIN_MS = 16;

export interface ActivitySummary {
  readonly activities: ActivityCost[];
  readonly measurementArtifacts: string[];
}

/** Main-thread self time per trace event name inside the interaction window (DevTools bottom-up by activity). */
export function activities(interaction: TraceInteraction, parsed: ParsedTrace, thread: RendererThread): ActivitySummary {
  const window = interactionSpan(interaction);
  const byName = new Map<string, number>();
  for (const event of thread.entries) {
    if (COUNTED_ELSEWHERE.has(event.name)) continue;
    const span = { start: event.ts, end: event.ts + (event.dur ?? 0) };
    const o = overlap(span, window);
    if (o === 0) continue;
    const self = parsed.data.Renderer.entryToNode.get(event)?.selfTime ?? 0;
    byName.set(event.name, (byName.get(event.name) ?? 0) + toMs(self) * (o / Math.max(1, span.end - span.start)));
  }
  const list = [...byName].map(([name, ms]) => ({ name, ms })).filter((a) => a.ms >= 1).toSorted((a, b) => b.ms - a.ms);
  return {
    activities: list,
    measurementArtifacts: list.filter((a) => TOOL_ARTIFACTS.has(a.name) && a.ms >= ARTIFACT_MIN_MS).map((a) => `${a.name} ${Math.round(a.ms)} ms`),
  };
}
