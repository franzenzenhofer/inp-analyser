import { performance } from 'node:perf_hooks';
import { TimeoutError, type Page } from 'puppeteer-core';
import { pointerActivate, type Point } from '../browser/input.js';
import type { MeasurementSession } from '../browser/session.js';
import { pageNow, readStore, waitForInteraction, waitForMainThreadQuiet, type StoreSnapshot } from '../collect/waits.js';
import type { Device, Scenario, Target } from '../model/scenario.js';
import { assertNoBotWall } from '../safety/bot-wall.js';

export interface InteractPlan {
  readonly url: string;
  readonly scenario: Scenario;
  readonly target: Target;
}

export type Interacted =
  | { readonly kind: 'interacted'; readonly expectedStartMs: number; readonly notes: string[]; readonly store: StoreSnapshot }
  | { readonly kind: 'target-missing'; readonly notes: string[] };

const NAV_TIMEOUT_MS = 60_000;
/** Idle = network quiet and 5 s without a long animation frame (plan, stage 1 "idle"). */
const IDLE_QUIET = { quietMs: 5000, capMs: 30_000 } as const;
/** After the input: wait until 500 ms without a long animation frame, capped at 3 s (plan, "Isolation & timing"). */
const SETTLE = { quietMs: 500, capMs: 3000 } as const;
const INTERACTION_WAIT_MS = 5000;
const MATCH_LATE_NOTE_MS = 50;

async function settle(page: Page, since: number, target: Target): Promise<{ notes: string[]; store: StoreSnapshot }> {
  const notes: string[] = [];
  if (!(await waitForInteraction(page, since, INTERACTION_WAIT_MS))) notes.push('no Event Timing entry >=16 ms within 5 s of the input');
  if (!(await waitForMainThreadQuiet(page, SETTLE))) notes.push('main thread still busy 3 s after the input');
  return { notes, store: await readStore(page, target.selector) };
}

async function centreInViewport(page: Page, selector: string): Promise<Point | undefined> {
  const handle = await page.$(selector);
  if (handle === null) return undefined;
  await handle.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); });
  const box = await handle.boundingBox();
  await handle.dispose();
  return box === null ? undefined : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function waitForIdle(page: Page, notes: string[]): Promise<void> {
  try {
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20_000 });
  } catch (error) {
    if (!(error instanceof TimeoutError)) throw error;
    notes.push('network never idle for 1 s within 20 s');
  }
  if (!(await waitForMainThreadQuiet(page, IDLE_QUIET))) notes.push('main thread never quiet for 5 s within 30 s');
}

/** Idle phase: page fully loaded and quiet, element scrolled into view, then one trusted tap/click. */
export async function interactIdle(session: MeasurementSession, plan: InteractPlan, device: Device): Promise<Interacted> {
  const notes: string[] = [];
  const response = await session.page.goto(plan.url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
  await assertNoBotWall(session.page, response);
  await session.guard.arm();
  await waitForIdle(session.page, notes);
  const point = await centreInViewport(session.page, plan.target.selector);
  if (point === undefined) return { kind: 'target-missing', notes };
  if (!(await waitForMainThreadQuiet(session.page, { quietMs: 500, capMs: 5000 }))) notes.push('main thread busy after scrolling the target into view');
  const before = await pageNow(session.page);
  await pointerActivate(session.client, device, point);
  const settled = await settle(session.page, before - 5, plan.target);
  return { kind: 'interacted', expectedStartMs: before, notes: [...notes, ...settled.notes], store: settled.store };
}

const sleepUntil = (deadline: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - performance.now())));

/** Arms the guard as soon as the main document has responded (the document request itself must pass). */
function armOnDocumentResponse(session: MeasurementSession): Promise<void> {
  return new Promise((resolve, reject) => {
    session.page.once('response', (response) => {
      if (!response.request().isNavigationRequest()) return;
      session.guard.arm().then(resolve, reject);
    });
  });
}

/**
 * Boot phase: the tap is scheduled by coordinates at a fixed offset after navigation start - no DOM query
 * on the busy main thread (it would only answer once the thread is free and miss the worst moment).
 * The guard must be armed before the tap; if arming is slower than the offset, the tap leaves late and the
 * real dispatch time (not the plan) is what the interaction is matched against.
 */
export async function interactBoot(session: MeasurementSession, plan: InteractPlan, device: Device): Promise<Interacted> {
  const offset = plan.scenario.offsetMs;
  if (offset === undefined) throw new Error(`[interact] boot scenario ${plan.scenario.id} has no offsetMs`);
  const point = plan.scenario.tapPoint ?? { x: plan.target.rect.x + plan.target.rect.width / 2, y: plan.target.rect.y + plan.target.rect.height / 2 };
  const start = performance.now();
  const armed = armOnDocumentResponse(session);
  const navigation = session.page.goto(plan.url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
  await sleepUntil(start + offset);
  await armed;
  const dispatchedAt = performance.now() - start;
  await pointerActivate(session.client, device, point);
  await assertNoBotWall(session.page, await navigation);
  const settled = await settle(session.page, 0, plan.target);
  const late = dispatchedAt - offset > MATCH_LATE_NOTE_MS ? [`tap left ${Math.round(dispatchedAt - offset)} ms late (guard arming)`] : [];
  return { kind: 'interacted', expectedStartMs: dispatchedAt, notes: [...late, ...settled.notes], store: settled.store };
}
