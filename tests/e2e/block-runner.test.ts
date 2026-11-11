import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrowserHost, type BrowserHost } from '../../src/browser/browser-host.js';
import { launchChrome } from '../../src/browser/launch.js';
import { startSentinel, type SentinelServer } from '../../src/machine/sentinel.js';
import type { Condition, Scenario, Target } from '../../src/model/scenario.js';
import { createPoliteness, SYSTEM_CLOCK, type Politeness } from '../../src/safety/politeness.js';
import { DEFAULT_GUARD_POLICY } from '../../src/safety/request-guard.js';
import { runBlock, type BlockDeps, type BlockRun } from '../../src/scenario/block-runner.js';
import { RunStore } from '../../src/store/jsonl.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

/**
 * Traces are written as each run finishes and are not held until the block ends (regression: a block of
 * ad-heavy consent-accepted runs ran Node out of heap). The record still carries its tracePath.
 * A Chrome that dies mid block is relaunched and the lost run retried (regression: "Session already detached"
 * on a loaded machine made every later run of the analysis fail).
 */
let site: TestSite;
let host: BrowserHost;
let sentinel: SentinelServer;
const condition: Condition = { device: 'mobile', cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };
const target: Target = { id: '#show-details', selector: '#show-details', label: 'show details', kind: 'button', rect: { x: 0, y: 0, width: 0, height: 0 }, aboveFold: true, handlerSignature: 'x', safety: 'safe', safetyReason: 'test page' };
const scenario: Scenario = { id: 'idle:slow-handler', targetId: target.id, phase: 'idle', condition };

beforeAll(async () => {
  site = await startTestSite();
  host = await createBrowserHost(() => launchChrome({ hostResolverRules: site.hostResolverRule }));
  sentinel = await startSentinel();
});
afterAll(async () => {
  await sentinel.close();
  await host.close();
  await site.close();
});

async function deps(politeness: Politeness): Promise<BlockDeps> {
  const store = new RunStore(await mkdtemp(join(tmpdir(), 'inp-block-')));
  await store.init();
  let n = 0;
  return {
    host, store, politeness,
    sentinel: { server: sentinel, reference: [130, 130, 130] },
    plan: { url: `${site.origin}/slow-handler`, entityMap: { entities: [] }, guardPolicy: DEFAULT_GUARD_POLICY },
    blockedUrlPatterns: () => [], nextRunId: () => `run-${++n}`,
    machine: (benchmarkIndex) => ({ benchmarkIndex, loadAverage1m: 0, onBattery: false }),
  };
}

const runs = (count: number, mode: BlockRun['mode']): BlockRun[] => Array.from({ length: count }, () => ({ scenario, target, stage: 'deep-dive' as const, block: 0, mode }));

describe('runBlock', () => {
  it('saves each attribution trace to disk and returns no trace events in memory', async () => {
    const d = await deps(createPoliteness({ minIntervalMs: 0, clock: SYSTEM_CLOCK }));
    const results = await runBlock(runs(2, 'attribution'), d);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.traceEvents).toHaveLength(0);
      expect(r.record.tracePath).toBeDefined();
      expect(existsSync(join(d.store.dir, r.record.tracePath ?? 'missing'))).toBe(true);
    }
    expect((await d.store.readAll()).map((r) => r.tracePath)).toEqual(results.map((r) => r.record.tracePath));
  });

  it('relaunches Chrome killed mid block and still measures every run', async () => {
    const base = createPoliteness({ minIntervalMs: 0, clock: SYSTEM_CLOCK });
    let loads = 0;
    // Kill the real Chrome process right before the 2nd page load, like an OS kill or crash on a loaded machine.
    const killing: Politeness = {
      ...base,
      beforeLoad: async (url) => {
        loads += 1;
        if (loads === 2) (await host.get()).process()?.kill('SIGKILL');
        return base.beforeLoad(url);
      },
    };
    const before = host.relaunches();
    const results = await runBlock(runs(3, 'timing'), await deps(killing));
    expect(results.map((r) => r.record.outcome.kind)).toEqual(['measured', 'measured', 'measured']);
    expect(host.relaunches()).toBe(before + 1);
    expect((await host.get()).connected).toBe(true);
  });
});
