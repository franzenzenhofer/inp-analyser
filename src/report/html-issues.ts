import type { Evidence, Issue } from '../model/issue.js';
import type { AnalysisReport } from '../model/report.js';
import { html, join, link, table, type HtmlPart, type SafeHtml } from './html-escape.js';
import { CONFIRM_MIN_RUNS, CONFIRM_MIN_SHARE } from '../issues/engine.js';
import { CERTAINTY_LABEL, PHASE_LABEL, SEVERITY_LABEL, issueMsText, labLabel, reproText, scenarioLabel } from './render-format.js';

/** Wording of the rule in src/issues/engine.ts (certainty()). */
const CERTAINTY_NOTE: Readonly<Record<Issue['certainty'], string>> = {
  confirmed: `deep-dive with >= ${CONFIRM_MIN_RUNS} attribution runs, fired in >= ${CONFIRM_MIN_SHARE * 100}% of them`,
  intermittent: `deep-dive with >= ${CONFIRM_MIN_RUNS} attribution runs, fired in fewer than ${CONFIRM_MIN_SHARE * 100}% of them`,
  'screening-only': `no deep-dive or fewer than ${CONFIRM_MIN_RUNS} attribution runs - not confirmed`,
};

function evidenceValue(e: Evidence): HtmlPart {
  if (e.url === undefined) return e.value;
  return e.value === e.url ? link(e.url) : html`${e.value}<br>${link(e.url)}`;
}

function evidenceTable(issue: Issue): SafeHtml {
  if (issue.evidence.length === 0) return html`<p class="note">No evidence rows attached.</p>`;
  const rows = issue.evidence.map((e) => [e.label, evidenceValue(e), e.ms === undefined ? '' : `${Math.round(e.ms)}`]);
  return table(['Evidence', 'Script / value', 'ms'], rows, `Evidence for "${issue.title}"`);
}

function tags(issue: Issue): SafeHtml {
  return html`<p class="tags">
<span class="tag"><span class="dot ${issue.severity}"></span>${SEVERITY_LABEL[issue.severity]}</span>
<span class="tag">${PHASE_LABEL[issue.phase]}</span>
<span class="tag">${CERTAINTY_LABEL[issue.certainty]}</span></p>`;
}

function facts(issue: Issue, report: AnalysisReport): SafeHtml {
  const target = issue.targetSelector === undefined ? html`` : html`<dt>Element</dt><dd><code>${issue.targetSelector}</code></dd>`;
  const scenarios = join(issue.scenarioIds.map((id, i) => html`${i > 0 ? ', ' : ''}<code>${scenarioLabel(id, report)}</code>`));
  return html`<dl class="facts">
<dt>${labLabel(report.condition)}</dt><dd>${issueMsText(issue)}</dd>
<dt>Reproducibility</dt><dd>${reproText(issue)}</dd>
<dt>Certainty</dt><dd>${CERTAINTY_LABEL[issue.certainty]}: ${CERTAINTY_NOTE[issue.certainty]}</dd>
${target}
<dt>Scenarios</dt><dd>${scenarios}</dd>
<dt>Why this counts</dt><dd>${link(issue.specUrl)}</dd>
</dl>`;
}

function issueArticle(issue: Issue, rank: number, report: AnalysisReport): SafeHtml {
  return html`<article class="issue" id="issue-${rank}">
<h3><span class="rank">#${rank}</span>${issue.title}</h3>
${tags(issue)}${facts(issue, report)}${evidenceTable(issue)}
<p class="note">Rule <code>${issue.ruleId}</code></p>
</article>`;
}

/** Issues, not fixes: what is slow, in which phase, how sure, with evidence and the spec link. No remedies. */
export function issuesSection(report: AnalysisReport): SafeHtml {
  const intro = html`<p class="note">Ranked as diagnosed. Every number is ${labLabel(report.condition)}, measured over repeated runs - lab evidence, not INP.</p>`;
  if (report.issues.length === 0) return html`<h2 id="issues">Issues</h2>${intro}<p>No issue fired in the measured interactions.</p>`;
  return html`<h2 id="issues">Issues (${report.issues.length})</h2>${intro}${join(report.issues.map((issue, i) => issueArticle(issue, i + 1, report)))}`;
}
