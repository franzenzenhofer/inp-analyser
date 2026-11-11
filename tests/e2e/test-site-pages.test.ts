import { readdir, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Frame, Page } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { installInPageObservers } from '../../src/collect/in-page-observers.js';
import { startTestSite, THIRD_PARTY_HOST, type TestSite } from '../../test-site/server.js';

/** Every test-site page loads, declares its expected finding and costs what it claims, in real headless Chrome. */
type Part = 'input-delay' | 'processing' | 'presentation';
interface Interaction { readonly duration: number; readonly parts: Readonly<Record<Part, number>> }
/** min/max: click latency band in ms; dominant: largest interaction part; errors: expected page errors (default none). */
interface PageCase {
  readonly page: string; readonly min?: number; readonly max?: number; readonly dominant?: Part; readonly status?: number; readonly errors?: RegExp;
  readonly noClick?: true; readonly blockThirdParty?: true; readonly mobileTap?: true;
  readonly before?: (page: Page) => Promise<void>; readonly after?: (page: Page) => Promise<void>;
}

const PAGES_DIR = new URL('../../test-site/pages/', import.meta.url);
const ENTITY_MAP = new URL('../../test-site/entity-map.json', import.meta.url);
/** Event Timing duration has "granularity of 8ms or less": https://w3c.github.io/event-timing/#set-event-timing-entry-duration */
const ROUNDING_MS = 8;
const PARTS: readonly Part[] = ['input-delay', 'processing', 'presentation'];
const META_PATTERN = /^([a-z0-9-]+); target=([^;]+); phase=(input-delay|processing|presentation|context); .+$/;
const MOBILE = { viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } };
const PAGE_FILES = (await readdir(PAGES_DIR)).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
const results: string[] = [];
const dialogs: string[] = [];
let site: TestSite;
let browser: Browser;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = (selector: string) => async (page: Page): Promise<void> => void (await page.waitForSelector(selector, { timeout: 10_000 }));
const ready = waitFor('html[data-ready="true"]');
const textIs = (selector: string, expected: string) => async (page: Page): Promise<void> => expect(await page.$eval(selector, (el) => el.textContent)).toBe(expected);
const frameOf = (page: Page, file: string): Frame | undefined => page.frames().find((f) => f.url().includes(file));
/** Non-script time of the long animation frame that handled the click (https://w3c.github.io/long-animation-frames/#dom-performancelonganimationframetiming-firstuieventtimestamp).
 *  The restyle/relayout runs before renderStart there (post-click hit test), so frame minus script time is measured, not styleAndLayoutStart. */
const clickFrameNonScriptMs = (page: Page) => page.evaluate(() => Math.max(0, ...window.inpAnalyserStore.frames.filter((f) => f.firstUIEventTimestamp > 0).map((f) => f.duration - f.scripts.reduce((a, s) => a + s.duration, 0))));
const loafScripts = (page: Page) => page.evaluate(() => window.inpAnalyserStore.frames.flatMap((f) => f.scripts));
const readMoreBlocked = (page: Page): Promise<boolean> => page.$eval('#read-more', (el) => {
  const r = el.getBoundingClientRect();
  return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== el;
});
const escapeUnblocks = async (page: Page): Promise<void> => {
  expect([await readMoreBlocked(page), await page.keyboard.press('Escape').then(() => readMoreBlocked(page))]).toEqual([true, false]);
};

/** Runs in the page: element count >= 1500 and max nesting depth >= 40 (big-dom-static claims). */
function domSizeAndDepth(): { bigEnough: boolean; deepEnough: boolean } {
  const all = [...document.querySelectorAll('*')];
  let depth = 0;
  for (const el of all) for (let n: Element | null = el, d = 1; n !== null; n = n.parentElement, d++) depth = Math.max(depth, d);
  return { bigEnough: all.length >= 1500, deepEnough: depth >= 40 };
}

async function open(c: PageCase): Promise<Page> {
  const page = await browser.newPage();
  page.on('dialog', (dialog) => void dialog.accept().then(() => dialogs.push(dialog.message())));
  if (c.blockThirdParty === true) {
    await page.setRequestInterception(true);
    page.on('request', (req) => void (req.url().includes(THIRD_PARTY_HOST) ? req.abort('blockedbyclient') : req.continue()));
  }
  if (c.mobileTap === true) await page.emulate({ ...MOBILE, userAgent: await browser.userAgent() });
  await page.evaluateOnNewDocument(installInPageObservers);
  return page;
}

