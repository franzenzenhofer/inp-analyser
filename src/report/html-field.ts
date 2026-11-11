import type { AnalysisReport } from '../model/report.js';
import { bucketBar, densityShares } from './html-bars.js';
import { html, join, link, type SafeHtml } from './html-escape.js';
import { historySection } from './html-history.js';
import { BUCKET_LABEL, INP_SPEC_URL, deviceFieldOf, fieldHeadline, levelText, parityText, percent, periodText } from './render-format.js';

/** Origin-level p75 next to the page-level headline, so a page vs site gap is visible. */
function originLine(report: AnalysisReport): SafeHtml {
  const device = deviceFieldOf(report);
  if (device === undefined || device.inp.kind === 'no-data' || device.inp.level === 'origin') return html``;
  const origin = device.origin;
  const inp = origin.kind === 'data' ? origin.metrics.interaction_to_next_paint : undefined;
  if (inp === undefined) return html`<dt>Origin level</dt><dd>no CrUX INP for the origin</dd>`;
  return html`<dt>Origin level</dt><dd>${inp.p75} ms (${parityText(device.psiParity.origin)})</dd>`;
}

function heroData(report: AnalysisReport): SafeHtml {
  const h = fieldHeadline(report);
  if (h.kind === 'none') {
    return html`<div><p class="hero-label">Field INP, CrUX ${h.formFactor}</p><p class="hero-none">No field data</p></div>
<div><p>${h.text}</p></div>`;
  }
  const d = h.densities;
  const bar = bucketBar(densityShares(d, `Real-user INP distribution: good ${percent(d.good)}, needs improvement ${percent(d.needsImprovement)}, poor ${percent(d.poor)}`));
  return html`<div>
<p class="hero-label">Field INP, CrUX ${h.formFactor} p75</p>
<p class="hero-value">${h.p75}<span class="unit">ms</span></p>
<p class="tags"><span class="tag"><span class="dot ${h.bucket}"></span>${BUCKET_LABEL[h.bucket]}</span></p>
<p class="parity">${h.parity}</p>
</div>
<div>
<p><strong>Share of real-user page loads per INP rating</strong><br>CrUX ${h.formFactor}, ${periodText(h.period)}</p>
${bar}
<dl class="facts" style="margin-top: 18px">
<dt>Source</dt><dd>CrUX API p75, ${h.formFactor}, ${levelText(h.level)}</dd>
<dt>Collection period</dt><dd>${periodText(h.period)} (28 days)</dd>
${originLine(report)}
<dt>Thresholds</dt><dd>good &lt;= 200 ms, poor &gt; 500 ms (${link(INP_SPEC_URL)})</dd>
</dl>
</div>`;
}

/** Headline: the field number is the only INP in the report; lab numbers follow as evidence. */
export function fieldSection(report: AnalysisReport): SafeHtml {
  const notes = report.field === undefined ? html`` : html`<details><summary>Field data sources and notes (${report.field.sourceNotes.length})</summary><ul class="plain">${join(report.field.sourceNotes.map((n) => html`<li>${n}</li>`))}</ul></details>`;
  return html`<section class="hero" aria-label="Field INP">${heroData(report)}</section>
<section aria-label="Field INP history">${historySection(report)}${notes}</section>`;
}
