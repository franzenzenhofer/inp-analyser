import type { Browser } from 'puppeteer-core';

/** Starts a fresh browser with the analysis' launch options. */
export type Launcher = () => Promise<Browser>;

/**
 * Owns the measurement browser for a whole analysis and replaces it when it is lost.
 *
 * A long analysis loads the page hundreds of times. On a loaded machine Chrome can lose its page target or its whole
 * DevTools connection mid run ("Session already detached", "Connection closed"); before this host existed, every
 * later run of the analysis failed. Now the run that hit it is retried once in a fresh browser and the analysis goes on.
 * Every relaunch is counted and printed; block gates (BenchmarkIndex drift, sentinel) still judge the block.
 */
export interface BrowserHost {
  /** The live browser; relaunches first when the previous one lost its connection. */
  get(): Promise<Browser>;
  /** True when `error` means the browser or its page target was lost; the browser is then replaced if needed. */
  recover(error: unknown): Promise<boolean>;
  readonly relaunches: () => number;
  close(): Promise<void>;
}

/** Hard stop: a browser that keeps dying is a broken setup, not noise. */
export const MAX_RELAUNCHES = 5;

const LOST = /session (already |)(detached|closed)|connection closed|target closed|browser has disconnected|protocol error.*(target|session)/i;

export function isBrowserLost(error: unknown): boolean {
  return error instanceof Error && LOST.test(error.message);
}

async function discard(browser: Browser): Promise<void> {
  try {
    await browser.close();
  } catch {
    // Already gone: make sure no orphaned Chrome keeps running.
    browser.process()?.kill('SIGKILL');
  }
}

export async function createBrowserHost(launch: Launcher): Promise<BrowserHost> {
  let current = await launch();
  let count = 0;
  const relaunch = async (why: string): Promise<Browser> => {
    if (count >= MAX_RELAUNCHES) throw new Error(`[browser] lost ${count + 1} times (${why}); giving up - check memory and machine load`);
    count += 1;
    console.error(`[browser] ${why} - relaunching Chrome (relaunch ${count} of max ${MAX_RELAUNCHES})`);
    await discard(current);
    current = await launch();
    return current;
  };
  return {
    get: async () => (current.connected ? current : relaunch('connection lost')),
    recover: async (error) => {
      if (!isBrowserLost(error) && current.connected) return false;
      if (!current.connected) await relaunch(`connection lost: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    },
    relaunches: () => count,
    close: async () => discard(current),
  };
}
