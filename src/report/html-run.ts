import type { GlobalListener } from '../discovery/types.js';
import type { AnalysisReport } from '../model/report.js';
import type { Condition, Target } from '../model/scenario.js';
import { html, join, link, table, type HtmlPart, type SafeHtml } from './html-escape.js';
import { labLabel } from './render-format.js';

function thirdPartyText(c: Condition): string {
  const arm = c.thirdParty;
  if (arm.kind === 'allow') return 'all third parties allowed';
  return arm.kind === 'block-all' ? 'all third parties blocked' : `third party "${arm.entity}" blocked`;
}

function runFacts(report: AnalysisReport): SafeHtml {
  const r = report.run;
  const c = report.condition;
  const incomplete = r.incomplete === undefined ? html`` : html`<dt>Incomplete</dt><dd><strong>${r.incomplete}</strong></dd>`;
  return html`<dl class="facts">
<dt>Lab condition</dt><dd>${labLabel(c)} emulation, ${thirdPartyText(c)}, consent ${c.consent}, ${c.cache} cache</dd>
<dt>Runs</dt><dd>${r.runs} (${r.excludedRuns} excluded by machine health / sentinel checks)</dd>
<dt>Page loads made</dt><dd>${r.loads}</dd>
<dt>Seed</dt><dd>${report.seed} (randomised run order; the same seed repeats it)</dd>
<dt>Chrome</dt><dd>${report.chromeVersion} (headless, pinned Chrome for Testing)</dd>
<dt>Sentinel reference</dt><dd>${r.sentinelReferenceMs.map((v) => `${Math.round(v)}`).join(', ')} ms</dd>
<dt>Tool</dt><dd>${report.tool.name} ${report.tool.version}</dd>
<dt>Generated</dt><dd>${report.generatedAt}</dd>
${incomplete}
</dl>`;
}

function targetRow(t: Target): HtmlPart[] {
  return [html`<code>${t.selector}</code>`, t.label === '' ? '(no label)' : t.label, t.kind, t.aboveFold ? 'yes' : 'no', html`${t.safety}<br>${t.safetyReason}`];
}

function targetTables(report: AnalysisReport): SafeHtml {
  const headers = ['Selector', 'Label', 'Kind', 'Above fold', 'Safety class'];
  const { measured, excluded, globalListeners } = report.targets;
  const measuredHtml = measured.length === 0 ? html`<p>No target measured.</p>` : table(headers, measured.map((t) => targetRow(t)), `Targets measured (${measured.length})`);
  const excludedHtml = excluded.length === 0
    ? html`<p>Excluded as dangerous: none.</p>`
    : table(headers, excluded.map((t) => targetRow(t)), `Targets excluded as dangerous - never clicked (${excluded.length})`);
  return html`<h3>Targets</h3>${measuredHtml}${excludedHtml}${listenerTable(globalListeners)}`;
}

function listenerTable(listeners: readonly GlobalListener[]): SafeHtml {
  if (listeners.length === 0) return html`<p>Interaction listeners on document / window: none.</p>`;
  const rows = listeners.map((l) => [l.on, l.type, html`${link(l.url)}<br>line ${l.line}, column ${l.column}`]);
  return table(['On', 'Event', 'Script'], rows, `Interaction listeners on document / window (${listeners.length})`);
}

/** Run facts, what the run could not see, and every target measured / excluded / listening globally. */
export function runSection(report: AnalysisReport): SafeHtml {
  return html`<h2 id="run">Run facts and limitations</h2>${runFacts(report)}
<h3 style="margin-top: 28px">Limitations</h3><ul class="plain">${join(report.limitations.map((l) => html`<li>${l}</li>`))}</ul>
<div style="margin-top: 28px">${targetTables(report)}</div>`;
}
