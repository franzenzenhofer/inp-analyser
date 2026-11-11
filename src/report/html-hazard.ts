import { HAZARD_WINDOW_MS } from '../analysis/hazard.js';
import type { LongTask } from '../model/measurement.js';
import type { AnalysisReport } from '../model/report.js';
import { html, join, link, table, type SafeHtml } from './html-escape.js';
import { linearScale, niceStep, px, thousands, ticksBetween, type Scale } from './html-svg.js';
import { labLabel } from './render-format.js';

const W = 960;
const M = { left: 132, right: 28 } as const;
const LANE = { first: 64, third: 100, taps: 136 } as const;
const BAR_H = 20;
const AXIS_Y = 172;
const H = 228;

interface Tap { readonly offsetMs: number; readonly label: string }

function taps(report: AnalysisReport): Tap[] {
  return report.scenarios.flatMap((s) => (s.scenario.phase === 'boot' && s.scenario.offsetMs !== undefined
    ? [{ offsetMs: s.scenario.offsetMs, label: `boot tap on ${s.target.selector} @ ${s.scenario.offsetMs} ms: lab median ${s.summary.median === undefined ? 'not measured' : `${Math.round(s.summary.median)} ms`}` }]
    : []));
}

function domainEnd(report: AnalysisReport, tapList: readonly Tap[]): number {
  const h = report.hazard;
  return Math.max(h.fcpMs, h.peakHazardMs + HAZARD_WINDOW_MS, ...h.longTasks.map((t) => t.startTime + t.durationMs), ...tapList.map((t) => t.offsetMs)) * 1.03;
}

function axis(x: Scale, end: number): SafeHtml {
  const step = niceStep(end, 6);
  const ticks = join(ticksBetween(0, end, step).map((t) => html`<line x1="${px(x(t))}" x2="${px(x(t))}" y1="${LANE.first - 8}" y2="${AXIS_Y}" stroke="#e4e6ea" stroke-width="1"/><text x="${px(x(t))}" y="${AXIS_Y + 24}" text-anchor="middle">${thousands(t)}</text>`));
  return html`${ticks}<line x1="${M.left}" x2="${W - M.right}" y1="${AXIS_Y}" y2="${AXIS_Y}" stroke="#c9cdd3" stroke-width="1"/>
<text x="${W - M.right}" y="${AXIS_Y + 50}" text-anchor="end">ms since navigation start</text>`;
}

function anchored(xPos: number): 'start' | 'end' {
  return xPos > W - 380 ? 'end' : 'start';
}

function markers(report: AnalysisReport, x: Scale): SafeHtml {
  const h = report.hazard;
  const fx = px(x(h.fcpMs));
  const p0 = px(x(h.peakHazardMs));
  const p1 = px(x(h.peakHazardMs + HAZARD_WINDOW_MS));
  const peakText = `busiest 1 s after FCP: ${Math.round(h.peakBusyMs)} ms of long tasks`;
  return html`<rect x="${p0}" y="${LANE.first - 30}" width="${px(p1 - p0)}" height="${AXIS_Y - LANE.first + 30}" fill="#e7eaee"><title>${peakText} (${Math.round(h.peakHazardMs)}-${Math.round(h.peakHazardMs + HAZARD_WINDOW_MS)} ms)</title></rect>
<text x="${anchored(p0) === 'start' ? p0 + 6 : p1 - 6}" y="${LANE.first - 12}" text-anchor="${anchored(p0)}">${peakText}</text>
<line x1="${fx}" x2="${fx}" y1="8" y2="${AXIS_Y}" stroke="#111418" stroke-width="2"/>
<text class="strong" x="${anchored(fx) === 'start' ? fx + 8 : fx - 8}" y="22" text-anchor="${anchored(fx)}">FCP ${Math.round(h.fcpMs)} ms</text>`;
}

