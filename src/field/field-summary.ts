import { queryCruxRecord, type CruxRecordResult } from './crux.js';
import { queryCruxHistory, DEFAULT_PERIOD_COUNT, type CruxHistoryResult } from './crux-history.js';
import { CONTEXT_METRICS, INP_METRIC, describeTarget, type CollectionPeriod, type CruxTarget, type FormFactor } from './crux-schema.js';
import { PSI_STRATEGY_FORM_FACTOR, devicePsiParity, selectFieldInp, type DeviceParity, type FieldInp, type ParityResult } from './parity.js';
import { runPsiField, type PsiExperience, type PsiField, type PsiStrategy } from './psi.js';

/** Field data for `inp field <url>` and the report: CrUX (url + origin), CrUX history, PSI, per device. */
export interface DeviceField {
  /** The INP number to show: CrUX API p75 with its level (url or origin), form factor and collection period. */
  readonly inp: FieldInp;
  /** CrUX API vs PSI for the same day: page and origin level must be equal; differences are kept and reported. */
  readonly psiParity: DeviceParity;
  readonly url: CruxRecordResult;
  readonly origin: CruxRecordResult;
  readonly psi: PsiField;
}

export interface DeviceHistory {
  readonly url: CruxHistoryResult;
  readonly origin: CruxHistoryResult;
}

export interface FieldSummary {
  readonly url: string;
  readonly origin: string;
  readonly fetchedAt: string;
  readonly phone: DeviceField;
  readonly desktop: DeviceField;
  readonly history: { readonly phone: DeviceHistory; readonly desktop: DeviceHistory };
  /** Distinct latest 28-day CrUX collection periods across all CrUX API records (normally exactly one). */
  readonly collectionPeriods: readonly CollectionPeriod[];
  /** Where every number comes from, with the documentation URL, plus every no-data / fallback case. */
  readonly sourceNotes: readonly string[];
}

const CRUX_DOC = 'https://developer.chrome.com/docs/crux/api';
const HISTORY_DOC = 'https://developer.chrome.com/docs/crux/history-api';
const PSI_DOC = 'https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed';

function originOf(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(`field data needs an http(s) URL, got ${url}`);
  return parsed.origin;
}

interface SiteTargets {
  readonly url: string;
  readonly origin: string;
}

function cruxTargets(site: SiteTargets): readonly [CruxTarget, CruxTarget] {
  return [{ kind: 'url', url: site.url }, { kind: 'origin', origin: site.origin }];
}

async function deviceField(site: SiteTargets, strategy: PsiStrategy, apiKey: string): Promise<DeviceField> {
  const formFactor = PSI_STRATEGY_FORM_FACTOR[strategy];
  const [urlTarget, originTarget] = cruxTargets(site);
  const [url, origin, psi] = await Promise.all([
    queryCruxRecord({ target: urlTarget, formFactor, metrics: CONTEXT_METRICS }, apiKey),
    queryCruxRecord({ target: originTarget, formFactor, metrics: CONTEXT_METRICS }, apiKey),
    runPsiField(site.url, strategy, apiKey),
  ]);
  return { inp: selectFieldInp(url, origin), psiParity: devicePsiParity(url, origin, psi), url, origin, psi };
}

async function deviceHistory(site: SiteTargets, formFactor: FormFactor, apiKey: string): Promise<DeviceHistory> {
  const [urlTarget, originTarget] = cruxTargets(site);
  const query = { formFactor, metrics: [INP_METRIC], collectionPeriodCount: DEFAULT_PERIOD_COUNT };
  const [url, origin] = await Promise.all([
    queryCruxHistory({ ...query, target: urlTarget }, apiKey),
    queryCruxHistory({ ...query, target: originTarget }, apiKey),
  ]);
  return { url, origin };
}

function distinctPeriods(records: readonly CruxRecordResult[]): readonly CollectionPeriod[] {
  const byKey = new Map<string, CollectionPeriod>();
  for (const record of records) {
    if (record.kind === 'data') byKey.set(`${record.collectionPeriod.firstDate}/${record.collectionPeriod.lastDate}`, record.collectionPeriod);
  }
  return [...byKey.values()];
}

