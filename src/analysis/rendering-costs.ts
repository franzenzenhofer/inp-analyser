import type { RenderingCost } from '../model/measurement.js';
import type { TraceInteraction } from './interactions.js';
import { toMs } from './main-thread.js';
import { Trace, type ParsedTrace, type TraceEvent } from './trace-engine-adapter.js';
import { interactionSpan, overlap } from './windows.js';

type RendererThread = Trace.Handlers.ModelHandlers.Renderer.RendererThread;
type TreeNode = Trace.Helpers.TreeHelpers.TraceEntryNode;
interface Frame { readonly functionName: string; readonly url: string; readonly lineNumber: number }

const { Name } = Trace.Types.Events;
const KIND_BY_NAME = new Map<string, RenderingCost['kind']>([
  [Name.RECALC_STYLE, 'style'], [Name.LAYOUT, 'layout'], [Name.PRE_PAINT, 'paint'],
  [Name.PAINT, 'paint'], [Name.LAYERIZE, 'commit'], [Name.COMMIT, 'commit'],
]);
const MAX_STACK = 6;

function formatFrame(f: Frame): string {
  return `${f.functionName === '' ? '(anonymous)' : f.functionName} (${f.url}:${f.lineNumber + 1})`;
}

/** Style/layout run inside a JS entry point = forced synchronously by script (DevTools ForcedReflow insight). */
function isForced(node: TreeNode | undefined): boolean {
  for (let p = node?.parent; p !== undefined && p !== null; p = p.parent) {
    if (Trace.Types.Events.isJSInvocationEvent(p.entry) || Trace.Types.Events.isProfileCall(p.entry)) return true;
  }
  return false;
}

function profileStack(node: TreeNode | undefined): string[] {
  const frames: string[] = [];
  for (let p = node?.parent; p !== undefined && p !== null && frames.length < MAX_STACK; p = p.parent) {
    if (Trace.Types.Events.isProfileCall(p.entry)) frames.push(formatFrame(p.entry.callFrame));
  }
  return frames;
}

function eventStack(event: TraceEvent, node: TreeNode | undefined): string[] {
  const own = Trace.Types.Events.isLayout(event) || Trace.Types.Events.isRecalcStyle(event) ? event.args.beginData?.stackTrace : undefined;
  return own === undefined || own.length === 0 ? profileStack(node) : own.slice(0, MAX_STACK).map(formatFrame);
}

function details(event: TraceEvent): Pick<RenderingCost, 'elementCount' | 'dirtyObjects' | 'totalObjects'> {
  if (Trace.Types.Events.isRecalcStyle(event)) return { elementCount: event.args.elementCount };
  if (Trace.Types.Events.isLayout(event)) return { dirtyObjects: event.args.beginData.dirtyObjects, totalObjects: event.args.beginData.totalObjects };
  return {};
}

/** Style, layout, paint and commit work on the main thread inside the interaction window. */
export function renderingCosts(interaction: TraceInteraction, parsed: ParsedTrace, thread: RendererThread): RenderingCost[] {
  const window = interactionSpan(interaction);
  const costs: RenderingCost[] = [];
  for (const event of thread.entries) {
    const kind = KIND_BY_NAME.get(event.name);
    if (kind === undefined) continue;
    const ms = toMs(overlap({ start: event.ts, end: event.ts + (event.dur ?? 0) }, window));
    if (ms <= 0) continue;
    const node = parsed.data.Renderer.entryToNode.get(event);
    costs.push({ kind, ms, forced: isForced(node), stack: eventStack(event, node), ...details(event) });
  }
  return costs.toSorted((a, b) => b.ms - a.ms);
}
