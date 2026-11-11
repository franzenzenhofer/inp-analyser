// Capture an accepted-consent state for `analyse --consent-state`, then verify it suppresses the banner.
// Usage: npx tsx scripts/capture-consent-state.ts <url> <accept-selector> <out.json> [--proxy-server <url>] [--keep <regex>]
// --keep: store only cookies / localStorage keys whose name matches (e.g. '^(uc_|consent_status$)' for Usercentrics),
// so the seeded visitor differs from a first visit only by the consent decision.
// The accept selector may cross open shadow roots (`host >>> button`), e.g. Usercentrics:
//   'div#usercentrics-root >>> button[data-testid="uc-accept-all-button"]'
import { writeFile } from 'node:fs/promises';
import type { Browser } from 'puppeteer-core';
import { launchChrome } from '../src/browser/launch.js';
import { openSession } from '../src/browser/session.js';
import { loadConsentState, type ConsentState } from '../src/consent/consent-state.js';
import type { Condition } from '../src/model/scenario.js';
import { DEFAULT_GUARD_POLICY } from '../src/safety/request-guard.js';

interface Args { readonly url: string; readonly acceptSelector: string; readonly out: string; readonly proxyServer: string | undefined; readonly keep: RegExp }

function parseArgs(argv: readonly string[]): Args {
  const [url, acceptSelector, out] = argv;
  const proxyIndex = argv.indexOf('--proxy-server');
  const keepIndex = argv.indexOf('--keep');
  if (url === undefined || acceptSelector === undefined || out === undefined) {
    throw new Error('usage: capture-consent-state.ts <url> <accept-selector> <out.json> [--proxy-server <url>]');
  }
  return { url, acceptSelector, out, proxyServer: proxyIndex >= 0 ? argv[proxyIndex + 1] : undefined, keep: new RegExp(keepIndex >= 0 ? (argv[keepIndex + 1] ?? '') : '') };
}

const { url, acceptSelector, out, proxyServer, keep } = parseArgs(process.argv.slice(2));
const SETTLE_MS = 3_000;
/** Same emulation as `analyse --device mobile`: banners can differ by device (some sites show their CMP only on mobile). */
const MOBILE: Condition = { device: 'mobile', cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };
const BANNER_WAIT_MS = 20_000;

async function capture(browser: Browser): Promise<ConsentState> {
  const session = await openSession(browser, { condition: MOBILE, mode: 'timing', blockedUrlPatterns: [], guardPolicy: DEFAULT_GUARD_POLICY });
  try {
    const { page, context } = session;
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    const button = await page.waitForSelector(acceptSelector, { visible: true, timeout: BANNER_WAIT_MS });
    if (button === null) throw new Error(`[consent] accept button ${acceptSelector} not found`);
    await button.tap();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const origin = new URL(page.url()).origin;
    const storage = Object.fromEntries(Object.entries(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).filter(([k]) => keep.test(k)));
    const cookies = (await context.cookies()).filter((c) => keep.test(c.name)).map((c) => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly === true,
      ...(c.sameSite === undefined || c.sameSite === 'Default' ? {} : { sameSite: c.sameSite }), ...(c.expires > 0 ? { expires: c.expires } : {}),
    }));
    return { capturedFrom: `${url} at ${new Date().toISOString()}`, cookies, localStorage: { [origin]: storage } };
  } finally {
    await session.close();
  }
}

async function bannerVisible(browser: Browser, state: ConsentState): Promise<boolean> {
  const session = await openSession(browser, { condition: { ...MOBILE, consent: 'accept', consentState: state }, mode: 'timing', blockedUrlPatterns: [], guardPolicy: DEFAULT_GUARD_POLICY });
  try {
    await session.page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, BANNER_WAIT_MS));
    const handle = await session.page.$(acceptSelector);
    return handle === null ? false : handle.isVisible();
  } finally {
    await session.close();
  }
}

const browser = await launchChrome(proxyServer === undefined ? {} : { proxyServer });
try {
  const state = await capture(browser);
  await writeFile(out, JSON.stringify(state, null, 1));
  const reloaded = await loadConsentState(out);
  const visible = await bannerVisible(browser, reloaded);
  console.log(`[consent] ${state.cookies.length} cookies, ${Object.keys(Object.values(state.localStorage)[0] ?? {}).length} localStorage keys -> ${out}; banner visible with state: ${visible}`);
  if (visible) throw new Error('[consent] the captured state does not suppress the banner');
} finally {
  await browser.close();
}
