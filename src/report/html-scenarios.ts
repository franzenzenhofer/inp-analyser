import { COMPARISON_MIN_RUNS, type Comparison } from '../issues/comparisons.js';
import type { AnalysisReport, ScenarioReport } from '../model/report.js';
import { html, table, type HtmlPart, type SafeHtml } from './html-escape.js';
import { labLabel, scenarioCiText } from './render-format.js';

function phaseText(s: ScenarioReport): string {
  return s.scenario.phase === 'boot' ? `boot tap @ ${s.scenario.offsetMs ?? 0} ms` : s.scenario.phase;
}

function scenarioRow(s: ScenarioReport): HtmlPart[] {
  const median = s.summary.median === undefined ? 'not measured' : `${Math.round(s.summary.median)} ms`;
  const outcomes = Object.entries(s.summary.outcomes).filter(([kind]) => kind !== 'measured').map(([kind, n]) => `${kind} ${n}`).join(', ');
  return [
    html`<code>${s.scenario.id}</code>`,
    phaseText(s),
    html`<code>${s.target.selector}</code><br>${s.target.label === '' ? '(no label)' : s.target.label}`,
    `${s.summary.measured} of ${s.summary.runs}${outcomes === '' ? '' : ` (${outcomes})`}`,
    median,
    scenarioCiText(s.summary),
    s.deepDived ? 'yes' : 'no',
  ];
}

export function scenariosSection(report: AnalysisReport): SafeHtml {
  const lab = labLabel(report.condition);
  const headers = ['Scenario', 'Phase', 'Target', 'Measured runs', 'Lab median', 'Median 95% CI', 'Deep-dived'];
  const body = report.scenarios.length === 0
    ? html`<p>No scenario was measured.</p>`
    : table(headers, report.scenarios.map((s) => scenarioRow(s)), `Every measured scenario, ${lab}`);
  return html`<h2 id="scenarios">Scenarios</h2>
<p class="note">Interaction duration per scenario, ${lab}. The exact median CI needs at least 6 runs; below that the range is shown.</p>${body}`;
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value)}`;
}

function comparisonRow(c: Comparison): HtmlPart[] {
  return [
    c.label + (c.confounded === undefined ? '' : ` (confounded: ${c.confounded})`),
    `${c.nBaseline} / ${c.nVariant}`,
    `${Math.round(c.medianBaselineMs)} / ${Math.round(c.medianVariantMs)} ms`,
    `${signed(c.shift.estimate)} ms [${signed(c.shift.low)}, ${signed(c.shift.high)}]`,
    `${c.p.toPrecision(2)} / ${c.pHolm.toPrecision(2)}`,
    `${c.cliffsDelta.toFixed(2)} (${c.magnitude})`,
    c.significant ? 'yes' : 'no',
  ];
}

/** Boot vs idle (and third-party arms): Hodges-Lehmann shift + CI, Mann-Whitney p with Holm, Cliff's delta. */
export function comparisonsSection(report: AnalysisReport): SafeHtml {
  const head = html`<h2 id="comparisons">Comparisons</h2>`;
  if (report.comparisons.length === 0) {
    return html`${head}<p>No comparison: a two-sample test needs at least ${COMPARISON_MIN_RUNS} measured runs in both arms (for example the same target at boot and when idle).</p>`;
  }
  const headers = ['Comparison', 'n baseline / variant', 'Medians baseline / variant', 'Shift (Hodges-Lehmann, 95% CI)', 'p / Holm p', "Cliff's delta", 'Significant'];
  return html`${head}<p class="note">Positive shift = the variant is slower. Significant = Holm-adjusted p &lt; 0.05 and the shift CI excludes 0.</p>
${table(headers, report.comparisons.map((c) => comparisonRow(c)), `Comparisons, ${labLabel(report.condition)}`)}`;
}
