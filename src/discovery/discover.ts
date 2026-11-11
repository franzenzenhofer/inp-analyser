import type { Page } from 'puppeteer-core';
import { buildDiscovery } from './build-result.js';
import { collectCandidates, DEFAULT_SCAN_OPTIONS, releaseCandidates } from './collect-candidates.js';
import { collectListeners } from './listeners.js';
import type { DiscoveredTarget, DiscoveryResult, PageScanOptions } from './types.js';

export interface DiscoverOptions {
  readonly maxTargets: number;
  readonly scan: PageScanOptions;
}

export const DEFAULT_MAX_TARGETS = 12;
export const DEFAULT_DISCOVER_OPTIONS: DiscoverOptions = { maxTargets: DEFAULT_MAX_TARGETS, scan: DEFAULT_SCAN_OPTIONS };

/**
 * One discovery pass on the page as it is now: candidates, their own listeners (script URL:line:column),
 * global document/window listeners, safety class, dedupe, ranking. Uses its own CDP session.
 */
export async function discoverTargets(page: Page, options: DiscoverOptions): Promise<DiscoveryResult> {
  const session = await page.createCDPSession();
  try {
    const scan = await collectCandidates(session, options.scan);
    const listeners = await collectListeners(session, scan.nodeObjectIds);
    await releaseCandidates(session);
    const input = { pageUrl: page.url(), candidates: scan.candidates, listeners: listeners.perNode, globalListeners: listeners.global };
    return buildDiscovery(input, options.maxTargets);
  } finally {
    await session.detach();
  }
}

/** Targets found (by selector) in two independent passes; order and data of pass `a` are kept. */
export function stableTargets(a: readonly DiscoveredTarget[], b: readonly DiscoveredTarget[]): readonly DiscoveredTarget[] {
  const inB = new Set(b.map((t) => t.target.selector));
  return a.filter((t) => inB.has(t.target.selector));
}
