import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { DEFAULT_DISCOVER_OPTIONS, discoverTargets, stableTargets } from '../../src/discovery/discover.js';
import type { DiscoveredTarget, DiscoveryResult } from '../../src/discovery/types.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

let site: TestSite;
let browser: Browser;

beforeAll(async () => {
  site = await startTestSite();
  browser = await launchChrome({ hostResolverRules: site.hostResolverRule });
});
afterAll(async () => {
  await browser.close();
  await site.close();
});

async function open(path: string): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(`${site.origin}${path}`, { waitUntil: 'load' });
  return page;
}

function bySelector(result: DiscoveryResult, selector: string): DiscoveredTarget | undefined {
  return [...result.targets, ...result.excluded].find((t) => t.target.selector === selector);
}

function summary(result: DiscoveryResult): string {
  return [...result.targets, ...result.excluded].map((t) => `${t.target.selector} [${t.target.kind}/${t.target.safety} x${t.mergedCount}] ${t.listeners.map((l) => `${l.type}@${l.url}:${l.line}:${l.column}`).join(' ')}`).join('\n');
}

describe('discovery on real pages', () => {
  it('slow-handler: finds #show-details with its click listener location', async () => {
    const page = await open('/slow-handler');
    const result = await discoverTargets(page, DEFAULT_DISCOVER_OPTIONS);
    console.log('[discovery-e2e] slow-handler\n' + summary(result));
    const buy = bySelector(result, 'button#show-details');
    expect(buy?.target.kind).toBe('button');
    expect(buy?.target.safety).toBe('safe');
    expect(buy?.target.aboveFold).toBe(true);
    expect(buy?.listeners).toStrictEqual([expect.objectContaining({ type: 'click', url: `${site.origin}/slow-handler` })]);
    expect(buy?.listeners[0]?.line).toBeGreaterThan(1);
    await page.close();
  });

  it('discovery-repeated: dedupes repeated cards, skips hidden/disabled/covered, classifies danger', async () => {
    const page = await open('/discovery-repeated');
    const result = await discoverTargets(page, { ...DEFAULT_DISCOVER_OPTIONS, maxTargets: 50 });
    console.log('[discovery-e2e] discovery-repeated\n' + summary(result));
    const all = [...result.targets, ...result.excluded];
    const fav = all.filter((t) => t.candidate.domSignature.startsWith('button.fav'));
    const cardOpen = all.filter((t) => t.candidate.domSignature === 'div.card-open');
    expect(fav.map((t) => t.mergedCount)).toStrictEqual([12]);
    expect(cardOpen.map((t) => [t.target.kind, t.mergedCount])).toStrictEqual([['listener', 12]]);
    expect(bySelector(result, 'div#tab-reviews')?.target.kind).toBe('role');
    expect(bySelector(result, 'span#inline-handler')?.listeners.map((l) => l.type)).toStrictEqual(['click']);
    expect(bySelector(result, 'button#apply')?.target.safety).toBe('safe');
    expect(result.excluded.map((t) => t.target.selector)).toStrictEqual(['button#buy-now']);
    const skipped = ['hidden-display', 'hidden-visibility', 'hidden-opacity', 'disabled', 'aria-disabled', 'hidden-input', 'covered'];
    expect(all.filter((t) => skipped.some((id) => t.target.selector.includes(`#${id}`)))).toStrictEqual([]);
    const resolved = await Promise.all(all.map((t) => page.$(t.target.selector)));
    expect(all.filter((_, i) => resolved[i] === null).map((t) => t.target.selector)).toStrictEqual([]);
    await page.close();
  });

  it('modal-and-menu: finds the burger, not the links of the closed menu', async () => {
    const page = await open('/modal-and-menu');
    const result = await discoverTargets(page, DEFAULT_DISCOVER_OPTIONS);
    console.log('[discovery-e2e] modal-and-menu\n' + summary(result));
    expect(bySelector(result, 'button#burger')?.target.kind).toBe('button');
    expect(result.targets.some((t) => t.target.label.startsWith('Section'))).toBe(false);
    await page.close();
  });

  it('consent-shadow-dom: finds the accept button inside the open shadow root; the deep selector clicks it', async () => {
    const page = await open('/consent-shadow-dom');
    const result = await discoverTargets(page, DEFAULT_DISCOVER_OPTIONS);
    console.log('[discovery-e2e] consent-shadow-dom\n' + summary(result));
    const accept = bySelector(result, 'div#consent-host >>> button#consent-accept');
    expect(accept?.target.label).toBe('Accept all');
    expect(accept?.listeners.map((l) => l.type)).toStrictEqual(['click']);
    await page.click('div#consent-host >>> button#consent-accept');
    expect(await page.$eval('#out', (el) => el.textContent)).toBe('accepted');
    await page.close();
  });

  it('3p-global-listener: reports the tag manager document listeners with their third-party script URL', async () => {
    const page = await open('/3p-global-listener');
    await page.waitForFunction("window.thirdPartyLoaded?.includes('tag-manager') === true");
    const result = await discoverTargets(page, DEFAULT_DISCOVER_OPTIONS);
    console.log('[discovery-e2e] 3p-global-listener', JSON.stringify(result.globalListeners));
    const tagManager = result.globalListeners.filter((l) => l.url === `${site.thirdPartyOrigin}/tag-manager.js`);
    expect(tagManager.map((l) => `${l.on}:${l.type}`).toSorted()).toStrictEqual(['document:click', 'document:pointerdown']);
    expect(bySelector(result, 'button#apply-filter')?.target.safety).toBe('safe');
    await page.close();
  });

  it('two independent passes agree on every target (stableTargets)', async () => {
    const page = await open('/discovery-repeated');
    const first = await discoverTargets(page, DEFAULT_DISCOVER_OPTIONS);
    await page.reload({ waitUntil: 'load' });
    const second = await discoverTargets(page, DEFAULT_DISCOVER_OPTIONS);
    const stable = stableTargets(first.targets, second.targets);
    expect(stable.map((t) => t.target.id)).toStrictEqual(first.targets.map((t) => t.target.id));
    expect(stable.length).toBeGreaterThanOrEqual(5);
    await page.close();
  });
});
