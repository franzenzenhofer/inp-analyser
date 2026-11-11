import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { installInPageObservers } from '../../src/collect/in-page-observers.js';
import type { ObservedEvent } from '../../src/collect/in-page-store.js';
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

async function openSlowHandler(): Promise<Page> {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(installInPageObservers);
  await page.goto(`${site.origin}/slow-handler`, { waitUntil: 'load' });
  return page;
}

async function readEvents(page: Page): Promise<readonly ObservedEvent[]> {
  await page.waitForFunction(() => window.inpAnalyserStore.events.some((e) => e.name === 'click'), { timeout: 5000 });
  return page.evaluate(() => window.inpAnalyserStore.events);
}

function expectOneInteraction(events: readonly ObservedEvent[]): void {
  const click = events.find((e) => e.name === 'click');
  expect(click?.interactionId).toBeGreaterThan(0);
  expect(click?.duration).toBeGreaterThanOrEqual(248);
  expect(click?.targetSelector).toBe('button#show-details');
  const ids = new Set(events.filter((e) => e.interactionId > 0).map((e) => e.interactionId));
  expect(ids.size).toBe(1);
}

describe('spike: CDP trusted input produces Event Timing interactions', () => {
  it('mouse click (Input.dispatchMouseEvent) groups pointerdown/pointerup/click under one interactionId', async () => {
    const page = await openSlowHandler();
    await page.click('#show-details');
    const events = await readEvents(page);
    console.log('[spike-input] mouse', events.filter((e) => e.interactionId > 0).map((e) => `${e.name}:${e.duration}`).join(' '));
    expectOneInteraction(events);
    await page.close();
  });

  it('touch tap (Input.dispatchTouchEvent) groups pointerdown/pointerup/click under one interactionId', async () => {
    const page = await openSlowHandler();
    await page.emulate({ viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, userAgent: await browser.userAgent() });
    await page.reload({ waitUntil: 'load' });
    await page.tap('#show-details');
    const events = await readEvents(page);
    console.log('[spike-input] touch', events.filter((e) => e.interactionId > 0).map((e) => `${e.name}:${e.duration}`).join(' '));
    expectOneInteraction(events);
    await page.close();
  });
});
