import type { Issue, Severity, Certainty } from '../model/issue.js';
import { wilsonInterval } from '../stats/wilson.js';
import { diagnoseScenarios, type ScenarioInput } from './engine.js';
import { ALL_RULES } from './registry.js';
import type { Rule } from './types.js';

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { poor: 0, 'needs-improvement': 1, info: 2 };
const CERTAINTY_RANK: Readonly<Record<Certainty, number>> = { confirmed: 0, intermittent: 1, 'screening-only': 2 };

function mergePageIssues(issues: readonly Issue[], pageRuleIds: ReadonlySet<string>): Issue[] {
  const merged = new Map<string, Issue>();
  const rest: Issue[] = [];
  for (const issue of issues) {
    if (!pageRuleIds.has(issue.ruleId)) {
      rest.push(issue);
      continue;
    }
    const prev = merged.get(issue.ruleId);
    if (prev === undefined) {
      merged.set(issue.ruleId, issue);
      continue;
    }
    const fired = prev.reproducibility.fired + issue.reproducibility.fired;
    const runs = prev.reproducibility.runs + issue.reproducibility.runs;
    const interval = wilsonInterval({ successes: fired, trials: runs });
    merged.set(issue.ruleId, { ...prev, scenarioIds: [...prev.scenarioIds, ...issue.scenarioIds], reproducibility: { fired, runs, interval: { low: interval.low, high: interval.high } } });
  }
  return [...rest, ...[...merged.values()].map(({ targetSelector: _dropped, ...pageIssue }) => pageIssue)];
}

/** Most severe and most certain first, then by the size of the effect. */
export function rankIssues(issues: readonly Issue[]): Issue[] {
  return issues.toSorted((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || CERTAINTY_RANK[a.certainty] - CERTAINTY_RANK[b.certainty]
    || (b.medianMs ?? 0) - (a.medianMs ?? 0));
}

export function diagnose(inputs: readonly ScenarioInput[], rules: readonly Rule[] = ALL_RULES): Issue[] {
  const pageRuleIds = new Set(rules.filter((r) => r.scope === 'page').map((r) => r.id));
  return rankIssues(mergePageIssues(diagnoseScenarios(inputs, rules), pageRuleIds));
}
