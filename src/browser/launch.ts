import { Browser as BrowserName, computeExecutablePath, detectBrowserPlatform } from '@puppeteer/browsers';
import { launch, type Browser } from 'puppeteer-core';
import { CHROME_CACHE_DIR, PINNED_CHROME_BUILD } from './chrome-version.js';

/** Flags that keep timers and rendering at full speed although nobody looks at the (headless) window. */
const MEASUREMENT_FLAGS: readonly string[] = [
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-extensions',
  '--no-first-run',
  '--no-default-browser-check',
  '--mute-audio',
];

export interface LaunchOptions {
  readonly hostResolverRules?: string;
  /** Route all page traffic through this proxy, e.g. socks5://127.0.0.1:1080 to load from a whitelisted IP. */
  readonly proxyServer?: string;
}

function chromeExecutable(): string {
  const platform = detectBrowserPlatform();
  if (platform === undefined) {
    throw new Error('[launch] cannot detect platform for Chrome for Testing');
  }
  return computeExecutablePath({ browser: BrowserName.CHROME, buildId: PINNED_CHROME_BUILD, cacheDir: CHROME_CACHE_DIR, platform });
}

async function assertPinnedVersion(browser: Browser): Promise<void> {
  const version = await browser.version();
  if (!version.includes(PINNED_CHROME_BUILD)) {
    await browser.close();
    throw new Error(`[launch] Chrome ${version} is not the pinned build ${PINNED_CHROME_BUILD}; run npm run chrome:install`);
  }
}

/** Always headless: measurements never open a window on the user's screen. */
export async function launchChrome(options: LaunchOptions = {}): Promise<Browser> {
  const args = [...MEASUREMENT_FLAGS];
  if (options.hostResolverRules !== undefined) {
    args.push(`--host-resolver-rules=${options.hostResolverRules}`);
  }
  if (options.proxyServer !== undefined) {
    args.push(`--proxy-server=${options.proxyServer}`);
  }
  // INP_DEBUG_CHROME=1 forwards Chrome's stderr for crash diagnosis.
  const dumpio = process.env['INP_DEBUG_CHROME'] === '1';
  const browser = await launch({ executablePath: chromeExecutable(), headless: true, dumpio, args, defaultViewport: null });
  await assertPinnedVersion(browser);
  return browser;
}
