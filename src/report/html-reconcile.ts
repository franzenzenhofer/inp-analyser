import type { AnalysisReport } from '../model/report.js';
import { bucketBar, densityShares, type BucketShares } from './html-bars.js';
import { html, table, type SafeHtml } from './html-escape.js';
import { bucketOf, type Bucket, type ReconciledScenario } from './reconcile.js';
import { BUCKET_LABEL, BUCKETS, labLabel, scenarioLabel } from './render-format.js';

/** Lab scenarios per bucket of their median: a share of scenarios, never a share of users. */
function labShares(buckets: readonly Bucket[], lab: string): BucketShares {
  const count = (b: Bucket): number => buckets.filter((x) => x === b).length;
  const n = buckets.length;
  const shares = { good: count('good') / n, 'needs-improvement': count('needs-improvement') / n, poor: count('poor') / n };
  const legend = { good: `${count('good')} of ${n}`, 'needs-improvement': `${count('needs-improvement')} of ${n}`, poor: `${count('poor')} of ${n}` };
  return { shares, legend, title: `Lab scenarios by median, ${lab}: ${BUCKETS.map((b) => `${BUCKET_LABEL[b]} ${legend[b]}`).join(', ')}` };
}

function bars(report: AnalysisReport, buckets: readonly Bucket[]): SafeHtml {
  const lab = labLabel(report.condition);
  const field = report.reconciliation?.field;
  const fieldRow = field === undefined || field.kind === 'no-data'
    ? html`<div class="label">Field (CrUX)</div><div>No field data.</div>`
    : html`<div class="label">Field: real-user page loads<br>CrUX ${field.formFactor}, ${field.level} level</div><div>${bucketBar(densityShares(field.densities, `CrUX ${field.formFactor} INP distribution`))}</div>`;
  const labRow = buckets.length === 0
    ? html`<div class="label">Lab scenarios</div><div>No measured scenario.</div>`
    : html`<div class="label">Lab: scenarios by median<br>${lab}</div><div>${bucketBar(labShares(buckets, lab))}</div>`;
  return html`<div class="compare">${fieldRow}${labRow}</div>`;
}

function rows(report: AnalysisReport, scenarios: readonly ReconciledScenario[]): SafeHtml {
  const body = scenarios.map((s) => [
    html`<code>${scenarioLabel(s.scenarioId, report)}</code>`,
    `${Math.round(s.medianMs)} ms`,
    s.ciHighMs === undefined ? 'n<6: no CI' : `${Math.round(s.ciHighMs)} ms`,
    BUCKET_LABEL[s.bucket],
    s.reachesFieldP75 ? 'yes' : 'no',
  ]);
  const caption = `Lab scenarios (${labLabel(report.condition)}) against the field p75`;
  return table(['Scenario', 'Lab median', 'Upper 95% CI', 'Bucket of lab median', 'Reaches field p75'], body, caption);
}

/** Field p75 vs the lab scenarios that reach it (src/report/reconcile.ts), with the two distributions side by side. */
export function reconcileSection(report: AnalysisReport): SafeHtml {
  const head = html`<h2 id="reconciliation">Field vs lab</h2>`;
  const r = report.reconciliation;
  if (r === undefined) {
    const buckets = report.scenarios.flatMap((s) => (s.summary.median === undefined ? [] : [bucketOf(s.summary.median)]));
    return html`${head}<p>No field data, so nothing to reconcile: the lab scenarios below stand alone and are not INP.</p>${bars(report, buckets)}`;
  }
  const verdict = r.verdict === 'reproduced' ? 'Reproduced in the lab' : r.verdict === 'not-reproduced' ? 'Not reproduced in the lab' : 'No field data';
  return html`${head}<p><strong>${verdict}.</strong> ${r.text}</p>
<p class="note">A scenario reaches the field p75 when its upper 95% CI (or, below 6 runs, its median) is at or above it.</p>
${bars(report, r.scenarios.map((s) => s.bucket))}${rows(report, r.scenarios)}`;
}
