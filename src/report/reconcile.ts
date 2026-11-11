import type { FieldInp } from '../field/parity.js';
import type { ScenarioSummary } from '../scenario/summarise.js';

/** INP buckets: good <= 200, poor > 500 (https://web.dev/articles/inp#good-score). */
export type Bucket = 'good' | 'needs-improvement' | 'poor';

export function bucketOf(ms: number): Bucket {
  if (ms <= 200) return 'good';
  return ms <= 500 ? 'needs-improvement' : 'poor';
}

export interface ReconciledScenario {
  readonly scenarioId: string;
  readonly medianMs: number;
  readonly ciHighMs?: number;
  readonly bucket: Bucket;
  readonly reachesFieldP75: boolean;
}

export interface Reconciliation {
  readonly verdict: 'reproduced' | 'not-reproduced' | 'no-field-data';
  readonly field: FieldInp;
  readonly scenarios: readonly ReconciledScenario[];
  readonly text: string;
}

/** A lab scenario "reaches" the field p75 when its median CI (or, below 6 runs, its median) is at or above it. */
function reaches(summary: ScenarioSummary, p75: number): boolean {
  const upper = summary.medianCi?.high ?? summary.median ?? 0;
  return upper >= p75;
}

/**
 * Lab never produces "the INP". It shows which interactions, in which phase and condition, are slow enough
 * to explain the field p75 that PSI / CrUX report - or says plainly that the lab did not reproduce it.
 */
export function reconcile(field: FieldInp, summaries: readonly ScenarioSummary[], labLabel: string): Reconciliation {
  const measured = summaries.filter((s) => s.median !== undefined);
  if (field.kind === 'no-data') {
    const scenarios = measured.map((s) => ({ scenarioId: s.scenarioId, medianMs: s.median ?? 0, bucket: bucketOf(s.median ?? 0), reachesFieldP75: false }));
    return { verdict: 'no-field-data', field, scenarios, text: `No CrUX INP for ${field.formFactor}: ${field.reason}. Lab results stand alone and are not INP.` };
  }
  const scenarios = measured
    .map((s) => ({ scenarioId: s.scenarioId, medianMs: s.median ?? 0, ...(s.medianCi === undefined ? {} : { ciHighMs: s.medianCi.high }), bucket: bucketOf(s.median ?? 0), reachesFieldP75: reaches(s, field.p75) }))
    .toSorted((a, b) => b.medianMs - a.medianMs);
  const hits = scenarios.filter((s) => s.reachesFieldP75);
  const head = `Field INP p75 (CrUX ${field.formFactor}, ${field.level} level, ${field.collectionPeriod.firstDate}..${field.collectionPeriod.lastDate}) = ${field.p75} ms.`;
  const text = hits.length === 0
    ? `${head} No lab scenario reached it: not reproduced in the lab (real devices, logged-in states, iframes, untested interactions).`
    : `${head} ${hits.length} lab scenario(s) reach it: ${hits.slice(0, 5).map((h) => `${h.scenarioId} (${labLabel} median ${Math.round(h.medianMs)} ms)`).join(', ')}.`;
  return { verdict: hits.length === 0 ? 'not-reproduced' : 'reproduced', field, scenarios, text };
}
