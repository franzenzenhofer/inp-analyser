import { Browser, computeExecutablePath, detectBrowserPlatform, install } from '@puppeteer/browsers';
import { CHROME_CACHE_DIR, PINNED_CHROME_BUILD } from '../src/browser/chrome-version.js';

const platform = detectBrowserPlatform();
if (platform === undefined) {
  throw new Error('Cannot detect browser platform for Chrome for Testing');
}
await install({ browser: Browser.CHROME, buildId: PINNED_CHROME_BUILD, cacheDir: CHROME_CACHE_DIR, platform });
const path = computeExecutablePath({ browser: Browser.CHROME, buildId: PINNED_CHROME_BUILD, cacheDir: CHROME_CACHE_DIR, platform });
console.log(`[install-chrome] Chrome for Testing ${PINNED_CHROME_BUILD} at ${path}`);
