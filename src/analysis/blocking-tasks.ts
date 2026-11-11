import type { LongTask } from '../model/measurement.js';
import type { EntityResolver } from './entities.js';
import type { TraceInteraction } from './interactions.js';
import { toMs } from './main-thread.js';
import { Trace, type ParsedTrace } from './trace-engine-adapter.js';
import { overlap, type Span } from './windows.js';

type RendererThread = Trace.Handlers.ModelHandlers.Renderer.RendererThread;
type TreeNode = Trace.Helpers.TreeHelpers.TraceEntryNode;

/** A task over 50 ms is a long task: devtools-frontend WarningsHandler LONG_MAIN_THREAD_TASK_THRESHOLD. */
export const LONG_TASK_THRESHOLD_MS = 50;

function heaviestScript(root: TreeNode | undefined): { url: string; event: Trace.Types.Events.Event } | undefined {
  let best: { url: string; event: Trace.Types.Events.Event; self: number } | undefined;
  const stack: TreeNode[] = root === undefined ? [] : [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    const entry = node.entry;
    if (Trace.Types.Events.isProfileCall(entry) && entry.callFrame.url !== '' && (node.selfTime ?? 0) > (best?.self ?? -1)) {
      best = { url: entry.callFrame.url, event: entry, self: node.selfTime ?? 0 };
    }
    stack.push(...node.children);
  }
  return best;
}

function toLongTask(event: Trace.Types.Events.RunTask, originTs: number, ctx: BlockingContext): LongTask {
  const script = heaviestScript(ctx.parsed.data.Renderer.entryToNode.get(event));
  const entity = script === undefined ? { name: '(no JS samples)', isFirstParty: false } : ctx.entities.forEvent(script.event, script.url);
  return { startTime: toMs(event.ts - originTs), durationMs: toMs(event.dur), topScriptUrl: script?.url ?? '', entity: entity.name, isFirstParty: entity.isFirstParty };
}

/** All long tasks of the main frame, startTime relative to `originTs` (navigation start): the hazard timeline. */
export function allLongTasks(originTs: number, ctx: BlockingContext): LongTask[] {
  return ctx.thread.entries.flatMap((event) => (Trace.Types.Events.isRunTask(event) && toMs(event.dur) > LONG_TASK_THRESHOLD_MS ? [toLongTask(event, originTs, ctx)] : []));
}

export interface BlockingContext {
  readonly parsed: ParsedTrace;
  readonly thread: RendererThread;
  readonly entities: EntityResolver;
}

/**
 * Long tasks that ran while the input waited (between event timestamp and processingStart) -
 * the cause of input delay (https://web.dev/articles/optimize-input-delay). startTime is relative to the interaction.
 */
export function blockingTasks(interaction: TraceInteraction, ctx: BlockingContext): LongTask[] {
  const delay: Span = { start: interaction.ts, end: interaction.processingStartTs };
  const tasks: LongTask[] = [];
  for (const event of ctx.thread.entries) {
    if (!Trace.Types.Events.isRunTask(event)) continue;
    const span = { start: event.ts, end: event.ts + event.dur };
    if (toMs(event.dur) <= LONG_TASK_THRESHOLD_MS || overlap(span, delay) === 0 || span.start >= delay.end) continue;
    tasks.push(toLongTask(event, interaction.ts, ctx));
  }
  return tasks;
}
