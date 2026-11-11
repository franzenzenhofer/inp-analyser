import { describe, expect, it } from 'vitest';
import { fullSample, labOnlySample } from '../../tests/support/report-samples.js';
import type { AnalysisReport } from '../model/report.js';
import { escapeHtml, html } from './html-escape.js';
import { REPORT_CSS } from './html-style.js';
import { renderHtml } from './render-html.js';

const MIN_FONT_PX = 16;

/** Every font-size (longhand or `font` shorthand) declared in CSS, as written. */
function fontSizes(css: string): string[] {
  return [...css.matchAll(/font(?:-size)?\s*:\s*([^;}]+)/g)].map((m) => (m[1] ?? '').trim().split(/[\s/]/)[0] ?? '');
}

function visibleText(doc: string): string {
  return doc.replaceAll(/<style>[\s\S]*?<\/style>/g, ' ').replaceAll(/<[^>]+>/g, ' ').replaceAll(/https?:\/\/\S+/g, ' ');
}

function hostile(report: AnalysisReport): AnalysisReport {
  const evil = '<script>alert(1)</script>';
  const [first] = report.scenarios;
  if (first === undefined) throw new Error('sample has no scenario');
  const target = { ...first.target, label: evil, selector: `button[data-x="${evil}"]` };
  const issues = report.issues.map((i) => ({ ...i, title: evil, evidence: [...i.evidence, { label: evil, value: 'javascript:alert(1)', url: 'javascript:alert(1)' }] }));
  return { ...report, url: `https://example.com/?q=${evil}`, issues, scenarios: [{ ...first, target }, ...report.scenarios.slice(1)], targets: { ...report.targets, measured: [target] } };
}

describe('renderHtml', () => {
  const full = renderHtml(fullSample());
  const labOnly = renderHtml(labOnlySample());

  it('headlines the CrUX PHONE p75 with level, period, densities and PSI parity', () => {
    expect(full).toContain('<p class="hero-value">130<span class="unit">ms</span></p>');
    expect(full).toContain('Field INP, CrUX PHONE p75');
    expect(full).toContain('PSI shows the same: 130 ms');
    expect(full).toContain('page (URL) level');
    expect(full).toContain('2026-10-12 to 2026-11-08');
    expect(full).toMatch(/good &lt;= 200 ms: <strong>86\.5%<\/strong>/);
    expect(full).toMatch(/poor &gt; 500 ms: <strong>3\.9%<\/strong>/);
    expect(full).toContain('87 ms (PSI shows the same: 87 ms)');
  });

  it('says plainly that there is no field data when there is none', () => {
    expect(labOnly).toContain('<p class="hero-none">No field data</p>');
    expect(labOnly).toContain('this report has no INP number');
    expect(labOnly).not.toContain('class="hero-value"');
  });

  it('labels every lab value and never calls a lab number INP', () => {
    expect(full).toContain('<dt>lab @ CPU 4x, mobile</dt><dd>median 349 ms (95% CI 346-360 ms)</dd>');
    expect(full).toContain('Every measured scenario, lab @ CPU 4x, mobile');
    for (const doc of [full, labOnly]) expect(visibleText(doc)).not.toMatch(/INP\W{0,3}(349|354|13|9)\s*ms/);
  });

  it('renders issues with phase, certainty, reproducibility, evidence and spec link - no remedies', () => {
    expect(full).toContain('Input waited for a first-party long task');
    expect(full).toContain('fired in 6 of 6 runs (95% CI 61-100%)');
    expect(full).toContain('<a href="http://site.inp.test:56655/busy.js">http://site.inp.test:56655/busy.js</a>');
    expect(full).toContain('<a href="https://web.dev/articles/optimize-input-delay">');
    expect(full).toContain('<code>button#menu-toggle</code>');
    expect(visibleText(full)).not.toMatch(/\b(should|recommend|consider|try to|we suggest|you can)\b/i);
  });

  it('reconciles field p75 with the lab scenarios and shows both distributions', () => {
    expect(full).toContain('Reproduced in the lab');
    expect(full).toContain('1 lab scenario(s) reach it');
    expect(full).toContain('Lab: scenarios by median');
    expect(full).toMatch(/needs improvement 200-500 ms: <strong>1 of 3<\/strong>/);
  });

  it('draws the hazard timeline and the CrUX history as inline SVG', () => {
    expect(full.match(/<rect [^>]*fill="#2a78d6"/g)).toHaveLength(6);
    expect(full).toContain('FCP 520 ms');
    expect(full).toContain('busiest 1 s after FCP: 958 ms of long tasks');
    expect(full).toContain('<text class="strong" x="308" y="');
    expect(full).toMatch(/>130 ms<\/text>/);
  });

  it('draws ineligible CrUX history periods as gaps', () => {
    const report = fullSample();
    const field = report.field;
    if (field === undefined) throw new Error('sample has no field data');
    const url = field.history.phone.url;
    if (url.kind !== 'data') throw new Error('sample has no url history');
    const p75s = url.metrics.interaction_to_next_paint?.p75s.map((p, i) => (i === 10 ? null : p)) ?? [];
    const history = { ...field.history, phone: { ...field.history.phone, url: { ...url, metrics: { interaction_to_next_paint: { p75s, densities: [] } } } } };
    const doc = renderHtml({ ...report, field: { ...field, history } });
    const path = /<path d="([^"]+)" fill="none" stroke="#2a78d6"/.exec(doc)?.[1] ?? '';
    expect(path.match(/M/g)).toHaveLength(2);
    expect(doc).toContain('1 ineligible period(s) shown as gaps');
  });

  it('shows scenarios with CI or the n<6 range, and the empty comparisons case', () => {
    expect(full).toContain('349-363 ms');
    expect(full).toContain('n&lt;6: range 10-19 ms');
    expect(full).toContain('No comparison: a two-sample test needs at least 5 measured runs');
    expect(full).toContain('Excluded as dangerous: none.');
    expect(full).toContain('<dt>Page loads made</dt><dd>26</dd>');
    expect(full).toContain('<dt>Seed</dt><dd>42');
  });

  it('escapes every string from the report (untrusted page content)', () => {
    const doc = renderHtml(hostile(fullSample()));
    expect(doc).not.toContain('<script>');
    expect(doc).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(doc).not.toMatch(/href="javascript:/i);
    expect(doc).toContain('<code>javascript:alert(1)</code>');
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
    expect(html`<b title="${'"x"'}">${'<i>'}</b>`.value).toBe('<b title="&quot;x&quot;">&lt;i&gt;</b>');
  });

  it('is one self-contained file: no script, no external asset', () => {
    for (const doc of [full, labOnly]) {
      expect(doc).not.toMatch(/<script|<link|<img|<iframe|@import|url\(|@font-face/i);
      expect(doc).not.toMatch(/\ssrc=/i);
    }
  });

  it('declares no font size below 16px (CSS and SVG)', () => {
    const sizes = fontSizes(REPORT_CSS);
    expect(sizes.length).toBeGreaterThan(10);
    for (const size of sizes) {
      expect(size, `font size "${size}" must be in px`).toMatch(/^\d+(\.\d+)?px$/);
      expect(Number.parseFloat(size)).toBeGreaterThanOrEqual(MIN_FONT_PX);
    }
    for (const doc of [full, labOnly]) {
      expect(doc).not.toMatch(/font-size="|<small|<sub|<sup/);
      for (const size of fontSizes(doc)) expect(Number.parseFloat(size)).toBeGreaterThanOrEqual(MIN_FONT_PX);
    }
  });
});
