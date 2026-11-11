import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'puppeteer-core';
import { loadEntityMap, type EntityMap } from '../../src/analysis/entities.js';
import { launchChrome } from '../../src/browser/launch.js';
import { diagnose } from '../../src/issues/diagnose.js';
import { machineSnapshot } from '../../src/machine/health.js';
import type { MachineSnapshot, RunRecord } from '../../src/model/run.js';
import type { Condition, Scenario, Target } from '../../src/model/scenario.js';
import { DEFAULT_GUARD_POLICY } from '../../src/safety/request-guard.js';
import { bootGeometry } from '../../src/scenario/boot-geometry.js';
import { executeRun } from '../../src/scenario/execute-run.js';
import { sequential } from '../../src/scenario/sequential.js';
import { startTestSite, type TestSite } from '../../test-site/server.js';

/** Each issue page must fire its rule in every run (plan: >= 90%); control must stay silent. 4x CPU, mobile. */
const RUNS = 3;
const CASES: ReadonlyArray<[page: string, selector: string, rules: readonly string[]]> = [
  ['slow-handler', '#show-details', ['processing/slow-event-handlers']],
  ['forced-reflow', '#resize-panel', ['processing/forced-reflow']],
  ['layout-thrash', '#grow-bars', ['processing/layout-thrashing']],
  ['style-recalc', '#theme-toggle', ['presentation/large-style-recalc', 'presentation/rendering-dominant']],
  ['large-layout', '#toggle-sidebar', ['presentation/large-layout']],
  ['dom-insert-2000', '#load-more', ['presentation/large-dom-change']],
  ['big-dom-static', '#expand', ['context/dom-size']],
  ['raf-after-handler', '#animate', ['presentation/script-before-paint']],
  ['noncomposited-spinner', '#submit-search', ['presentation/non-composited-animation']],
  ['3p-global-listener', '#apply-filter', ['processing/third-party-script']],
  ['viewport-missing', '#open-menu', ['input-delay/no-mobile-viewport']],
];

let site: TestSite;
let browser: Browser;
let machine: MachineSnapshot;
let entityMap: EntityMap;

beforeAll(async () => {
  site = await startTestSite();
  browser = await launchChrome({ hostResolverRules: site.hostResolverRule });
  machine = await machineSnapshot(browser);
  entityMap = await loadEntityMap('test-site/entity-map.json');
});
afterAll(async () => {
  await browser.close();
  await site.close();
});

const condition: Condition = { device: 'mobile', cpuRate: 4, thirdParty: { kind: 'allow' }, consent: 'none', cache: 'cold' };

function targetFor(selector: string): Target {
  return { id: selector, selector, label: selector, kind: 'button', rect: { x: 0, y: 0, width: 0, height: 0 }, aboveFold: true, handlerSignature: selector, safety: 'safe', safetyReason: 'test page' };
}

async function runPage(page: string, selector: string, boot?: Pick<Scenario, 'offsetMs' | 'tapPoint'>): Promise<{ scenario: Scenario; target: Target; runs: RunRecord[] }> {
  const scenario: Scenario = boot === undefined ? { id: `idle:${page}`, targetId: selector, phase: 'idle', condition } : { id: `boot:${page}`, targetId: selector, phase: 'boot', condition, ...boot };
  const target = targetFor(selector);
  const runs: RunRecord[] = await sequential(Array.from({ length: RUNS }, (_, i) => i), async (i) => {
    const plan = { runId: `${page}-${i}`, url: `${site.origin}/${page}`, scenario, target, stage: 'deep-dive' as const, block: 0, mode: 'attribution' as const, blockedUrlPatterns: [], entityMap, guardPolicy: DEFAULT_GUARD_POLICY };
    return (await executeRun(browser, plan, machine)).record;
  });
  return { scenario, target, runs };
}

describe('detectors on the test site (real Chrome, 4x CPU, mobile)', () => {
  it.each(CASES)('%s fires %j in every run', async (page, selector, rules) => {
    const issues = diagnose([await runPage(page, selector)]);
    console.log(`[detectors] ${page}: ${issues.map((i) => `${i.ruleId} ${i.reproducibility.fired}/${i.reproducibility.runs}`).join(', ')}`);
    for (const rule of rules) {
      const issue = issues.find((i) => i.ruleId === rule);
      expect(issue?.reproducibility.fired, `${page} -> ${rule}`).toBe(RUNS);
    }
  });

  it.each([1200, 1800])('boot-long-tasks: a tap %i ms after navigation waits for a first-party long task', async (offsetMs) => {
    const url = `${site.origin}/boot-long-tasks`;
    const geometry = await bootGeometry(browser, { url, condition, targets: [targetFor('#menu-toggle')], offsetsMs: [offsetMs] });
    const tapPoint = geometry.get(offsetMs)?.get('#menu-toggle');
    expect(tapPoint).toBeDefined();
    const issues = diagnose([await runPage('boot-long-tasks', '#menu-toggle', { offsetMs, ...(tapPoint === undefined ? {} : { tapPoint }) })]);
    console.log(`[detectors] boot@${offsetMs}: ${issues.map((i) => `${i.ruleId} ${i.reproducibility.fired}/${i.reproducibility.runs} ${Math.round(i.medianMs ?? 0)}ms`).join(', ')}`);
    expect(issues.find((i) => i.ruleId === 'input-delay/long-task')?.reproducibility.fired).toBe(RUNS);
  });

  it('boot geometry resolves deep selectors across an open shadow root (consent banner)', async () => {
    const selector = '#consent-host >>> #consent-accept';
    const geometry = await bootGeometry(browser, { url: `${site.origin}/consent-shadow-dom`, condition, targets: [targetFor(selector)], offsetsMs: [1500] });
    expect(geometry.get(1500)?.get(selector)).toBeDefined();
  });

  it('a deep selector target (consent in open shadow root) is measured, not a SyntaxError', async () => {
    const issues = diagnose([await runPage('consent-shadow-dom', '#consent-host >>> #consent-accept')]);
    console.log(`[detectors] consent-shadow-dom: ${issues.map((i) => `${i.ruleId} ${i.reproducibility.fired}/${i.reproducibility.runs}`).join(', ')}`);
    expect(issues.find((i) => i.ruleId === 'processing/slow-event-handlers')?.reproducibility.fired).toBe(RUNS);
  });

  it('control page: no issue at all', async () => {
    const issues = diagnose([await runPage('control', '#toggle')]);
    expect(issues.map((i) => i.ruleId)).toEqual([]);
  });
});