function recordNote(record: CruxRecordResult): string | null {
  const where = `CrUX ${record.formFactor} ${describeTarget(record.target)}`;
  if (record.kind === 'no-data') return `${where}: no data (${record.reason}).`;
  if (record.metrics.interaction_to_next_paint === undefined) return `${where}: record exists but has no INP data.`;
  if (record.normalizedUrl !== null) return `${where}: CrUX normalised the URL to ${record.normalizedUrl}.`;
  return null;
}

function historyNote(history: CruxHistoryResult): string | null {
  const where = `CrUX history ${history.formFactor} ${describeTarget(history.target)}`;
  if (history.kind === 'no-data') return `${where}: no data (${history.reason}).`;
  const series = history.metrics.interaction_to_next_paint;
  if (series === undefined) return `${where}: no INP series.`;
  const gaps = series.p75s.filter((p) => p === null).length;
  return gaps > 0 ? `${where}: ${gaps} of ${series.p75s.length} periods ineligible (kept as null).` : null;
}

function psiNote(psi: PsiField, block: 'page' | 'origin'): string | null {
  const experience: PsiExperience = psi[block];
  const where = `PSI ${psi.strategy} ${block} (${psi.requestedUrl})`;
  if (experience.kind === 'no-data') return `${where}: ${experience.reason}.`;
  return experience.originFallback ? `${where}: origin_fallback=true, PSI shows ORIGIN data in the page block.` : null;
}

function parityNote(parity: ParityResult, strategy: PsiStrategy): string {
  const where = `CrUX ${PSI_STRATEGY_FORM_FACTOR[strategy]} vs PSI ${strategy}, ${parity.level} level`;
  if (parity.kind === 'equal') return `${where}: identical (p75 ${parity.p75} ms, same good/NI/poor shares).`;
  if (parity.kind === 'differs') return `${where}: DIFFERENT - ${parity.detail}.`;
  return `${where}: not comparable - ${parity.reason}.`;
}

function sourceNotes(summary: Omit<FieldSummary, 'sourceNotes'>): readonly string[] {
  const periods = summary.collectionPeriods.map((p) => `${p.firstDate}..${p.lastDate}`).join(', ');
  const devices = [summary.phone, summary.desktop];
  const histories = [summary.history.phone, summary.history.desktop].flatMap((h) => [h.url, h.origin]);
  const specific = [
    ...devices.flatMap((d) => [recordNote(d.url), recordNote(d.origin), psiNote(d.psi, 'page'), psiNote(d.psi, 'origin')]),
    ...histories.map((h) => historyNote(h)),
    ...devices.flatMap((d) => [parityNote(d.psiParity.page, d.psi.strategy), parityNote(d.psiParity.origin, d.psi.strategy)]),
  ].filter((note): note is string => note !== null);
  return [
    `CrUX API: p75 and good/NI/poor shares of real Chrome users over the 28-day collection period ${periods === '' ? '(none, no data)' : periods}. ${CRUX_DOC}`,
    `CrUX History API: ${DEFAULT_PERIOD_COUNT} weekly 28-day periods, oldest first; ineligible periods are null. ${HISTORY_DOC}`,
    `PageSpeed Insights loadingExperience/originLoadingExperience (analysed ${summary.phone.psi.analysedAt} / ${summary.desktop.psi.analysedAt}): separate source next to CrUX, reports no collection period. ${PSI_DOC}`,
    ...specific,
  ];
}

/** Fetches every field source for a URL in parallel (12 API calls) and combines them. Any API error throws. */
export async function buildFieldSummary(url: string, apiKey: string): Promise<FieldSummary> {
  const origin = originOf(url);
  const site: SiteTargets = { url, origin };
  const [phone, desktop, phoneHistory, desktopHistory] = await Promise.all([
    deviceField(site, 'mobile', apiKey),
    deviceField(site, 'desktop', apiKey),
    deviceHistory(site, 'PHONE', apiKey),
    deviceHistory(site, 'DESKTOP', apiKey),
  ]);
  const collectionPeriods = distinctPeriods([phone.url, phone.origin, desktop.url, desktop.origin]);
  const partial = { url, origin, fetchedAt: new Date().toISOString(), phone, desktop, history: { phone: phoneHistory, desktop: desktopHistory }, collectionPeriods };
  return { ...partial, sourceNotes: sourceNotes(partial) };
}
