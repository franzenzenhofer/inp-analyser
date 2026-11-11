import { performance } from 'node:perf_hooks';
import type { Browser } from 'puppeteer-core';
import { openSession } from '../browser/session.js';
import type { Condition, Target } from '../model/scenario.js';
import { DEFAULT_GUARD_POLICY } from '../safety/request-guard.js';
import { sequential } from './sequential.js';

export type Point = { readonly x: number; readonly y: number };
/** offsetMs -> targetId -> centre point in viewport coordinates at that moment (undefined: not visible yet). */
export type BootGeometry = ReadonlyMap<number, ReadonlyMap<string, Point>>;

/**
 * In the page: centre points of the selectors that are laid out, visible and hit-testable right now.
 * Selectors may cross open shadow roots with puppeteer's deep combinator `host >>> inner` (discovery emits
 * them, e.g. for a consent banner); plain querySelector throws a SyntaxError on `>>>`.
 */
export function pointsNow(selectors: readonly string[]): Array<[string, Point] | null> {
  return selectors.map((selector) => {
    // Deep query inline (no named helper: tsx keepNames would inject a __name() call the page lacks).
    let scope: Document | ShadowRoot | null = document;
    let el: Element | null = null;
    for (const part of selector.split('>>>')) {
      el = scope === null ? null : scope.querySelector(part.trim());
      if (el === null) return null;
      scope = el.shadowRoot;
    }
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) return null;
    const p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const root = el.getRootNode();
    const hit = (root instanceof ShadowRoot ? root : document).elementFromPoint(p.x, p.y);
    return hit !== null && (hit === el || el.contains(hit)) ? [selector, p] : null;
  });
}

/** Before the new document commits there is nothing to tap: an empty sample. Any other error propagates. */
function notCommittedYet(error: unknown): Array<[string, Point] | null> {
  if (error instanceof Error && /Execution context was destroyed|Cannot find context/.test(error.message)) return [];
  throw error;
}

/**
 * One extra load without input: at each boot offset, where is each above-the-fold target laid out?
 * The query waits for a free main thread, so it samples the layout the user sees right after that moment.
 */
export async function bootGeometry(browser: Browser, input: { url: string; condition: Condition; targets: readonly Target[]; offsetsMs: readonly number[] }): Promise<BootGeometry> {
  const targets = input.targets.filter((t) => t.aboveFold);
  const session = await openSession(browser, { condition: input.condition, mode: 'timing', blockedUrlPatterns: [], guardPolicy: DEFAULT_GUARD_POLICY });
  try {
    const start = performance.now();
    const navigation = session.page.goto(input.url, { waitUntil: 'load', timeout: 60_000 });
    // If sampling throws, `finally` closes the session and goto rejects with "Navigating frame was detached";
    // without this handler that unhandled rejection kills the process and hides the real sampling error.
    navigation.catch(() => undefined);
    const samples = await sequential(input.offsetsMs, async (offset) => {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, start + offset - performance.now())));
      const points = await session.page.evaluate(pointsNow, targets.map((t) => t.selector)).catch(notCommittedYet);
      const bySelector = new Map(points.flatMap((p) => (p === null ? [] : [p])));
      return [offset, new Map(targets.flatMap((t) => { const p = bySelector.get(t.selector); return p === undefined ? [] : [[t.id, p] as const]; }))] as const;
    });
    await navigation;
    return new Map(samples);
  } finally {
    await session.close();
  }
}
