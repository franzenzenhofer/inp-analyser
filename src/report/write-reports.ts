import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalysisReport } from '../model/report.js';
import type { RunStore } from '../store/jsonl.js';
import { renderHtml } from './render-html.js';
import { renderTerminal, terminalColors } from './render-terminal.js';

export const HTML_REPORT_FILE = 'report.html';

/**
 * report.json is the machine-readable result; renderers (terminal, HTML) read only this shape.
 * Writes report.json + report.html and prints the terminal summary (colours only on a TTY).
 */
export async function writeReports(store: RunStore, report: AnalysisReport): Promise<void> {
  await store.writeJson('report.json', report);
  const htmlPath = join(store.dir, HTML_REPORT_FILE);
  await writeFile(htmlPath, renderHtml(report), 'utf8');
  console.log(renderTerminal(report, htmlPath, terminalColors(process.stdout.isTTY)));
}
