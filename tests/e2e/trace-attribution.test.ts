import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'puppeteer-core';
import { analyseTrace } from '../../src/analysis/attribution.js';
import { parseTrace } from '../../src/analysis/trace-engine-adapter.js';
import { launchChrome } from '../../src/browser/launch.js';
import { startTrace, stopTrace } from '../../src/browser/tracing.js';
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

describe('trace attribution on a real recorded trace', () => {
  it('slow-handler: one interaction, ~250 ms processing, attributed to expensiveDetailsHandler / busy (first party)', async () => {
    const page = await browser.newPage();
    await startTrace(page, 'attribution');
    await page.goto(`${site.origin}/slow-handler`, { waitUntil: 'load' });
    await page.click('#show-details');
    await new Promise((resolve) => setTimeout(resolve, 600));
    const events = await stopTrace(page);
    const analysed = analyseTrace(await parseTrace(events), events);
    console.log('[trace-attribution]', JSON.stringify(analysed.map((a) => ({ t: a.interaction.timing, scripts: a.attribution.scripts.slice(0, 4), rendering: a.attribution.rendering.slice(0, 3), unattributed: a.attribution.unattributedMs }))));
    expect(analysed).toHaveLength(1);
    const [only] = analysed;
    expect(only?.interaction.timing.processing).toBeGreaterThanOrEqual(245);
    expect(only?.interaction.origin.kind).toBe('navigation');
    const processingScripts = only?.attribution.scripts.filter((s) => s.phase === 'processing') ?? [];
    const top = processingScripts[0];
    expect(top?.isFirstParty).toBe(true);
    expect(['busy', 'expensiveDetailsHandler']).toContain(top?.functionName);
    expect(processingScripts.reduce((sum, s) => sum + s.selfMs, 0)).toBeGreaterThan(200);
    await page.close();
  });
});
