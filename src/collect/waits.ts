import { TimeoutError, type Page } from 'puppeteer-core';
import type { PageFacts } from '../model/run.js';
import { collectPageFacts } from './in-page-page-facts.js';
import type { InpStore } from './in-page-store.js';

const POLL_MS = 200;

/** Resolves false only on puppeteer's timeout; every other error propagates. */
async function untilTrue(wait: Promise<unknown>): Promise<boolean> {
  try {
    await wait;
    return true;
  } catch (error) {
    if (error instanceof TimeoutError) return false;
    throw error;
  }
}

export interface QuietOptions { readonly quietMs: number; readonly capMs: number }

/** True once no long animation frame (>50 ms, LoAF) has ended within the last `quietMs`; false at the cap. */
export async function waitForMainThreadQuiet(page: Page, options: QuietOptions): Promise<boolean> {
  return untilTrue(page.waitForFunction(
    (quietMs) => {
      const last = window.inpAnalyserStore.frames.at(-1);
      const lastEnd = last === undefined ? 0 : last.startTime + last.duration;
      return performance.now() - lastEnd >= quietMs;
    },
    { timeout: options.capMs, polling: POLL_MS },
    options.quietMs,
  ));
}

/** True once an Event Timing entry with an interactionId and startTime >= sinceMs (page clock) exists. */
export async function waitForInteraction(page: Page, sinceMs: number, capMs: number): Promise<boolean> {
  return untilTrue(page.waitForFunction(
    (since) => window.inpAnalyserStore.events.some((e) => e.interactionId > 0 && e.startTime >= since),
    { timeout: capMs, polling: POLL_MS },
    sinceMs,
  ));
}

export async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

export interface StoreSnapshot extends Omit<InpStore, 'targets'> {
  /** For each interactionId: does its event target lie inside the expected selector? */
  readonly hits: Readonly<Record<number, boolean>>;
  readonly page: PageFacts;
}

export async function readStore(page: Page, expectedSelector: string): Promise<StoreSnapshot> {
  const facts = await page.evaluate(collectPageFacts);
  const store = await page.evaluate((selector) => {
    const s = window.inpAnalyserStore;
    const hits: Record<number, boolean> = {};
    if (!selector.includes('>>>')) {
      for (const [id, ref] of s.targets) hits[id] = ref.deref()?.closest(selector) !== null && ref.deref() !== undefined;
      return { events: s.events, frames: s.frames, errors: s.errors, mutations: s.mutations, hits };
    }
    // Deep selector (`host >>> inner`, open shadow roots): closest() throws on `>>>`. Resolve the expected
    // element inline (no named helpers: tsx keepNames would inject __name), then walk the composed tree up from
    // the event target. A target retargeted to the shadow host counts when the expected element lives inside it.
    let scope: Document | ShadowRoot | null = document;
    let expected: Element | null = null;
    for (const part of selector.split('>>>')) {
      expected = scope === null ? null : scope.querySelector(part.trim());
      if (expected === null) break;
      scope = expected.shadowRoot;
    }
    for (const [id, ref] of s.targets) {
      const target = ref.deref();
      let hit = false;
      if (target !== undefined && expected !== null) {
        // target inside expected (composed tree)
        for (let node: Node | null = target; node !== null && !hit; node = node instanceof ShadowRoot ? node.host : node.parentNode) hit = node === expected;
        // target is a shadow host the event was retargeted to, and expected lives inside it
        for (let node: Node | null = expected; target.shadowRoot !== null && node !== null && !hit; node = node instanceof ShadowRoot ? node.host : node.parentNode) hit = node === target;
      }
      hits[id] = hit;
    }
    return { events: s.events, frames: s.frames, errors: s.errors, mutations: s.mutations, hits };
  }, expectedSelector);
  return { ...store, page: facts };
}
