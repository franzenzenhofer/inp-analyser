import type { Attribution, InteractionTiming } from '../model/measurement.js';
import type { Evidence, IssuePhase } from '../model/issue.js';
import type { PageFacts, RunRecord } from '../model/run.js';
import type { Scenario, Target } from '../model/scenario.js';

/** A measured attribution run, the unit every rule is evaluated on. */
export interface MeasuredRun {
  readonly record: RunRecord;
  readonly timing: InteractionTiming;
  readonly attribution: Attribution;
  readonly page?: PageFacts;
}

export interface RuleContext {
  readonly scenario: Scenario;
  readonly target: Target;
}

/** What one rule saw in one run: the rule's key quantity (ms) and the evidence behind it. */
export interface Finding {
  readonly ms?: number;
  readonly evidence: readonly Evidence[];
}

/** A diagnosis rule: pure, describes the problem with evidence, never a remedy. */
export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly phase: IssuePhase;
  /** 'page' issues (DOM size, viewport) are merged across scenarios into one issue. */
  readonly scope: 'interaction' | 'page';
  /** Source that defines why this counts and where the threshold comes from (read and linked). */
  readonly specUrl: string;
  check(run: MeasuredRun, ctx: RuleContext): Finding | undefined;
}
