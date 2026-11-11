import { join } from 'node:path';

/**
 * Single source of truth for the Chrome build every measurement runs on.
 * INP semantics changed across Chrome 121-151, so results are only comparable on one pinned build:
 * https://chromium.googlesource.com/chromium/src/+/main/docs/speed/metrics_changelog/inp.md
 */
export const PINNED_CHROME_BUILD = '155.0.8059.39';

export const CHROME_CACHE_DIR = join(import.meta.dirname, '..', '..', '.chrome');
