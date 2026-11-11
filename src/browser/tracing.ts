import type { Page } from 'puppeteer-core';
import type { RunMode } from '../model/scenario.js';
import type { TraceEvent } from '../analysis/trace-engine-adapter.js';

/**
 * Lean categories for timing runs: enough for EventTiming, tasks, style/layout/paint - low overhead.
 * Full categories for attribution runs = DevTools DefaultCategories + JS sampling. invalidationTracking is left out:
 * on large DOMs it floods the trace buffer and Chrome drops the interaction itself (test-site style-recalc).
 * https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/trace/types/TraceEvents.ts
 */
const LEAN_CATEGORIES: readonly string[] = [
  '-*', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing', 'loading', 'latency', 'navigation', 'rail',
];

const FULL_CATEGORIES: readonly string[] = [
  ...LEAN_CATEGORIES, 'blink.console', 'v8.execute', 'v8', 'cppgc',
  'disabled-by-default-devtools.target-rundown', 'disabled-by-default-devtools.timeline.stack',
  'disabled-by-default-devtools.v8-source-rundown', 'disabled-by-default-devtools.v8-source-rundown-sources',
  'disabled-by-default-layout_shift.debug', 'disabled-by-default-v8.inspector',
  'disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires',
];

export function categoriesFor(mode: RunMode): readonly string[] {
  return mode === 'attribution' ? FULL_CATEGORIES : LEAN_CATEGORIES;
}

export async function startTrace(page: Page, mode: RunMode): Promise<void> {
  await page.tracing.start({ categories: [...categoriesFor(mode)] });
}

function parseTraceBuffer(buffer: Uint8Array): TraceEvent[] {
  const json: unknown = JSON.parse(new TextDecoder().decode(buffer));
  if (typeof json === 'object' && json !== null && 'traceEvents' in json && Array.isArray(json.traceEvents)) {
    return json.traceEvents.filter((e): e is TraceEvent => typeof e === 'object' && e !== null && 'name' in e && 'ph' in e);
  }
  throw new Error('[tracing] Chrome returned a trace without traceEvents');
}

export async function stopTrace(page: Page): Promise<TraceEvent[]> {
  const buffer = await page.tracing.stop();
  if (buffer === undefined) {
    throw new Error('[tracing] page.tracing.stop() returned no data');
  }
  return parseTraceBuffer(buffer);
}