/** `a >>> b` descends into an iframe (other frame) or a shadow root (puppeteer's deep combinator). */
async function locate(page: Page, target: string): Promise<{ frame: Frame; selector: string }> {
  const [outer = target, inner] = target.split(' >>> ');
  const host = await page.waitForSelector(outer, { timeout: 10_000 });
  const frame = inner === undefined ? null : await host?.contentFrame();
  if (frame === null || frame === undefined || inner === undefined) return { frame: page.mainFrame(), selector: target };
  await frame.waitForSelector(inner, { timeout: 10_000 });
  /* An OOPIF that has not painted yet is not hit-testable: wait for load plus two frames before clicking into it. */
  await frame.waitForFunction(() => document.readyState === 'complete', { timeout: 10_000 }).then(() => frame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  return { frame, selector: inner };
}

/** Latency of the first interaction after `since` = max duration of its entries (https://w3c.github.io/event-timing/#sec-computing-interactionid);
 *  phases over all its entries like web-vitals attribution (https://github.com/GoogleChrome/web-vitals/blob/main/src/attribution/onINP.ts). */
async function interactionAfter(frame: Frame, since: number): Promise<Interaction | undefined> {
  return frame.evaluate((t) => {
    const entries = window.inpAnalyserStore.events.filter((e) => e.interactionId > 0 && e.startTime >= t);
    const first = entries[0];
    if (first === undefined) return undefined;
    const own = entries.filter((e) => e.interactionId === first.interactionId);
    const worst = own.reduce((a, e) => (e.duration > a.duration ? e : a), first);
    const processingEnd = Math.max(...own.map((e) => e.processingEnd));
    const parts = { 'input-delay': first.processingStart - first.startTime, processing: processingEnd - first.processingStart, presentation: Math.max(0, worst.startTime + worst.duration - processingEnd) };
    return { duration: worst.duration, parts };
  }, since);
}

async function clickAndMeasure(c: PageCase, frame: Frame, selector: string): Promise<Interaction | undefined> {
  const since = await frame.evaluate(() => performance.now());
  await (c.mobileTap === true ? frame.tap(selector) : frame.click(selector));
  if (c.min !== undefined) {
    await frame.waitForFunction((t) => window.inpAnalyserStore.events.some((e) => e.name === 'click' && e.startTime >= t), { timeout: 15_000 }, since);
  }
  await sleep(c.min === undefined ? 1000 : 300);
  return interactionAfter(frame, since);
}

function assertBand(c: PageCase, i: Interaction | undefined): void {
  const duration = i?.duration ?? 0;
  expect(duration, `${c.page} duration`).toBeGreaterThanOrEqual((c.min ?? 0) - ROUNDING_MS);
  expect(duration, `${c.page} duration`).toBeLessThan(c.max ?? Number.POSITIVE_INFINITY);
  const top = i === undefined ? undefined : PARTS.reduce((a, b) => (i.parts[b] > i.parts[a] ? b : a));
  expect(c.dominant === undefined || top === c.dominant, `${c.page} dominant ${c.dominant ?? '-'} in ${JSON.stringify(i?.parts)}`).toBe(true);
}

function record(c: PageCase, rule: string, target: string, i: Interaction | undefined): void {
  const parts = i === undefined ? '' : ` (delay ${Math.round(i.parts['input-delay'])} / proc ${Math.round(i.parts.processing)} / pres ${Math.round(i.parts.presentation)})`;
  const label = `${c.page}${c.blockThirdParty === true ? ' (3P blocked)' : ''}${c.mobileTap === true ? ' (mobile tap)' : ''}`;
  const value = c.noClick === true ? 'not clicked' : i === undefined ? '<16 (no entry)' : `${i.duration}${parts}`;
  results.push(`| ${label} | ${rule} | ${target} | ${value} |`);
}

const CASES: readonly PageCase[] = [
  { page: 'control', max: 100 },
  { page: 'slow-handler', min: 250, dominant: 'processing' },
  { page: 'sentinel', min: 120, max: 250, dominant: 'processing' },
  { page: 'forced-reflow', min: 80, dominant: 'processing', after: async (p) => expect((await loafScripts(p)).reduce((a, s) => a + s.forcedStyleAndLayoutDuration, 0)).toBeGreaterThanOrEqual(30) },
  { page: 'layout-thrash', min: 60, dominant: 'processing', after: async (p) => expect(await p.$eval('#out', (el) => el.textContent)).toMatch(/passes x 300 interleaved/) },
  { page: 'style-recalc', min: 40, dominant: 'presentation', after: async (p) => expect([await clickFrameNonScriptMs(p) >= 40, await p.$eval('#out', (el) => el.textContent)]).toEqual([true, 'dark']) },
  { page: 'large-layout', min: 40, dominant: 'presentation', after: async (p) => expect([await clickFrameNonScriptMs(p) >= 40, await p.$eval('#out', (el) => el.textContent)]).toEqual([true, 'narrow']) },
  { page: 'dom-insert-2000', after: async (p) => expect(await p.$$eval('#results > li', (els) => els.length)).toBe(2000) },
  { page: 'big-dom-static', max: 100, before: async (p) => expect(await p.evaluate(domSizeAndDepth)).toEqual({ bigEnough: true, deepEnough: true }) },
  { page: 'raf-after-handler', min: 200, dominant: 'presentation' },
  { page: 'paint-heavy', after: textIs('#out', 'on') },
  { page: 'noncomposited-spinner', min: 150, after: waitFor('#spinner.running') },
  { page: 'boot-long-tasks', max: 100, before: async (p) => expect(await p.waitForFunction(() => performance.now() > 4500, { timeout: 10_000, polling: 100 })
    .then(() => p.evaluate(() => window.inpAnalyserStore.frames.filter((f) => f.duration >= 300).length))).toBeGreaterThanOrEqual(4) },
  { page: 'late-hydration', max: 100, after: textIs('#out', '1'), before: async (p) => {
    await p.click('#add-item').then(() => sleep(300)).then(() => textIs('#out', '0')(p)).then(() => waitFor('html[data-hydrated="true"]')(p));
  } },
  { page: 'layout-shift-target', max: 100, before: async (p) => {
    const top = () => p.$eval('#newsletter-signup', (el) => el.getBoundingClientRect().top);
    const before = await top();
    expect(await waitFor('html[data-shifted="true"]')(p).then(top) - before).toBeCloseTo(200, 0);
  } },
  { page: '3p-global-listener', min: 150, dominant: 'processing', before: ready },
  { page: '3p-wrapper', min: 200, dominant: 'processing', before: ready, after: async (p) => expect((await loafScripts(p)).some((s) => s.sourceURL.includes('rum-wrapper.js') && s.duration >= 150)).toBe(true) },
  { page: '3p-required-by-1p', min: 120, before: ready, after: textIs('#out', '1') },
  { page: '3p-required-by-1p', blockThirdParty: true, max: 100, errors: /TypeError/, before: ready, after: textIs('#out', '0') },
  { page: 'ab-known-delta', min: 220, before: ready },
  { page: 'ab-known-delta', blockThirdParty: true, max: 100, before: ready },
  { page: 'consent-shadow-dom', min: 250, dominant: 'processing', after: async (p) => expect(await p.$('#consent-host')).toBeNull() },
  { page: 'consent-iframe', min: 250, dominant: 'processing', after: waitFor('html[data-consent="accept"]') },
  { page: 'modal-and-menu', max: 100, before: async (p) => waitFor('#newsletter-modal.open')(p).then(() => escapeUnblocks(p)), after: escapeUnblocks },
  { page: 'navigations', min: 200, dominant: 'processing', before: async (p) => {
    await Promise.all(['#doc-link[href="/control"]', '#blank-link[target="_blank"]', '#download-link[download]', '#subscribe-form[method="post"] #subscribe-submit', '#delete-account'].map((s) => waitFor(s)(p)));
  }, after: async (p) => {
    expect(await p.evaluate(() => location.search)).toBe('?tab=2');
    expect(site.requests.filter((r) => !r.startsWith('GET ') || r.includes('/api/') || r.includes('/download/'))).toEqual([]);
  } },
  { page: 'alert-dialog', after: async () => expect(dialogs).toEqual(['Draft saved']) },
  { page: 'oopif-heavy', max: 100, before: async (p) => void (await frameOf(p, 'heavy-frame')?.waitForFunction(() => Number(document.getElementById('ad-ticks')?.textContent) > 5, { timeout: 10_000 })) },
  { page: 'bot-challenge', status: 403, noClick: true },
  { page: 'viewport-missing', mobileTap: true, max: 100, before: async (p) => expect(await p.$('meta[name="viewport"]')).toBeNull(), after: textIs('#out', 'open') },
  { page: 'timer-storm', max: 100, before: async (p) => void (await p.waitForFunction(() => Number(document.getElementById('ticks')?.dataset['count']) >= 10, { timeout: 10_000 })) },
  { page: 'microtask-chain', min: 200, dominant: 'processing', after: textIs('#out', '200 steps') },
  { page: 'html-parse-in-handler', dominant: 'processing' },
  { page: 'sync-xhr', min: 300, dominant: 'processing', after: textIs('#out', '{"ok":true}') },
  { page: '3p-post-consent-kickoff', noClick: true },
  { page: 'index', noClick: true, before: async (p) => {
    const links = await p.$$eval('#pages a', (as) => as.map((a) => a.getAttribute('href')));
    expect(new Set(links)).toEqual(new Set([...PAGE_FILES, 'bot-challenge'].filter((f) => f !== 'index').map((f) => `/${f}`)));
  } },
];
/** Pages other agents add get the generic checks (200, inp-expect meta, target exists) until they get a case here. */
const ALL_CASES: readonly PageCase[] = [...CASES, ...PAGE_FILES.filter((f) => !CASES.some((c) => c.page === f)).map((page): PageCase => ({ page, noClick: true }))];

beforeAll(async () => {
  site = await startTestSite();
  browser = await launchChrome({ hostResolverRules: site.hostResolverRule });
});
afterAll(async () => {
  console.log(['| page | rule-id | target | measured click ms |', '|---|---|---|---|', ...results].join('\n'));
  await browser.close();
  await site.close();
});

describe('test-site pages: one reproducible INP issue each', () => {
  it('every case has a page file, and the entity map names the third-party origin', async () => {
    expect(CASES.map((c) => c.page).filter((p) => p !== 'bot-challenge' && !PAGE_FILES.includes(p))).toEqual([]);
    const map: unknown = JSON.parse(await readFile(ENTITY_MAP, 'utf8'));
    expect(map).toEqual({ entities: [{ name: 'Test Tracker Inc.', category: 'analytics', domains: [THIRD_PARTY_HOST] }] });
  });

  it.each(ALL_CASES)('$page', async (c) => {
    dialogs.length = 0;
    const page = await open(c);
    const response = await page.goto(`${site.origin}/${c.page}`, { waitUntil: 'load' });
    expect(response?.status()).toBe(c.status ?? 200);
    const content = await page.$eval('meta[name="inp-expect"]', (el) => el.getAttribute('content') ?? '');
    const [, rule = '', target = ''] = META_PATTERN.exec(content) ?? [];
    expect(target, `inp-expect "${content}"`).not.toBe('');
    const { frame, selector } = await locate(page, target);
    await c.before?.(page);
    const interaction = c.noClick === true ? undefined : await clickAndMeasure(c, frame, selector);
    record(c, rule, target, interaction);
    assertBand(c, interaction);
    await c.after?.(page);
    expect((await page.evaluate(() => window.inpAnalyserStore.errors)).join(' ')).toMatch(c.errors ?? /^$/);
    await page.close();
  });

  it('3p-post-consent-kickoff: taps after consent wait behind 400 ms third-party tasks', async () => {
    const page = await open({ page: '3p-post-consent-kickoff' });
    await page.goto(`${site.origin}/3p-post-consent-kickoff`, { waitUntil: 'load' });
    const box = await (await page.$('#search-button'))?.boundingBox();
    await page.click('#consent-accept');
    await waitFor('html[data-kickoff="running"]')(page);
    const cdp = await page.createCDPSession();
    const press = (type: 'mousePressed' | 'mouseReleased') => cdp.send('Input.dispatchMouseEvent', { type, x: (box?.x ?? 0) + 5, y: (box?.y ?? 0) + 5, button: 'left', clickCount: 1 });
    /* Press/release sent without awaiting the renderer, 150 ms apart: one of three taps lands >=100 ms before a 400 ms task ends. */
    await Promise.all([0, 150, 300].map(async (offset) => sleep(offset).then(() => Promise.all([press('mousePressed'), press('mouseReleased')]))));
    await sleep(3500);
    const worst = await page.evaluate(() => Math.max(...window.inpAnalyserStore.events.filter((e) => e.targetSelector === 'button#search-button').map((e) => e.processingStart - e.startTime)));
    results.push(`| 3p-post-consent-kickoff | 3p-consent-kickoff | #search-button | worst input delay ${Math.round(worst)} of 3 taps |`);
    expect(worst).toBeGreaterThanOrEqual(100);
    expect((await loafScripts(page)).filter((s) => s.sourceURL.includes(THIRD_PARTY_HOST) && s.duration >= 380).length).toBeGreaterThanOrEqual(3);
    await page.close();
  });
});
