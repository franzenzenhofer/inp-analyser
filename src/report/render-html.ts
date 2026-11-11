import type { AnalysisReport } from '../model/report.js';
import { html, link, trusted, type SafeHtml } from './html-escape.js';
import { fieldSection } from './html-field.js';
import { hazardSection } from './html-hazard.js';
import { issuesSection } from './html-issues.js';
import { reconcileSection } from './html-reconcile.js';
import { runSection } from './html-run.js';
import { comparisonsSection, scenariosSection } from './html-scenarios.js';
import { REPORT_CSS } from './html-style.js';
import { labLabel } from './render-format.js';

function header(report: AnalysisReport): SafeHtml {
  return html`<header>
<h1>INP issues for ${report.url}</h1>
<p class="meta"><span>${link(report.url)}</span><span>generated ${report.generatedAt}</span><span>${labLabel(report.condition)}</span><span>seed ${report.seed}</span><span>${report.chromeVersion}</span></p>
<p class="meta"><span><a href="#issues">Issues</a></span><span><a href="#reconciliation">Field vs lab</a></span><span><a href="#hazard">Main thread during load</a></span><span><a href="#scenarios">Scenarios</a></span><span><a href="#comparisons">Comparisons</a></span><span><a href="#run">Run facts</a></span></p>
</header>`;
}

/** One self-contained HTML file: inline CSS, inline SVG, no script, no external asset, every value escaped. */
export function renderHtml(report: AnalysisReport): string {
  const doc = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>INP issues - ${report.url}</title>
<style>${trusted(REPORT_CSS)}</style>
</head>
<body>
<main>
${header(report)}
${fieldSection(report)}
${issuesSection(report)}
${reconcileSection(report)}
${hazardSection(report)}
${scenariosSection(report)}
${comparisonsSection(report)}
${runSection(report)}
<footer>${report.tool.name} ${report.tool.version}. Diagnoses with evidence; lab values are evidence, the only INP is the CrUX field p75.</footer>
</main>
</body>
</html>
`;
  return doc.value;
}