function taskBar(t: LongTask, x: Scale): SafeHtml {
  const x0 = x(t.startTime);
  const width = Math.max(1, x(t.startTime + t.durationMs) - x0 - 2);
  const party = t.isFirstParty ? 'first party' : 'third party';
  const tip = `long task ${Math.round(t.durationMs)} ms at ${Math.round(t.startTime)} ms - ${t.entity} (${party}) - ${t.topScriptUrl}`;
  return html`<rect x="${px(x0 + 1)}" y="${t.isFirstParty ? LANE.first : LANE.third}" width="${px(width)}" height="${BAR_H}" rx="2" fill="${t.isFirstParty ? '#2a78d6' : '#eb6834'}"><title>${tip}</title></rect>`;
}

function tapMarks(tapList: readonly Tap[], x: Scale): SafeHtml {
  let lastLabelX = -Infinity;
  return join(tapList.map((t) => {
    const cx = px(x(t.offsetMs));
    const showLabel = cx - lastLabelX >= 96;
    if (showLabel) lastLabelX = cx;
    const y = LANE.taps;
    return html`<path d="M${cx - 8},${y} L${cx + 8},${y} L${cx},${y + 14} Z" fill="#111418"><title>${t.label}</title></path>${showLabel ? html`<text x="${cx + 11}" y="${y + 13}">${t.offsetMs}</text>` : html``}`;
  }));
}

function laneLabel(y: number, text: string): SafeHtml {
  return html`<text x="${M.left - 12}" y="${y + 15}" text-anchor="end">${text}</text>`;
}

function laneLabels(): SafeHtml {
  return html`${laneLabel(LANE.first, 'First party')}${laneLabel(LANE.third, 'Third party')}${laneLabel(LANE.taps, 'Boot taps')}`;
}

function chart(report: AnalysisReport): SafeHtml {
  const tapList = taps(report);
  const end = domainEnd(report, tapList);
  const x = linearScale({ from: 0, to: end }, { from: M.left, to: W - M.right });
  const title = `Long tasks since navigation start: ${report.hazard.longTasks.length} tasks, FCP ${Math.round(report.hazard.fcpMs)} ms`;
  return html`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><title>${title}</title>
${markers(report, x)}${axis(x, end)}${laneLabels()}${join(report.hazard.longTasks.map((t) => taskBar(t, x)))}${tapMarks(tapList, x)}</svg>`;
}

function taskTable(tasks: readonly LongTask[]): SafeHtml {
  const rows = tasks.map((t) => [`${Math.round(t.startTime)}`, `${Math.round(t.durationMs)}`, `${Math.round(t.startTime + t.durationMs)}`, t.entity, t.isFirstParty ? 'first party' : 'third party', t.topScriptUrl === '' ? 'unknown' : link(t.topScriptUrl)]);
  return html`<details><summary>All ${tasks.length} long tasks as a table</summary>${table(['Start ms', 'Duration ms', 'End ms', 'Entity', 'Party', 'Top script'], rows, 'Long tasks of the preflight load, ms since navigation start')}</details>`;
}

/** Hazard timeline: main-thread long tasks of the preflight load, FCP, the busiest 1 s window and the boot taps. */
export function hazardSection(report: AnalysisReport): SafeHtml {
  const tasks = report.hazard.longTasks;
  const thirdParty = tasks.filter((t) => !t.isFirstParty).length;
  return html`<h2 id="hazard">Main thread during load</h2>
<p class="note">Long tasks of one preflight load (${labLabel(report.condition)}). An input that arrives inside a bar waits for it to end: that wait is input delay. ${tasks.length} long tasks, ${tasks.length - thirdParty} first party, ${thirdParty} third party.</p>
<ul class="legend"><li><span class="dot first"></span>first-party long task</li><li><span class="dot third"></span>third-party long task</li><li><span class="dot" style="background: #e7eaee"></span>busiest 1 s window after FCP</li><li>&#9660; boot tap time</li></ul>
<div class="chart scroll" role="region" aria-label="Long task timeline" tabindex="0">${chart(report)}</div>${taskTable(tasks)}`;
}
