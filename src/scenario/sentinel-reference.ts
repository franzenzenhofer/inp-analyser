import type { Browser } from 'puppeteer-core';
import type { SentinelServer } from '../machine/sentinel.js';
import type { MachineSnapshot } from '../model/run.js';
import type { Condition } from '../model/scenario.js';
import { DEFAULT_GUARD_POLICY } from '../safety/request-guard.js';
import { executeRun } from './execute-run.js';
import { sequential } from './sequential.js';

/** Six sentinel runs before measuring: the reference every later block is judged against. */
export const SENTINEL_REFERENCE_RUNS = 6;

export async function sentinelReference(browser: Browser, server: SentinelServer, condition: Condition, machine: MachineSnapshot): Promise<number[]> {
  const scenario = { id: 'sentinel', targetId: 'sentinel', phase: 'idle' as const, condition };
  const values = await sequential(Array.from({ length: SENTINEL_REFERENCE_RUNS }, (_, i) => i), async (i) => {
    const plan = { runId: `sentinel-ref-${i}`, url: server.url, scenario, target: server.target, stage: 'preflight' as const, block: -1, mode: 'timing' as const, blockedUrlPatterns: [], entityMap: { entities: [] }, guardPolicy: DEFAULT_GUARD_POLICY };
    const { record } = await executeRun(browser, plan, machine);
    if (record.outcome.kind !== 'measured') throw new Error(`[sentinel] reference run ${i} not measured: ${record.outcome.kind}`);
    return record.outcome.timing.durationExact;
  });
  console.log(`[sentinel] reference ${values.map((v) => Math.round(v)).join(', ')} ms`);
  return values;
}
