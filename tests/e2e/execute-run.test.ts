import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'puppeteer-core';
import { launchChrome } from '../../src/browser/launch.js';
import { machineSnapshot } from '../../src/machine/health.js';
import type { MachineSnapshot } from '../../src/model/run.js';
import type { Condition, Scenario, Target } from '../../src/model/scenario.js';
import { executeRun, type RunPlan } from '../../src/scenario/execute-run.js';
import { DEFAULT_GUARD_POLICY } from '../../src/safety/request-guard.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

let site: TestSite;
let browser: Browser;
let machine: MachineSnapshot;

beforeAll(async () => {
  site = await startTestSite();
  browser = await launchChrome({ hostResolverRules: site.hostResolverRule });
  machine = await machineSnapshot(browser);
});
afterAll(async () => {
  await browser.close();
  await site.close();
});

const mobile: Condition = { device: 'mobile', cpuRate: 1, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };

function target(selector: string): Target {
  return { id: selector, selector, label: selector, kind: 'button', rect: { x: 0, y: 0, width: 0, height: 0 }, aboveFold: true, handlerSignature: selector, safety: 'safe', safetyReason: 'test page' };
}

function plan(page: string, selector: string, scenario: Partial<Scenario> = {}): RunPlan {
  const s: Scenario = { id: `${page}:${selector}`, targetId: selector, phase: 'idle', condition: mobile, ...scenario };
  return { runId: `${page}-1`, url: `${site.origin}/${page}`, scenario: s, target: target(selector), stage: 'screening', block: 0, mode: 'attribution', blockedUrlPatterns: [], entityMap: { entities: [] }, guardPolicy: DEFAULT_GUARD_POLICY };
}

describe('executeRun (real headless Chrome, mobile touch)', () => {
  it('idle tap on slow-handler: measured ~250 ms processing, hit verified, busy() attributed', async () => {
    const { record } = await executeRun(browser, plan('slow-handler', '#show-details'), machine);
    console.log('[execute-run] slow-handler', JSON.stringify({ outcome: record.outcome, notes: record.notes, hit: record.hitVerified, top: record.attribution?.scripts[0] }));
    expect(record.outcome.kind).toBe('measured');
    if (record.outcome.kind !== 'measured') return;
    expect(record.outcome.timing.processing).toBeGreaterThanOrEqual(245);
    expect(record.hitVerified).toBe(true);
    expect(record.attribution?.scripts[0]?.functionName).toBe('busy');
  });

  it('idle tap on control: the cheap interaction is still in the trace (exact duration, no 16 ms observer floor)', async () => {
    const { record } = await executeRun(browser, plan('control', '#toggle'), machine);
    console.log('[execute-run] control', JSON.stringify({ outcome: record.outcome, notes: record.notes, hit: record.hitVerified }));
    expect(record.outcome.kind).toBe('measured');
    if (record.outcome.kind !== 'measured') return;
    expect(record.outcome.timing.durationExact).toBeLessThan(100);
  });
});
