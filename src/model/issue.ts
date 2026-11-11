export type IssuePhase = 'input-delay' | 'processing' | 'presentation' | 'context';
export type Severity = 'poor' | 'needs-improvement' | 'info';
export type Certainty = 'confirmed' | 'intermittent' | 'screening-only';

export interface Interval { readonly low: number; readonly high: number }

export interface Evidence {
  readonly label: string;
  readonly value: string;
  readonly ms?: number;
  readonly url?: string;
}

/** A diagnosed INP problem. Describes what is slow and why, never how to fix it. */
export interface Issue {
  readonly ruleId: string;
  readonly title: string;
  readonly phase: IssuePhase;
  readonly severity: Severity;
  readonly certainty: Certainty;
  readonly scenarioIds: readonly string[];
  readonly targetSelector?: string;
  readonly medianMs?: number;
  readonly medianCi?: Interval;
  /** What medianMs measures: the median of the rule's quantity, or a Hodges-Lehmann shift between two arms. */
  readonly quantity?: 'median' | 'shift';
  /** Runs in which the rule fired / runs analysed, with Wilson interval. */
  readonly reproducibility: { readonly fired: number; readonly runs: number; readonly interval: Interval };
  readonly evidence: readonly Evidence[];
  /** Spec or engine source that defines why this counts (read and linked). */
  readonly specUrl: string;
}
