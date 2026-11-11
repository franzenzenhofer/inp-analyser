import type { Comparison } from '../issues/comparisons.js';
import { severityFor } from '../issues/engine.js';
import type { Evidence, Issue } from '../model/issue.js';
import type { ScenarioReport } from '../model/report.js';
import { wilsonInterval } from '../stats/wilson.js';

function statsEvidence(c: Comparison): Evidence[] {
  const sign = c.shift.estimate >= 0 ? '+' : '';
  return [
    { label: 'shift (Hodges-Lehmann, 95% CI)', value: `${sign}${Math.round(c.shift.estimate)} ms [${Math.round(c.shift.low)}, ${Math.round(c.shift.high)}]` },
    { label: 'Mann-Whitney p (Holm)', value: `${c.p.toPrecision(2)} (${c.pHolm.toPrecision(2)})` },
    { label: "Cliff's delta", value: `${c.cliffsDelta.toFixed(2)} (${c.magnitude})` },
    { label: 'runs', value: `${c.nBaseline} vs ${c.nVariant}` },
  ];
}

/** Share of the slower arm's runs above the faster arm's median, with Wilson interval. */
function reproducibility(values: readonly number[], threshold: number, above: boolean): Issue['reproducibility'] {
  const fired = values.filter((v) => (above ? v > threshold : v < threshold)).length;
  const interval = wilsonInterval({ successes: fired, trials: values.length });
  return { fired, runs: values.length, interval: { low: interval.low, high: interval.high } };
}

function bootIssue(c: Comparison, byId: ReadonlyMap<string, ScenarioReport>): Issue {
  const variant = byId.get(c.variantScenarioId);
  const values = variant?.summary.values ?? [];
  return {
    ruleId: 'input-delay/boot-window', title: 'Same element is slower when tapped while the page boots', phase: 'input-delay',
    severity: severityFor(values), certainty: 'confirmed', scenarioIds: [c.baselineScenarioId, c.variantScenarioId],
    ...(variant === undefined ? {} : { targetSelector: variant.target.selector }),
    quantity: 'shift', medianMs: c.shift.estimate, medianCi: { low: c.shift.low, high: c.shift.high }, reproducibility: reproducibility(values, c.medianBaselineMs, true),
    evidence: [{ label: 'boot median', value: `${Math.round(c.medianVariantMs)} ms`, ms: c.medianVariantMs }, { label: 'idle median', value: `${Math.round(c.medianBaselineMs)} ms`, ms: c.medianBaselineMs }, ...statsEvidence(c)],
    specUrl: 'https://web.dev/articles/optimize-input-delay',
  };
}

function thirdPartyIssue(c: Comparison, byId: ReadonlyMap<string, ScenarioReport>): Issue {
  const base = byId.get(c.baselineScenarioId);
  const values = base?.summary.values ?? [];
  const confounded = c.confounded !== undefined;
  return {
    ruleId: confounded ? 'third-party/confounded' : 'third-party/causal-delta',
    title: confounded ? `Blocking third parties breaks first-party code - effect not attributable (${c.label})` : `Third parties cause this delay: ${c.label} is faster`,
    phase: 'context', severity: confounded ? 'info' : severityFor(values), certainty: 'confirmed', scenarioIds: [c.baselineScenarioId, c.variantScenarioId],
    ...(base === undefined ? {} : { targetSelector: base.target.selector }),
    quantity: 'shift', medianMs: -c.shift.estimate, medianCi: { low: -c.shift.high, high: -c.shift.low }, reproducibility: reproducibility(values, c.medianVariantMs, true),
    evidence: [
      { label: 'with third parties (median)', value: `${Math.round(c.medianBaselineMs)} ms`, ms: c.medianBaselineMs },
      { label: 'blocked (median)', value: `${Math.round(c.medianVariantMs)} ms`, ms: c.medianVariantMs },
      ...statsEvidence(c),
      ...(confounded ? [{ label: 'confounded', value: c.confounded ?? '' }] : []),
    ],
    specUrl: 'https://developer.chrome.com/docs/performance/insights/third-parties',
  };
}

/** Significant comparisons become issues: boot slower than idle, or blocking third parties makes it faster. */
export function comparisonIssues(comparisons: readonly Comparison[], scenarios: readonly ScenarioReport[]): Issue[] {
  const byId = new Map(scenarios.map((s) => [s.scenario.id, s]));
  return comparisons.flatMap((c) => {
    if (c.kind === 'phase') return c.significant && c.shift.low > 0 ? [bootIssue(c, byId)] : [];
    if (c.confounded !== undefined) return [thirdPartyIssue(c, byId)];
    return c.significant && c.shift.high < 0 ? [thirdPartyIssue(c, byId)] : [];
  });
}
