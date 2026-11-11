import type { Browser } from 'puppeteer-core';
import { allLongTasks } from '../analysis/blocking-tasks.js';
import { EntityResolver, type EntityMap } from '../analysis/entities.js';
import { hazardTimeline, type HazardTimeline } from '../analysis/hazard.js';
import { mainFrameMainThread } from '../analysis/main-thread.js';
import { parseTrace } from '../analysis/trace-engine-adapter.js';
import { openSession } from '../browser/session.js';
import { stopTrace } from '../browser/tracing.js';
import { waitForMainThreadQuiet } from '../collect/waits.js';
import type { Condition } from '../model/scenario.js';
import { DEFAULT_GUARD_POLICY } from '../safety/request-guard.js';
import { assertNoBotWall } from '../safety/bot-wall.js';

export interface PreflightTrace {
  readonly timeline: HazardTimeline;
  /** Every request URL of the load (input for "block all third parties"). */
  readonly requestUrls: readonly string[];
  readonly mainDocumentStatus: number;
}

/** A load without any input: when is the main thread busy, and with whose code? */
export async function recordPreflight(browser: Browser, url: string, options: { condition: Condition; entityMap: EntityMap }): Promise<PreflightTrace> {
  const session = await openSession(browser, { condition: options.condition, mode: 'attribution', blockedUrlPatterns: [], guardPolicy: DEFAULT_GUARD_POLICY });
  const requestUrls: string[] = [];
  session.page.on('request', (r) => { requestUrls.push(r.url()); });
  try {
    const response = await session.page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    if (response === null) throw new Error(`[preflight] no HTTP response for ${url}`);
    await assertNoBotWall(session.page, response);
    await waitForMainThreadQuiet(session.page, { quietMs: 5000, capMs: 30_000 });
    const fcp = await session.page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1);
    if (fcp < 0) throw new Error(`[preflight] ${url} never painted first content`);
    const parsed = await parseTrace(await stopTrace(session.page));
    const nav = parsed.data.Meta.mainFrameNavigations.at(-1);
    if (nav === undefined) throw new Error('[preflight] trace has no main-frame navigation');
    const ctx = { parsed, thread: mainFrameMainThread(parsed), entities: new EntityResolver(parsed, options.entityMap) };
    return { timeline: hazardTimeline(fcp, allLongTasks(nav.ts, ctx)), requestUrls, mainDocumentStatus: response.status() };
  } finally {
    await session.close();
  }
}
