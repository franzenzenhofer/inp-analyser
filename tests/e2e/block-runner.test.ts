import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { startSentinel, type SentinelServer } from '../../src/machine/sentinel.js';
import type { Condition, Scenario, Target } from '../../src/model/scenario.js';
import { createPoliteness, SYSTEM_CLOCK } from '../../src/safety/politeness.js';
import { DEFAULT_GUARD_POLICY } from '../../src/safety/request-guard.js';
import { runBlock } from '../../src/scenario/block-runner.js';
import { RunStore } from '../../src/store/jsonl.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

/**
 * Traces are written as each run finishes and are not held until the block ends (regression: a block of
 * ad-heavy consent-accepted runs ran Node out of heap). The record still carries its tracePath.
 */
let site: TestSite;
let browser: Browser;
let sentinel: SentinelServer;
const condition: Condition = { device: 'mobile', cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };
const target: Target = { id: '#show-details', selector: '#show-details', label: 'show details', kind: 'button', rect: { x: 0, y: 0, width: 0, height: 0 }, aboveFold: true, handlerSignature: 'x', safety: 'safe', safetyReason: 'test page' };

beforeAll(async () => {
  site = await startTestSite();
  browser = await launchChrome({ hostResolverRules: site.hostResolverRule });
  sentinel = await startSentinel();
});
afterAll(async () => {
  await sentinel.close();
  await browser.close();
  await site.close();
});

describe('runBlock', () => {
  it('saves each attribution trace to disk and returns no trace events in memory', async () => {
    const store = new RunStore(await mkdtemp(join(tmpdir(), 'inp-block-')));
    await store.init();
    const scenario: Scenario = { id: 'idle:slow-handler', targetId: target.id, phase: 'idle', condition };
    let n = 0;
    const results = await runBlock([0, 1].map(() => ({ scenario, target, stage: 'deep-dive' as const, block: 0, mode: 'attribution' as const })), {
      browser, store, politeness: createPoliteness({ minIntervalMs: 0, clock: SYSTEM_CLOCK }),
      sentinel: { server: sentinel, reference: [130, 130, 130] },
      plan: { url: `${site.origin}/slow-handler`, entityMap: { entities: [] }, guardPolicy: DEFAULT_GUARD_POLICY },
      blockedUrlPatterns: () => [], nextRunId: () => `run-${++n}`,
      machine: (benchmarkIndex) => ({ benchmarkIndex, loadAverage1m: 0, onBattery: false }),
    });
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.traceEvents).toHaveLength(0);
      expect(r.record.tracePath).toBeDefined();
      expect(existsSync(join(store.dir, r.record.tracePath ?? 'missing'))).toBe(true);
    }
    expect((await store.readAll()).map((r) => r.tracePath)).toEqual(results.map((r) => r.record.tracePath));
  });
});
