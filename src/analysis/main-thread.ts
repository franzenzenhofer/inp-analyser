import type { ParsedTrace, Trace } from './trace-engine-adapter.js';

type RendererThread = Trace.Handlers.ModelHandlers.Renderer.RendererThread;

const MAIN_THREAD_NAME = 'CrRendererMain';

/** The renderer main thread of the main frame - where input, JS, style, layout and paint of the page run. */
export function mainFrameMainThread(parsed: ParsedTrace): RendererThread {
  for (const process of parsed.data.Renderer.processes.values()) {
    if (!process.isOnMainFrame) continue;
    for (const thread of process.threads.values()) {
      if (thread.name === MAIN_THREAD_NAME) return thread;
    }
  }
  throw new Error('[trace] no CrRendererMain thread for the main frame found in trace');
}

export const MICROS_PER_MS = 1000;

export function toMs(micros: number): number {
  return micros / MICROS_PER_MS;
}
