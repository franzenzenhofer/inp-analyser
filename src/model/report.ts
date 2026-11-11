import type { HazardTimeline } from '../analysis/hazard.js';
import type { GlobalListener } from '../discovery/types.js';
import type { FieldSummary } from '../field/field-summary.js';
import type { Comparison } from '../issues/comparisons.js';
import type { Reconciliation } from '../report/reconcile.js';
import type { ScenarioSummary } from '../scenario/summarise.js';
import type { Issue } from './issue.js';
import type { Condition, Scenario, Target } from './scenario.js';

export interface ScenarioReport {
  readonly scenario: Scenario;
  readonly target: Target;
  readonly summary: ScenarioSummary;
  readonly deepDived: boolean;
}

export interface RunFacts {
  readonly runs: number;
  readonly excludedRuns: number;
  readonly loads: number;
  readonly sentinelReferenceMs: readonly number[];
  readonly incomplete?: string;
}

/** Everything a report shows; built only from runs.jsonl + run metadata, so `inp report` can rebuild it. */
export interface AnalysisReport {
  readonly tool: { readonly name: string; readonly version: string };
  readonly url: string;
  readonly generatedAt: string;
  readonly seed: number;
  readonly chromeVersion: string;
  readonly condition: Condition;
  readonly field?: FieldSummary;
  readonly reconciliation?: Reconciliation;
  readonly issues: readonly Issue[];
  readonly comparisons: readonly Comparison[];
  readonly scenarios: readonly ScenarioReport[];
  readonly hazard: HazardTimeline;
  readonly targets: { readonly measured: readonly Target[]; readonly excluded: readonly Target[]; readonly globalListeners: readonly GlobalListener[] };
  readonly run: RunFacts;
  /** What this lab run cannot see; printed in every report. */
  readonly limitations: readonly string[];
}
