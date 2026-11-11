import { describe, expect, it } from 'vitest';
import { queryCruxRecord, type CruxMetricSummary } from '../../src/field/crux.js';
import { queryCruxHistory } from '../../src/field/crux-history.js';
import { INP_METRIC } from '../../src/field/crux-schema.js';
import { buildFieldSummary } from '../../src/field/field-summary.js';
import { API_KEY_ENV, readGoogleApiKey } from '../../src/field/http.js';
import { runPsiField } from '../../src/field/psi.js';

/** Real Google APIs, no mocks. Needs INP_GOOGLE_API_KEY; a missing key or a disabled API fails, never skips. */
const ORIGIN = 'https://en.wikipedia.org';
const NO_DATA_URL = 'https://en.wikipedia.org/wiki/Inp-analyser-e2e-page-that-does-not-exist-4711';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Two PSI attempts of up to 240 s each (one documented retry on 429/5xx). */
const PSI_TIMEOUT_MS = 600_000;

function expectInpSummary(inp: CruxMetricSummary | undefined): void {
  expect(inp).toBeDefined();
  expect(Number.isInteger(inp?.p75)).toBe(true);
  expect(inp?.p75).toBeGreaterThan(0);
  const sum = (inp?.densities.good ?? 0) + (inp?.densities.needsImprovement ?? 0) + (inp?.densities.poor ?? 0);
  expect(sum).toBeCloseTo(1, 2);
  expect(inp?.bounds).toEqual({ goodMax: 200, poorMin: 500 });
}

describe('field: API key', () => {
  it('fails loud with instructions when INP_GOOGLE_API_KEY is missing', () => {
    expect(() => readGoogleApiKey({})).toThrow(/INP_GOOGLE_API_KEY.*Chrome UX Report API.*apis\/credentials/s);
    expect(readGoogleApiKey({ [API_KEY_ENV]: ' abc ' })).toBe('abc');
  });
});

describe('field: CrUX API queryRecord (real network)', () => {
  const apiKey = readGoogleApiKey();

  it('origin PHONE: INP p75 is a positive integer, histogram densities sum to ~1, collection period is set', async () => {
    const result = await queryCruxRecord({ target: { kind: 'origin', origin: ORIGIN }, formFactor: 'PHONE', metrics: [INP_METRIC] }, apiKey);
    expect(result.kind).toBe('data');
    if (result.kind !== 'data') throw new Error(`expected data, got ${result.reason}`);
    expectInpSummary(result.metrics.interaction_to_next_paint);
    expect(result.collectionPeriod.firstDate).toMatch(ISO_DATE);
    expect(result.collectionPeriod.lastDate > result.collectionPeriod.firstDate).toBe(true);
    console.log('[field] CrUX origin PHONE INP', result.metrics.interaction_to_next_paint, result.collectionPeriod);
  });

  it('url ALL form factors: INP, LCP and CLS (string-encoded in the API) parse to numbers', async () => {
    const metrics = ['interaction_to_next_paint', 'largest_contentful_paint', 'cumulative_layout_shift'] as const;
    const result = await queryCruxRecord({ target: { kind: 'url', url: `${ORIGIN}/` }, formFactor: 'ALL', metrics }, apiKey);
    if (result.kind !== 'data') throw new Error(`expected data, got ${result.reason}`);
    expectInpSummary(result.metrics.interaction_to_next_paint);
    expect(result.metrics.largest_contentful_paint?.p75).toBeGreaterThan(0);
    expect(result.metrics.cumulative_layout_shift?.p75).toBeGreaterThanOrEqual(0);
    expect(result.metrics.cumulative_layout_shift?.bounds).toEqual({ goodMax: 0.1, poorMin: 0.25 });
  });

  it('a URL without CrUX data returns the typed no-data result instead of throwing', async () => {
    const result = await queryCruxRecord({ target: { kind: 'url', url: NO_DATA_URL }, formFactor: 'PHONE', metrics: [INP_METRIC] }, apiKey);
    expect(result.kind).toBe('no-data');
    expect(result.kind === 'no-data' ? result.reason : '').toMatch(/not found/i);
  });
});

