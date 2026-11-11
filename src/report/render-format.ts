import type { CollectionPeriod, FormFactor, RatingDensities } from '../field/crux-schema.js';
import type { DeviceField } from '../field/field-summary.js';
import type { FieldLevel, ParityResult } from '../field/parity.js';
import { ms } from '../issues/format.js';
import type { Certainty, Evidence, Interval, Issue, IssuePhase, Severity } from '../model/issue.js';
import type { AnalysisReport } from '../model/report.js';
import type { Condition } from '../model/scenario.js';
import type { ScenarioSummary } from '../scenario/summarise.js';
import { bucketOf, type Bucket } from './reconcile.js';

/** Wording shared by the terminal and the HTML report, so both say exactly the same thing. */
export const PHASE_LABEL: Readonly<Record<IssuePhase, string>> = {
  'input-delay': 'input delay', processing: 'processing', presentation: 'presentation delay', context: 'context',
};
export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { poor: 'poor', 'needs-improvement': 'needs improvement', info: 'info' };
export const CERTAINTY_LABEL: Readonly<Record<Certainty, string>> = { confirmed: 'confirmed', intermittent: 'intermittent', 'screening-only': 'screening only' };
export const BUCKET_LABEL: Readonly<Record<Bucket, string>> = { good: 'good', 'needs-improvement': 'needs improvement', poor: 'poor' };
/** good <= 200 ms, poor > 500 ms (https://web.dev/articles/inp#good-score). */
export const BUCKET_RANGE: Readonly<Record<Bucket, string>> = { good: '<= 200 ms', 'needs-improvement': '200-500 ms', poor: '> 500 ms' };
export const BUCKETS: readonly Bucket[] = ['good', 'needs-improvement', 'poor'];
export const INP_SPEC_URL = 'https://web.dev/articles/inp#good-score';

/** Lab values are never INP: every lab number carries this label. */
export function labLabel(condition: Condition): string {
  return `lab @ CPU ${condition.cpuRate}x, ${condition.device}`;
}

export function formFactorOf(condition: Condition): FormFactor {
  return condition.device === 'mobile' ? 'PHONE' : 'DESKTOP';
}

/** CrUX PHONE for a mobile run, DESKTOP for a desktop run (PSI mobile = PHONE, src/field/parity.ts). */
export function deviceFieldOf(report: AnalysisReport): DeviceField | undefined {
  if (report.field === undefined) return undefined;
  return report.condition.device === 'mobile' ? report.field.phone : report.field.desktop;
}

export function periodText(period: CollectionPeriod): string {
  return `${period.firstDate} to ${period.lastDate}`;
}

export function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function levelText(level: FieldLevel): string {
  return level === 'url' ? 'page (URL) level' : 'origin level (the page itself has no CrUX INP)';
}

export function parityText(parity: ParityResult): string {
  if (parity.kind === 'equal') return `PSI shows the same: ${parity.p75} ms`;
  if (parity.kind === 'differs') return `PSI shows different numbers: ${parity.detail}`;
  return `PSI not comparable: ${parity.reason}`;
}

export type FieldHeadline =
  | {
      readonly kind: 'data';
      readonly p75: number;
      readonly level: FieldLevel;
      readonly formFactor: FormFactor;
      readonly period: CollectionPeriod;
      readonly densities: RatingDensities;
      readonly bucket: Bucket;
      readonly parity: string;
    }
  | { readonly kind: 'none'; readonly formFactor: FormFactor; readonly text: string };

/** The only number the report calls INP: CrUX p75 for the run's device, with level, period and PSI parity. */
export function fieldHeadline(report: AnalysisReport): FieldHeadline {
  const formFactor = formFactorOf(report.condition);
  const device = deviceFieldOf(report);
  if (device === undefined) {
    return { kind: 'none', formFactor, text: 'No field data: CrUX and PSI were not fetched for this run, so this report has no INP number. Lab values below are not INP.' };
  }
  const inp = device.inp;
  if (inp.kind === 'no-data') {
    return { kind: 'none', formFactor, text: `No field data: CrUX has no INP for ${inp.formFactor} (${inp.reason}). Lab values below are not INP.` };
  }
  const parity = inp.level === 'url' ? device.psiParity.page : device.psiParity.origin;
  return {
    kind: 'data', p75: inp.p75, level: inp.level, formFactor: inp.formFactor, period: inp.collectionPeriod,
    densities: inp.densities, bucket: bucketOf(inp.p75), parity: parityText(parity),
  };
}

export function fieldSourceText(h: FieldHeadline & { kind: 'data' }): string {
  return `CrUX p75, ${h.formFactor}, ${levelText(h.level)}, ${periodText(h.period)}`;
}

export function percentInterval(interval: Interval): string {
  return `${Math.round(interval.low * 100)}-${Math.round(interval.high * 100)}%`;
}

export function reproText(issue: Issue): string {
  const r = issue.reproducibility;
  return `fired in ${r.fired} of ${r.runs} runs (95% CI ${percentInterval(r.interval)})`;
}

export function msInterval(interval: Interval): string {
  return `${Math.round(interval.low)}-${Math.round(interval.high)} ms`;
}

/** "median 349 ms (95% CI 346-360 ms)" or a plain statement when the rule has no duration. */
export function issueMsText(issue: Issue): string {
  if (issue.medianMs === undefined) return 'no duration attached';
  const ci = issue.medianCi === undefined ? '' : ` (95% CI ${msInterval(issue.medianCi)})`;
  return issue.quantity === 'shift' ? `effect ${ms(issue.medianMs)} (Hodges-Lehmann shift)${ci}` : `median ${ms(issue.medianMs)}${ci}`;
}

/** Exact median CI from 6 runs on; below that only the range is honest (src/scenario/summarise.ts). */
export function scenarioCiText(summary: ScenarioSummary): string {
  if (summary.medianCi !== undefined) return msInterval(summary.medianCi);
  if (summary.min !== undefined && summary.max !== undefined) return `n<6: range ${msInterval({ low: summary.min, high: summary.max })}`;
  return 'no measured run';
}

export function evidenceText(evidence: Evidence): string {
  const base = `${evidence.label}: ${evidence.value}`;
  if (evidence.ms === undefined) return base;
  const value = ms(evidence.ms);
  return base.includes(value) ? base : `${base} (${value})`;
}

/** The causal row first: the first evidence that names a script URL, else the first row. */
export function topEvidence(issue: Issue): Evidence | undefined {
  return issue.evidence.find((e) => e.url !== undefined) ?? issue.evidence[0];
}

export function scenarioLabel(id: string, report: AnalysisReport): string {
  const found = report.scenarios.find((s) => s.scenario.id === id);
  if (found === undefined) return id;
  const when = found.scenario.phase === 'boot' ? `boot tap @ ${found.scenario.offsetMs ?? 0} ms` : found.scenario.phase;
  return `${found.target.selector} (${when})`;
}
