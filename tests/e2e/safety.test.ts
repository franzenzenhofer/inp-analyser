import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { DEFAULT_DISCOVER_OPTIONS, discoverTargets } from '../../src/discovery/discover.js';
import { assertNoBotWall } from '../../src/safety/bot-wall.js';
import { DEFAULT_GUARD_POLICY, installRequestGuard, type RequestGuard } from '../../src/safety/request-guard.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

/** Time for a click's side effects (requests, new tab, download) to show up before asserting their absence. */
const SETTLE_MS = 500;

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

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

/** Clicks one after the other (order matters: each click must settle first) and records the URL after each. */
async function clickEach(page: Page, selectors: readonly string[], urls: string[]): Promise<void> {
  const [first, ...rest] = selectors;
  if (first === undefined) return;
  await page.click(first);
  await settle();
  urls.push(`${first} -> ${page.url()}`);
  await clickEach(page, rest, urls);
}

async function openGuarded(path: string): Promise<{ page: Page; guard: RequestGuard }> {
  const page = await browser.newPage();
  const guard = await installRequestGuard(page, DEFAULT_GUARD_POLICY);
  const response = await page.goto(`${site.origin}${path}`, { waitUntil: 'load' });
  await assertNoBotWall(page, response);
  await guard.arm();
  return { page, guard };
}

describe('production safety guard on navigations.html', () => {
  it('classifies every control, then clicks all of them while armed: nothing leaves, nothing navigates', async () => {
    const pagesBefore = (await browser.pages()).length;
    const { page, guard } = await openGuarded('/navigations');
    const discovery = await discoverTargets(page, { ...DEFAULT_DISCOVER_OPTIONS, maxTargets: 50 });
    const all = [...discovery.targets, ...discovery.excluded];
    const safety = Object.fromEntries(all.map((t) => [t.target.selector, t.target.safety]));
    console.log('[safety-e2e] classes', JSON.stringify(safety));
    expect(safety).toMatchObject({
      'a#tab-link': 'cross-document-navigation', 'a#doc-link': 'cross-document-navigation', 'a#blank-link': 'cross-document-navigation',
      'a#download-link': 'dangerous', 'button#subscribe-submit': 'mutating', 'button#delete-account': 'dangerous',
    });
    const startUrl = page.url();
    const requestsBefore = site.requests.length;
    const clicked = all.map((t) => t.target.selector).filter((s) => s !== 'a#tab-link');
    const urls: string[] = [];
    await clickEach(page, clicked, urls);
    expect(urls).toStrictEqual(clicked.map((s) => `${s} -> ${startUrl}`));
    const served = site.requests.slice(requestsBefore);
    console.log('[safety-e2e] served while armed', JSON.stringify(served), 'guard log', JSON.stringify(guard.log));
    expect(served.filter((r) => !r.startsWith('GET '))).toStrictEqual([]);
    expect(served.filter((r) => r.includes('/download/'))).toStrictEqual([]);
    expect(guard.log.blockedRequests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toStrictEqual(['POST /api/delete']);
    expect(guard.log.cancelledNavigations.map((n) => `${n.method} ${new URL(n.url).pathname}`).toSorted())
      .toStrictEqual(['GET /control', 'GET /download/report.csv', 'POST /api/subscribe']);
    expect(guard.log.closedTabs).toHaveLength(1);
    expect((await browser.pages()).length).toBe(pagesBefore + 1);
    await page.click('a#tab-link');
    await page.waitForFunction(() => document.getElementById('out')?.textContent === 'tab 2');
    expect(page.url()).toBe(`${site.origin}/navigations?tab=2`);
    expect(guard.log.errors).toStrictEqual([]);
    await guard.dispose();
    await page.close();
  });
});

describe('dialogs, bot walls, disarm', () => {
  it('alert() in a handler is dismissed and logged; the handler finishes', async () => {
    const { page, guard } = await openGuarded('/alert-dialog');
    await page.click('#save-draft');
    await page.waitForFunction(() => document.getElementById('out')?.textContent === 'saved');
    expect(guard.log.dialogs).toStrictEqual([{ type: 'alert', message: 'Draft saved' }]);
    await guard.dispose();
    await page.close();
  });

  it('a 403 challenge page fails loud, a normal page passes', async () => {
    const page = await browser.newPage();
    const challenge = await page.goto(`${site.origin}/bot-challenge`, { waitUntil: 'load' });
    await expect(assertNoBotWall(page, challenge)).rejects.toThrow(/bot wall .*HTTP 403, Cloudflare challenge title, Cloudflare #challenge-running/);
    const control = await page.goto(`${site.origin}/control`, { waitUntil: 'load' });
    await expect(assertNoBotWall(page, control)).resolves.toBeUndefined();
    await page.close();
  });

  it('after disarm() navigations go through again', async () => {
    const { page, guard } = await openGuarded('/navigations');
    await guard.disarm();
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('a#doc-link')]);
    expect(page.url()).toBe(`${site.origin}/control`);
    expect(guard.log.cancelledNavigations).toStrictEqual([]);
    await guard.dispose();
    await page.close();
  });
});
