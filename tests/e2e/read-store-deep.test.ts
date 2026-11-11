import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { openSession } from '../../src/browser/session.js';
import { readStore, waitForInteraction } from '../../src/collect/waits.js';
import type { Condition } from '../../src/model/scenario.js';
import { DEFAULT_GUARD_POLICY } from '../../src/safety/request-guard.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

/**
 * Regression: discovery emits deep selectors (`host >>> inner`) for a consent banner in an
 * open shadow root. readStore used Element.closest(selector), which throws a SyntaxError on `>>>` as soon as
 * the store holds any interaction target - every such run failed.
 */
let site: TestSite;
let browser: Browser;
const condition: Condition = { device: 'mobile', cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };

beforeAll(async () => {
  site = await startTestSite();
  browser = await launchChrome({ hostResolverRules: site.hostResolverRule });
});
afterAll(async () => {
  await browser.close();
  await site.close();
});

async function withSession(path: string, act: (page: Page) => Promise<void>): Promise<void> {
  const session = await openSession(browser, { condition, mode: 'timing', blockedUrlPatterns: [], guardPolicy: DEFAULT_GUARD_POLICY });
  try {
    await session.page.goto(`${site.origin}${path}`, { waitUntil: 'load' });
    await act(session.page);
  } finally {
    await session.close();
  }
}

describe('readStore with deep selectors', () => {
  it('light-DOM target still matches; a deep selector next to it does not throw', async () => {
    await withSession('/slow-handler', async (page) => {
      await page.click('#show-details');
      expect(await waitForInteraction(page, 0, 5_000)).toBe(true);
      expect(Object.values((await readStore(page, '#show-details')).hits)).toContain(true);
      const deep = await readStore(page, '#consent-host >>> #consent-accept');
      expect(Object.keys(deep.hits).length).toBeGreaterThan(0);
      expect(Object.values(deep.hits).every((hit) => !hit)).toBe(true);
    });
  });

});
