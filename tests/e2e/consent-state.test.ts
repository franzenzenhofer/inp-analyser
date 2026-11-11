import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { openSession } from '../../src/browser/session.js';
import type { Condition } from '../../src/model/scenario.js';
import { DEFAULT_GUARD_POLICY } from '../../src/safety/request-guard.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

/** --consent-state: cookies and localStorage exist before the first page script runs, in every fresh context. */
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

describe('consent state seeding', () => {
  it('cookie and localStorage are visible to the page from the first script on', async () => {
    const host = new URL(site.origin).hostname;
    const condition: Condition = {
      device: 'mobile', cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'accept', cache: 'cold',
      consentState: { capturedFrom: 'test', cookies: [{ name: 'uc_consent', value: 'yes', domain: host, path: '/', secure: false, httpOnly: false }], localStorage: { [site.origin]: { uc_settings: '{"accepted":true}' } } },
    };
    const session = await openSession(browser, { condition, mode: 'timing', blockedUrlPatterns: [], guardPolicy: DEFAULT_GUARD_POLICY });
    try {
      await session.page.evaluateOnNewDocument(() => {
        Reflect.set(window, 'seenLs', localStorage.getItem('uc_settings'));
        Reflect.set(window, 'seenCookie', document.cookie);
      });
      await session.page.goto(`${site.origin}/control`, { waitUntil: 'load' });
      const seen = await session.page.evaluate(() => ({ ls: String(Reflect.get(window, 'seenLs')), cookie: String(Reflect.get(window, 'seenCookie')) }));
      expect(seen.ls).toBe('{"accepted":true}');
      expect(seen.cookie).toContain('uc_consent=yes');
    } finally {
      await session.close();
    }
  });
});
