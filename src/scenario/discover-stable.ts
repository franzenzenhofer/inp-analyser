import type { Browser } from 'puppeteer-core';
import { openSession } from '../browser/session.js';
import { waitForMainThreadQuiet } from '../collect/waits.js';
import { discoverTargets, stableTargets } from '../discovery/discover.js';
import { DEFAULT_SCAN_OPTIONS } from '../discovery/collect-candidates.js';
import type { DiscoveryResult } from '../discovery/types.js';
import type { Condition } from '../model/scenario.js';
import { assertNoBotWall } from '../safety/bot-wall.js';
import type { Politeness } from '../safety/politeness.js';
import { DEFAULT_GUARD_POLICY } from '../safety/request-guard.js';
import { sequential } from './sequential.js';

export interface StableDiscoveryInput {
  readonly browser: Browser;
  readonly url: string;
  readonly condition: Condition;
  readonly maxTargets: number;
  readonly politeness: Politeness;
}

async function onePass(input: StableDiscoveryInput): Promise<DiscoveryResult> {
  await input.politeness.beforeLoad(input.url);
  const session = await openSession(input.browser, { condition: input.condition, mode: 'timing', blockedUrlPatterns: [], guardPolicy: DEFAULT_GUARD_POLICY });
  try {
    const response = await session.page.goto(input.url, { waitUntil: 'load', timeout: 60_000 });
    await assertNoBotWall(session.page, response);
    await waitForMainThreadQuiet(session.page, { quietMs: 3000, capMs: 30_000 });
    return await discoverTargets(session.page, { maxTargets: input.maxTargets * 2, scan: DEFAULT_SCAN_OPTIONS });
  } finally {
    await session.close();
  }
}

/** Two independent discovery passes on fresh loads; only targets found in both are kept (plan, stage 0). */
export async function discoverStable(input: StableDiscoveryInput): Promise<DiscoveryResult> {
  const [a, b] = await sequential([0, 1], () => onePass(input));
  if (a === undefined || b === undefined) throw new Error('[discover] expected two discovery passes');
  const stable = stableTargets(a.targets, b.targets).slice(0, input.maxTargets);
  console.log(`[discover] ${a.candidateCount} candidates, ${a.targets.length}/${b.targets.length} targets per pass, ${stable.length} stable`);
  return { ...a, targets: stable };
}
