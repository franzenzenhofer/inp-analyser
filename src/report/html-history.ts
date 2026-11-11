import type { CruxHistoryResult } from '../field/crux-history.js';
import type { CollectionPeriod } from '../field/crux-schema.js';
import type { AnalysisReport } from '../model/report.js';
import { html, join, table, type SafeHtml } from './html-escape.js';
import { linearScale, niceStep, px, ticksBetween, type Scale } from './html-svg.js';
import { formFactorOf } from './render-format.js';

/** CrUX History API INP p75 per weekly 28-day period, oldest first; null = ineligible period, drawn as a gap. */
interface Series {
  readonly level: 'url' | 'origin';
  readonly periods: readonly CollectionPeriod[];
  readonly p75s: readonly (number | null)[];
}

/** 380px = the content width on a 412px phone, so the chart never scrolls and its 16px text never scales. */
const W = 380;
const H = 220;
const M = { left: 52, right: 84, top: 20, bottom: 44 } as const;
/** INP good limit (https://web.dev/articles/inp#good-score). */
const GOOD_LIMIT = 200;

function seriesOf(history: CruxHistoryResult, level: Series['level']): Series | undefined {
  if (history.kind === 'no-data') return undefined;
  const inp = history.metrics.interaction_to_next_paint;
  if (inp === undefined || inp.p75s.every((p) => p === null)) return undefined;
  return { level, periods: history.collectionPeriods, p75s: inp.p75s };
}

/** The page-level series when CrUX has one (as the headline), else the origin series. */
function pickSeries(report: AnalysisReport): Series | undefined {
  if (report.field === undefined) return undefined;
  const h = formFactorOf(report.condition) === 'PHONE' ? report.field.history.phone : report.field.history.desktop;
  return seriesOf(h.url, 'url') ?? seriesOf(h.origin, 'origin');
}

function yDomain(values: readonly number[]): { from: number; to: number; step: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values, lo >= 100 ? GOOD_LIMIT : lo);
  const step = niceStep(Math.max(hi - lo, 10), 3);
  const from = Math.floor(lo / step) * step;
  return { from, to: Math.max(Math.ceil(hi / step) * step, from + step), step };
}

function linePath(p75s: readonly (number | null)[], x: Scale, y: Scale): string {
  return p75s.map((p, i) => (p === null ? '' : `${i > 0 && p75s[i - 1] !== null ? 'L' : 'M'}${px(x(i))},${px(y(p))}`)).join(' ').trim();
}

function yAxis(domain: { from: number; to: number; step: number }, y: Scale): SafeHtml {
  return join(ticksBetween(domain.from, domain.to, domain.step).map((t) => {
    const isLimit = t === GOOD_LIMIT;
    const stroke = isLimit ? '#8a9099' : '#e4e6ea';
    return html`<line x1="${M.left}" x2="${W - M.right}" y1="${px(y(t))}" y2="${px(y(t))}" stroke="${stroke}" stroke-width="1"/><text x="${M.left - 10}" y="${px(y(t) + 5)}" text-anchor="end">${t}</text>${isLimit ? html`<text x="${W - M.right + 8}" y="${px(y(t) + 5)}">good limit</text>` : html``}`;
  }));
}

function points(s: Series, x: Scale, y: Scale): SafeHtml {
  return join(s.p75s.map((p, i) => {
    const period = s.periods[i];
    const label = `${period === undefined ? `period ${i + 1}` : `${period.firstDate} to ${period.lastDate}`}: ${p === null ? 'no data (ineligible)' : `${p} ms`}`;
    const cy = p === null ? H - M.bottom : y(p);
    return html`<circle cx="${px(x(i))}" cy="${px(cy)}" r="9" fill="transparent"><title>${label}</title></circle>`;
  }));
}

function endMarker(s: Series, x: Scale, y: Scale): SafeHtml {
  const lastIndex = s.p75s.findLastIndex((p) => p !== null);
  const last = s.p75s[lastIndex];
  if (last === undefined || last === null) return html``;
  const cx = px(x(lastIndex));
  return html`<circle cx="${cx}" cy="${px(y(last))}" r="5" fill="#2a78d6" stroke="#ffffff" stroke-width="2"/><text class="strong" x="${cx + 12}" y="${px(y(last) + 5)}">${last} ms</text>`;
}

function xLabels(s: Series, x: Scale): SafeHtml {
  const first = s.periods[0];
  const last = s.periods.at(-1);
  if (first === undefined || last === undefined) return html``;
  const yText = H - M.bottom + 28;
  return html`<text x="${px(x(0))}" y="${yText}">${first.lastDate}</text><text x="${px(x(s.periods.length - 1))}" y="${yText}" text-anchor="end">${last.lastDate}</text>`;
}

function chart(s: Series): SafeHtml {
  const values = s.p75s.filter((p): p is number => p !== null);
  const domain = yDomain(values);
  const x = linearScale({ from: 0, to: Math.max(1, s.p75s.length - 1) }, { from: M.left, to: W - M.right });
  const y = linearScale({ from: domain.from, to: domain.to }, { from: H - M.bottom, to: M.top });
  const title = `CrUX INP p75 history, ${s.level} level, ${s.p75s.length} periods`;
  return html`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
<title>${title}</title>${yAxis(domain, y)}
<line x1="${M.left}" x2="${W - M.right}" y1="${H - M.bottom}" y2="${H - M.bottom}" stroke="#c9cdd3" stroke-width="1"/>
<path d="${linePath(s.p75s, x, y)}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
${endMarker(s, x, y)}${xLabels(s, x)}${points(s, x, y)}</svg>`;
}

function historyTable(s: Series): SafeHtml {
  const rows = s.p75s.map((p, i) => {
    const period = s.periods[i];
    return [period === undefined ? `period ${i + 1}` : `${period.firstDate} to ${period.lastDate}`, p === null ? 'no data (ineligible period)' : `${p} ms`];
  });
  return html`<details><summary>All ${s.p75s.length} periods as a table</summary>${table(['28-day period', 'INP p75'], rows, 'CrUX History API INP p75 per period, oldest first')}</details>`;
}

/** Inline SVG sparkline of the field p75 over the CrUX History API periods. */
export function historySection(report: AnalysisReport): SafeHtml {
  const s = pickSeries(report);
  const ff = formFactorOf(report.condition);
  if (s === undefined) return html`<p class="note">No CrUX INP history for ${ff}${report.field === undefined ? ' (field data not fetched)' : ''}.</p>`;
  const gaps = s.p75s.filter((p) => p === null).length;
  const gapNote = gaps === 0 ? 'no ineligible periods' : `${gaps} ineligible period(s) shown as gaps`;
  return html`<h3>Field INP p75 over time (CrUX ${ff}, ${s.level === 'url' ? 'page' : 'origin'} level)</h3>
<p class="note">Weekly 28-day periods, oldest first, period end dates on the axis; ${gapNote}. Source: <a href="https://developer.chrome.com/docs/crux/history-api">CrUX History API</a>.</p>
<div class="chart scroll" role="region" aria-label="CrUX INP history chart" tabindex="0">${chart(s)}</div>${historyTable(s)}`;
}