describe('field: CrUX History API (real network)', () => {
  const apiKey = readGoogleApiKey();

  it('origin PHONE: 25 periods, >=10 with INP p75, densities aligned and summing to ~1', async () => {
    const result = await queryCruxHistory({ target: { kind: 'origin', origin: ORIGIN }, formFactor: 'PHONE', metrics: [INP_METRIC] }, apiKey);
    if (result.kind !== 'data') throw new Error(`expected data, got ${result.reason}`);
    expect(result.collectionPeriods).toHaveLength(25);
    const series = result.metrics.interaction_to_next_paint;
    expect(series?.p75s).toHaveLength(25);
    expect(series?.densities).toHaveLength(25);
    const measured = (series?.p75s ?? []).filter((p): p is number => p !== null);
    expect(measured.length).toBeGreaterThanOrEqual(10);
    const sums = (series?.densities ?? []).filter((d) => d !== null).map((d) => d.good + d.needsImprovement + d.poor);
    expect(sums.length).toBe(measured.length);
    expect(sums.every((sum) => Math.abs(sum - 1) < 0.01)).toBe(true);
    console.log('[field] CrUX history origin PHONE INP p75s', measured.join(','));
  });

  it('a URL without history returns the typed no-data result', async () => {
    const result = await queryCruxHistory({ target: { kind: 'url', url: NO_DATA_URL }, formFactor: 'PHONE', metrics: [INP_METRIC], collectionPeriodCount: 5 }, apiKey);
    expect(result.kind).toBe('no-data');
  });

  it('rejects an out-of-range collectionPeriodCount before calling the API', async () => {
    await expect(queryCruxHistory({ target: { kind: 'origin', origin: ORIGIN }, formFactor: 'PHONE', metrics: [INP_METRIC], collectionPeriodCount: 41 }, apiKey)).rejects.toThrow(/1\.\.40/);
  });
});

describe('field: PSI parity + FieldSummary (real network)', () => {
  const apiKey = readGoogleApiKey();

  it('parity: CrUX API PHONE p75 + densities equal PSI mobile loadingExperience (url) and originLoadingExperience (origin)', { timeout: PSI_TIMEOUT_MS }, async () => {
    const [psi, url, origin] = await Promise.all([
      runPsiField(`${ORIGIN}/`, 'mobile', apiKey),
      queryCruxRecord({ target: { kind: 'url', url: `${ORIGIN}/` }, formFactor: 'PHONE', metrics: [INP_METRIC] }, apiKey),
      queryCruxRecord({ target: { kind: 'origin', origin: ORIGIN }, formFactor: 'PHONE', metrics: [INP_METRIC] }, apiKey),
    ]);
    const pairs = [[url, psi.page], [origin, psi.origin]] as const;
    for (const [crux, page] of pairs) {
      if (crux.kind !== 'data' || page.kind !== 'data') throw new Error('parity needs CrUX and PSI data at both levels');
      const inp = crux.metrics.interaction_to_next_paint;
      const d = inp?.densities;
      console.log(`[field] parity ${crux.target.kind}: CrUX PHONE p75 ${inp?.p75} ${d?.good}/${d?.needsImprovement}/${d?.poor} | PSI mobile ${page.inp.percentile} ${page.inp.distributions.map((x) => x.proportion).join('/')}`);
      expect(page.originFallback).toBe(false);
      expect(page.inp.percentile).toBe(inp?.p75);
      expect(page.inp.distributions.map((x) => x.proportion)).toEqual([d?.good, d?.needsImprovement, d?.poor]);
      expect(['FAST', 'AVERAGE', 'SLOW']).toContain(page.inp.category);
    }
    expect(psi.origin.kind === 'data' ? psi.origin.inp.percentile : 0).toBeGreaterThan(0);
  });

  it('buildFieldSummary combines CrUX, history and PSI for phone and desktop with collection period + notes', { timeout: PSI_TIMEOUT_MS }, async () => {
    const summary = await buildFieldSummary(`${ORIGIN}/`, apiKey);
    expect(summary.origin).toBe(ORIGIN);
    for (const device of [summary.phone, summary.desktop]) {
      if (device.origin.kind !== 'data') throw new Error(`expected origin data, got ${device.origin.reason}`);
      expectInpSummary(device.origin.metrics.interaction_to_next_paint);
    }
    for (const device of [summary.phone, summary.desktop]) {
      expect(device.inp).toMatchObject({ kind: 'data', level: 'url' });
      expect(device.inp.kind === 'data' ? device.inp.collectionPeriod.lastDate : '').toMatch(ISO_DATE);
      expect(device.psiParity.page).toMatchObject({ kind: 'equal', level: 'url' });
      expect(device.psiParity.origin).toMatchObject({ kind: 'equal', level: 'origin' });
    }
    expect(summary.history.phone.origin.kind).toBe('data');
    expect(summary.collectionPeriods.length).toBeGreaterThanOrEqual(1);
    expect(summary.sourceNotes.join('\n')).toContain('https://developer.chrome.com/docs/crux/api');
    console.log('[field] summary notes\n' + summary.sourceNotes.join('\n'));
  });
});
