import type { HTTPResponse, Page } from 'puppeteer-core';

/** Main-document statuses that mean "you are blocked or throttled", never a page worth measuring. */
const WALL_STATUSES: ReadonlySet<number> = new Set([403, 429, 503]);

const TITLE_MARKERS: readonly [string, string][] = [
  ['just a moment...', 'Cloudflare challenge title'],
  ['attention required! | cloudflare', 'Cloudflare block title'],
  ['access denied', 'Akamai block title'],
  ['pardon our interruption', 'Imperva challenge title'],
];

/**
 * Markers that only appear on challenge pages. Deliberately NOT used: the bare `_abck` cookie (Akamai sets it
 * on every protected page) and a bare `datadome` string (the DataDome tag is embedded in normal pages).
 */
const HTML_MARKERS: readonly [string, string][] = [
  ['id="challenge-running"', 'Cloudflare #challenge-running'],
  ['cf-chl', 'Cloudflare cf-chl challenge'],
  ['sec-if-cpt-container', 'Akamai sec-cpt challenge'],
  ['/_sec/cp_challenge/', 'Akamai cp_challenge'],
  ['captcha-delivery.com', 'DataDome captcha'],
  ['px-captcha', 'PerimeterX px-captcha'],
];

export interface DocumentSnapshot {
  /** Main-document HTTP status; null for a same-document navigation. */
  readonly status: number | null;
  readonly title: string;
  readonly html: string;
}

/** Every bot-wall signal found in the snapshot; empty means no wall. */
export function botWallMarkers(snapshot: DocumentSnapshot): readonly string[] {
  const markers: string[] = [];
  if (snapshot.status !== null && WALL_STATUSES.has(snapshot.status)) markers.push(`HTTP ${snapshot.status}`);
  const title = snapshot.title.trim().toLowerCase();
  for (const [marker, name] of TITLE_MARKERS) if (title === marker) markers.push(name);
  const html = snapshot.html.toLowerCase();
  for (const [marker, name] of HTML_MARKERS) if (html.includes(marker.toLowerCase())) markers.push(name);
  return markers;
}

/** A challenge page: the whole analysis stops (retrying would hammer the site and measure the wrong page). */
export class BotWallError extends Error {
  override readonly name = 'BotWallError';
}

/** Call after every navigation: a challenge page is never measured, the run stops loud. */
export async function assertNoBotWall(page: Page, response: HTTPResponse | null): Promise<void> {
  const snapshot = { status: response === null ? null : response.status(), title: await page.title(), html: await page.content() };
  const markers = botWallMarkers(snapshot);
  if (markers.length > 0) {
    throw new BotWallError(`[safety] bot wall at ${page.url()}: ${markers.join(', ')}. Stopping: a challenge page is not the page, and retrying would hammer the site.`);
  }
}
