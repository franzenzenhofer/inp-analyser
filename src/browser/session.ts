import type { Browser, BrowserContext, CDPSession, Page } from 'puppeteer-core';
import { installInPageObservers, installMutationCounter } from '../collect/in-page-observers.js';
import type { Condition, RunMode } from '../model/scenario.js';
import { applyConsentState } from '../consent/consent-state.js';
import { installRequestGuard, type GuardPolicy, type RequestGuard } from '../safety/request-guard.js';
import { applyBlocking } from './block-third-parties.js';
import { applyCondition, type AppliedEmulation } from './emulation.js';
import { startTrace } from './tracing.js';

export interface MeasurementSession {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly client: CDPSession;
  readonly mode: RunMode;
  readonly guard: RequestGuard;
  close(): Promise<void>;
}

export interface SessionOptions {
  readonly condition: Condition;
  readonly mode: RunMode;
  readonly blockedUrlPatterns: readonly string[];
  readonly guardPolicy: GuardPolicy;
}

/**
 * One measured page session: fresh incognito context (empty cache, cookies, storage), emulation,
 * 3P blocking, in-page observers, and tracing started BEFORE navigation (recordings started mid-load
 * put the profiler's own start-up into interactions).
 */
export async function openSession(browser: Browser, options: SessionOptions): Promise<MeasurementSession> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const client = await page.createCDPSession();
  let emulation: AppliedEmulation | undefined;
  let guard: RequestGuard | undefined;
  try {
    guard = await installRequestGuard(page, options.guardPolicy);
    emulation = await applyCondition(page, client, options.condition);
    await applyBlocking(client, options.blockedUrlPatterns);
    if (options.condition.consentState !== undefined) await applyConsentState(context, page, options.condition.consentState);
    await page.evaluateOnNewDocument(installInPageObservers);
    if (options.mode === 'attribution') await page.evaluateOnNewDocument(installMutationCounter);
    await startTrace(page, options.mode);
  } catch (error) {
    await context.close();
    throw error;
  }
  const applied = emulation;
  const installed = guard;
  return {
    context, page, client, mode: options.mode, guard: installed,
    close: async () => {
      applied.dispose();
      await installed.dispose();
      await context.close();
    },
  };
}
