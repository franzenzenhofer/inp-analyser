/**
 * The report's only stylesheet. Rule: no font-size below 16px anywhere (tested in render-html.test.ts);
 * if something does not fit at 16px the layout changes (tables and charts scroll sideways), never the type.
 * Series colours are validated with the dataviz palette validator (first party #2a78d6, third party #eb6834:
 * CVD dE 24.7, normal dE 33.6, both >= 3:1 on white); status colours good/NI/poor always carry a text label.
 */
export const REPORT_CSS = `
:root {
  color-scheme: light;
  --ink: #111418; --ink-2: #474c55; --rule: #c9cdd3; --grid: #e4e6ea; --panel: #f3f5f7; --link: #1c5cab;
  --first: #2a78d6; --third: #eb6834; --good: #0ca30c; --ni: #fab219; --poor: #d03b3b; --peak: #dfe3e8;
}
* { box-sizing: border-box; }
html { font-size: 16px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0; background: #ffffff; color: var(--ink);
  font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
main { max-width: 1120px; margin: 0 auto; padding: 32px 32px 64px; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; font-weight: 750; letter-spacing: -0.01em; }
h2 { font-size: 24px; line-height: 1.25; margin: 56px 0 16px; padding-top: 14px; border-top: 4px solid var(--ink); font-weight: 750; }
h3 { font-size: 20px; line-height: 1.3; margin: 0 0 10px; font-weight: 700; }
p { margin: 0 0 12px; }
a { color: var(--link); text-underline-offset: 3px; overflow-wrap: anywhere; }
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 16px; overflow-wrap: anywhere; }
caption { font-size: 16px; text-align: left; color: var(--ink-2); padding: 0 0 8px; }
.meta { color: var(--ink-2); font-size: 16px; margin: 0; }
.meta span + span::before { content: " | "; color: var(--rule); }
.hero { display: grid; grid-template-columns: minmax(260px, 1fr) 2fr; gap: 24px 48px; margin-top: 28px; padding: 28px 0; border-top: 4px solid var(--ink); border-bottom: 1px solid var(--rule); }
.hero-label { font-size: 18px; font-weight: 700; margin: 0; }
.hero-value { font-size: 96px; line-height: 1; font-weight: 750; letter-spacing: -0.03em; margin: 8px 0; }
.hero-value .unit { font-size: 32px; font-weight: 600; letter-spacing: 0; margin-left: 6px; }
.hero-none { font-size: 22px; font-weight: 650; margin: 8px 0; }
.parity { font-weight: 650; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 20px; margin: 0; font-size: 16px; }
.facts dt { color: var(--ink-2); }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.tag { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--rule); border-radius: 2px; padding: 1px 10px; font-size: 16px; font-weight: 600; white-space: nowrap; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 1px; flex: none; }
.dot.good { background: var(--good); } .dot.needs-improvement { background: var(--ni); } .dot.poor { background: var(--poor); }
.dot.info { background: var(--rule); } .dot.first { background: var(--first); } .dot.third { background: var(--third); }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.bar { display: flex; gap: 2px; height: 20px; margin: 6px 0 10px; }
.bar > span { display: block; height: 100%; min-width: 2px; }
.bar > span:first-child { border-radius: 2px 0 0 2px; } .bar > span:last-child { border-radius: 0 2px 2px 0; }
.bar .good { background: var(--good); } .bar .needs-improvement { background: var(--ni); } .bar .poor { background: var(--poor); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 22px; list-style: none; margin: 0; padding: 0; font-size: 16px; }
.legend li { display: inline-flex; align-items: center; gap: 8px; }
.compare { display: grid; grid-template-columns: max-content 1fr; gap: 10px 24px; align-items: start; margin: 20px 0; }
.compare .label { font-weight: 650; padding-top: 2px; }
.issue { padding: 22px 0; border-bottom: 1px solid var(--rule); }
.issue:first-of-type { padding-top: 6px; }
.issue .rank { color: var(--ink-2); margin-right: 8px; }
.scroll { overflow-x: auto; margin: 12px 0 20px; }
.scroll:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
table { border-collapse: collapse; font-size: 16px; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; vertical-align: top; padding: 8px 14px 8px 0; border-bottom: 1px solid var(--grid); }
th { font-weight: 700; border-bottom: 2px solid var(--ink); white-space: nowrap; }
td code { overflow-wrap: break-word; }
td.num, th.num { text-align: right; }
.chart { margin: 8px 0 4px; }
.chart svg { display: block; }
svg text { font: 16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: var(--ink-2); }
svg .strong { fill: var(--ink); font-weight: 650; }
.note { color: var(--ink-2); }
ul.plain { margin: 0; padding-left: 22px; }
ul.plain li { margin: 0 0 6px; overflow-wrap: anywhere; }
details { margin: 8px 0 16px; }
summary { cursor: pointer; font-weight: 650; }
footer { margin-top: 56px; color: var(--ink-2); font-size: 16px; }
@media (max-width: 760px) {
  main { padding: 20px 16px 48px; }
  .hero { grid-template-columns: 1fr; }
  .hero-value { font-size: 72px; }
  .compare, .facts { grid-template-columns: 1fr; }
  .compare .label { padding-top: 0; }
  .facts dd { margin-bottom: 8px; }
  th, td { min-width: 128px; }
  h1 { font-size: 26px; }
}
`;
