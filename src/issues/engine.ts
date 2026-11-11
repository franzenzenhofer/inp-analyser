import type { Certainty, Issue, Severity } from '../model/issue.js';
import type { RunRecord } from '../model/run.js';
import type { Scenario, Target } from '../model/scenario.js';
import { median } from '../stats/descriptive.js';
import { medianCi } from '../stats/order-ci.js';
import { wilsonInterval } from '../stats/wilson.js';
import { MEDIAN_CI_MIN_RUNS } from '../scenario/summarise.js';
import { measuredAttributionRuns, measuredDurations } from './measured-runs.js';
import { THRESHOLDS } from './thresholds.js';
import type { Finding, MeasuredRun, Rule } from './types.js';

export interface ScenarioInput {
  readonly scenario: Scenario;
  readonly target: Target;
  readonly runs: readonly RunRecord[];
}

/** "confirmed" needs a deep-dive with >= 5 attribution runs and the rule firing in >= 60% of them. */
export const CONFIRM_MIN_RUNS = 5;
export const CONFIRM_MIN_SHARE = 0.6;

function certainty(runs: readonly MeasuredRun[], fired: number): Certainty {
  const deep = runs.some((r) => r.record.stage === 'deep-dive' || r.record.stage === 'causal');
  if (!deep || runs.length < CONFIRM_MIN_RUNS) return 'screening-only';
  return fired / runs.length >= CONFIRM_MIN_SHARE ? 'confirmed' : 'intermittent';
}

export function severityFor(durations: readonly number[]): Severity {
  if (durations.length === 0) return 'info';
  const m = median(durations);
  if (m > THRESHOLDS.inpPoorMs) return 'poor';
  return m > THRESHOLDS.inpGoodMs ? 'needs-improvement' : 'info';
}

interface Fired { readonly run: MeasuredRun; readonly finding: Finding }

function representative(fired: readonly Fired[]): Fired {
  const sorted = fired.toSorted((a, b) => a.run.timing.durationExact - b.run.timing.durationExact);
  const pick = sorted[Math.floor((sorted.length - 1) / 2)];
  if (pick === undefined) throw new Error('[issues] representative() needs at least one fired run');
  return pick;
}

function quantity(fired: readonly Fired[]): Pick<Issue, 'medianMs' | 'medianCi'> {
  const values = fired.flatMap((f) => (f.finding.ms === undefined ? [] : [f.finding.ms]));
  if (values.length === 0) return {};
  if (values.length < MEDIAN_CI_MIN_RUNS) return { medianMs: median(values) };
  const ci = medianCi(values);
  return { medianMs: median(values), medianCi: { low: ci.low, high: ci.high } };
}

function issueFor(rule: Rule, input: ScenarioInput, runs: readonly MeasuredRun[]): Issue | undefined {
  const ctx = { scenario: input.scenario, target: input.target };
  const fired = runs.flatMap((run) => {
    const finding = rule.check(run, ctx);
    return finding === undefined ? [] : [{ run, finding }];
  });
  if (fired.length === 0) return undefined;
  const interval = wilsonInterval({ successes: fired.length, trials: runs.length });
  return {
    ruleId: rule.id, title: rule.title, phase: rule.phase, specUrl: rule.specUrl,
    severity: severityFor(measuredDurations(input.runs)), certainty: certainty(runs, fired.length),
    scenarioIds: [input.scenario.id], targetSelector: input.target.selector, ...quantity(fired),
    reproducibility: { fired: fired.length, runs: runs.length, interval: { low: interval.low, high: interval.high } },
    evidence: representative(fired).finding.evidence,
  };
}

/** Evaluates every rule on every scenario's attribution runs. Page-scope issues are merged afterwards. */
export function diagnoseScenarios(inputs: readonly ScenarioInput[], rules: readonly Rule[]): Issue[] {
  return inputs.flatMap((input) => {
    const runs = measuredAttributionRuns(input.runs);
    if (runs.length === 0) return [];
    return rules.flatMap((rule) => issueFor(rule, input, runs) ?? []);
  });
}
