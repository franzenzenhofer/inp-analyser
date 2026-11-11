import type { FieldSummary } from '../field/field-summary.js';
import { finaliseComparisons, phaseComparisons, type Comparison } from '../issues/comparisons.js';
import { diagnose, rankIssues } from '../issues/diagnose.js';
import type { ScenarioInput } from '../issues/engine.js';
import type { Issue } from '../model/issue.js';
import type { AnalysisReport, ScenarioReport } from '../model/report.js';
import type { RunRecord } from '../model/run.js';
import { summariseScenario } from '../scenario/summarise.js';
import { thirdPartyComparisons } from '../issues/third-party-comparisons.js';
import { comparisonIssues } from './comparison-issues.js';
import { limitations } from './limitations.js';
import { reconcile } from './reconcile.js';
import type { RunMeta } from './run-meta.js';

export interface ReportInput {
  readonly meta: RunMeta;
  readonly records: readonly RunRecord[];
  readonly field?: FieldSummary;
  readonly tool: { readonly name: string; readonly version: string };
}

function scenarioInputs(meta: RunMeta, valid: readonly RunRecord[]): ScenarioInput[] {
  const targets = new Map(meta.targets.map((t) => [t.id, t]));
  return meta.scenarios.flatMap((scenario) => {
    const target = targets.get(scenario.targetId);
    return target === undefined ? [] : [{ scenario, target, runs: valid.filter((r) => r.scenarioId === scenario.id) }];
  });
}

function scenarioReports(inputs: readonly ScenarioInput[], meta: RunMeta): ScenarioReport[] {
  const deep = new Set(meta.deepDived);
  return inputs.map((i) => ({ scenario: i.scenario, target: i.target, summary: summariseScenario(i.scenario.id, i.runs), deepDived: deep.has(i.scenario.id) }));
}

export function buildReport(input: ReportInput): AnalysisReport {
  const { meta } = input;
  const valid = input.records.filter((r) => r.excluded === undefined);
  const inputs = scenarioInputs(meta, valid);
  const scenarios = scenarioReports(inputs, meta);
  const comparisons: Comparison[] = finaliseComparisons([...phaseComparisons(meta.scenarios, valid), ...thirdPartyComparisons(meta.scenarios, valid)]);
  const issues: Issue[] = rankIssues([...diagnose(inputs), ...comparisonIssues(comparisons, scenarios)]);
  const device = meta.condition.device === 'mobile' ? input.field?.phone : input.field?.desktop;
  return {
    tool: input.tool, url: meta.url, generatedAt: new Date().toISOString(), seed: meta.seed, chromeVersion: meta.chromeVersion, condition: meta.condition,
    ...(input.field === undefined ? {} : { field: input.field }),
    ...(device === undefined ? {} : { reconciliation: reconcile(device.inp, scenarios.map((s) => s.summary), `lab @ CPU ${meta.condition.cpuRate}x, ${meta.condition.device}`) }),
    issues, comparisons, scenarios, hazard: meta.hazard,
    targets: { measured: meta.targets, excluded: meta.excludedTargets, globalListeners: meta.globalListeners },
    run: {
      runs: input.records.length, excludedRuns: input.records.length - valid.length, loads: meta.loads, sentinelReferenceMs: meta.sentinelReferenceMs,
      ...(meta.incomplete === undefined ? {} : { incomplete: meta.incomplete }),
    },
    limitations: limitations(meta),
  };
}
