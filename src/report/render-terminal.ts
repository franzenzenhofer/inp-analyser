import pc from 'picocolors';
import type { Issue } from '../model/issue.js';
import type { AnalysisReport } from '../model/report.js';
import {
  BUCKET_LABEL, CERTAINTY_LABEL, PHASE_LABEL, SEVERITY_LABEL,
  evidenceText, fieldHeadline, fieldSourceText, issueMsText, labLabel, percent, reproText, topEvidence,
} from './render-format.js';

export type Colors = ReturnType<typeof pc.createColors>;

/** Colors only on a TTY: piped output (CI logs, an AI reading stdout) stays plain text. */
export function terminalColors(isTty: boolean | undefined): Colors {
  // Node leaves isTTY undefined on pipes; createColors(undefined) would fall back to env detection (CI, FORCE_COLOR).
  return pc.createColors(isTty ?? false);
}

function headline(report: AnalysisReport, c: Colors): string[] {
  const h = fieldHeadline(report);
  if (h.kind === 'none') return [c.bold(`Field INP ${h.formFactor}: none`), `  ${h.text}`];
  const d = h.densities;
  return [
    c.bold(`Field INP ${h.formFactor}: ${h.p75} ms (${BUCKET_LABEL[h.bucket]})`),
    `  ${fieldSourceText(h)}`,
    `  real users: good ${percent(d.good)} | needs improvement ${percent(d.needsImprovement)} | poor ${percent(d.poor)}`,
    `  ${h.parity}`,
  ];
}

function severityColor(issue: Issue, c: Colors): (text: string) => string {
  if (issue.severity === 'poor') return c.red;
  return issue.severity === 'needs-improvement' ? c.yellow : c.dim;
}

function issueLines(issue: Issue, rank: number, report: AnalysisReport, c: Colors): string[] {
  const tag = `[${SEVERITY_LABEL[issue.severity]} | ${CERTAINTY_LABEL[issue.certainty]} | ${PHASE_LABEL[issue.phase]}]`;
  const top = topEvidence(issue);
  const target = issue.targetSelector === undefined ? '' : `${issue.targetSelector} - `;
  return [
    `${rank}. ${severityColor(issue, c)(tag)} ${c.bold(issue.title)}`,
    `   ${target}${labLabel(report.condition)}: ${issueMsText(issue)}; ${reproText(issue)}`,
    ...(top === undefined ? [] : [`   evidence: ${evidenceText(top)}`]),
    `   why this counts: ${issue.specUrl}`,
  ];
}

function issueSection(report: AnalysisReport, c: Colors): string[] {
  if (report.issues.length === 0) return [c.bold('Issues: none found in the measured interactions')];
  return [c.bold(`Issues (${report.issues.length}, ranked):`), ...report.issues.flatMap((issue, i) => issueLines(issue, i + 1, report, c))];
}

function runLine(report: AnalysisReport): string {
  const r = report.run;
  const incomplete = r.incomplete === undefined ? '' : `; INCOMPLETE: ${r.incomplete}`;
  return `Run: ${r.runs} runs (${r.excludedRuns} excluded), ${r.loads} page loads, seed ${report.seed}, ${report.chromeVersion}, ${labLabel(report.condition)}${incomplete}`;
}

/** Concise, AI-readable summary: field INP first, then the ranked issues, then where the HTML report is. */
export function renderTerminal(report: AnalysisReport, htmlPath: string, c: Colors): string {
  const reconciliation = report.reconciliation === undefined ? [] : [`Reconciliation: ${report.reconciliation.text}`];
  return [
    `${report.tool.name} ${report.tool.version} - ${report.url}`,
    ...headline(report, c),
    ...reconciliation,
    ...issueSection(report, c),
    runLine(report),
    `HTML report: ${htmlPath}`,
  ].join('\n');
}
