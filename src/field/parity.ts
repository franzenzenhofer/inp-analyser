import type { CruxRecordResult } from './crux.js';
import type { CollectionPeriod, FormFactor, RatingDensities } from './crux-schema.js';
import type { PsiExperience, PsiField } from './psi.js';

/**
 * The INP number the tool shows, and proof that it equals PageSpeed Insights.
 *
 * Rule verified 2026-10-09 against the live APIs (a large public origin, url + origin): PSI strategy=mobile
 * equals CrUX API formFactor PHONE and strategy=desktop equals DESKTOP, to the last reported digit (p75 and all
 * three densities); TABLET and the all-form-factor record differ. PSI uses page-level data and falls back to the
 * origin when the page has too little data (https://developers.google.com/speed/docs/insights/v5/about), flagged
 * as origin_fallback (https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed).
 */
export type FieldLevel = 'url' | 'origin';

export const PSI_STRATEGY_FORM_FACTOR = { mobile: 'PHONE', desktop: 'DESKTOP' } as const satisfies Record<PsiField['strategy'], FormFactor>;

export type FieldInp =
  | {
      readonly kind: 'data';
      /** url = page-level CrUX record, origin = the page had no INP data so the origin record is shown. */
      readonly level: FieldLevel;
      readonly formFactor: FormFactor;
      readonly p75: number;
      readonly densities: RatingDensities;
      readonly collectionPeriod: CollectionPeriod;
    }
  | { readonly kind: 'no-data'; readonly formFactor: FormFactor; readonly reason: string };

export type ParityResult =
  | { readonly kind: 'equal'; readonly level: FieldLevel; readonly p75: number }
  | { readonly kind: 'differs'; readonly level: FieldLevel; readonly crux: FieldInp; readonly psi: PsiExperience; readonly detail: string }
  | { readonly kind: 'not-comparable'; readonly level: FieldLevel; readonly reason: string };

function inpAt(record: CruxRecordResult, level: FieldLevel): FieldInp {
  if (record.kind === 'no-data') return { kind: 'no-data', formFactor: record.formFactor, reason: `${level}: ${record.reason}` };
  const inp = record.metrics.interaction_to_next_paint;
  if (inp === undefined) return { kind: 'no-data', formFactor: record.formFactor, reason: `${level}: record has no INP` };
  return { kind: 'data', level, formFactor: record.formFactor, p75: inp.p75, densities: inp.densities, collectionPeriod: record.collectionPeriod };
}

/** Page-level INP when CrUX has it, otherwise origin-level - always labelled with its level, as PSI does. */
export function selectFieldInp(url: CruxRecordResult, origin: CruxRecordResult): FieldInp {
  const page = inpAt(url, 'url');
  if (page.kind === 'data') return page;
  const site = inpAt(origin, 'origin');
  return site.kind === 'data' ? site : { kind: 'no-data', formFactor: url.formFactor, reason: `${page.reason}; ${site.reason}` };
}

function mismatch(crux: FieldInp & { kind: 'data' }, psi: PsiExperience & { kind: 'data' }): string | null {
  const [good, ni, poor] = psi.inp.distributions.map((d) => d.proportion);
  const d = crux.densities;
  if (crux.p75 !== psi.inp.percentile) return `p75 CrUX ${crux.p75} vs PSI ${psi.inp.percentile}`;
  if (good !== d.good || ni !== d.needsImprovement || poor !== d.poor) {
    return `densities CrUX ${d.good}/${d.needsImprovement}/${d.poor} vs PSI ${good}/${ni}/${poor}`;
  }
  return null;
}

/** Compares one CrUX level with the matching PSI block; any difference is reported, never averaged away. */
export function compareWithPsi(crux: FieldInp, psi: PsiExperience, level: FieldLevel): ParityResult {
  if (crux.kind === 'no-data' || psi.kind === 'no-data') {
    const reasons = [crux, psi].filter((x) => x.kind === 'no-data').map((x) => x.reason);
    return { kind: 'not-comparable', level, reason: reasons.join('; ') };
  }
  const detail = mismatch(crux, psi);
  if (detail === null) return { kind: 'equal', level, p75: crux.p75 };
  return { kind: 'differs', level, crux, psi, detail: `${detail} (CrUX period ${crux.collectionPeriod.lastDate}, PSI analysed ${psi.id})` };
}

export interface DeviceParity {
  readonly page: ParityResult;
  readonly origin: ParityResult;
}

/** PSI page block vs CrUX url record (or vs the origin record when PSI set origin_fallback), PSI origin vs CrUX origin. */
export function devicePsiParity(url: CruxRecordResult, origin: CruxRecordResult, psi: PsiField): DeviceParity {
  const originInp = inpAt(origin, 'origin');
  const pageFallsBack = psi.page.kind === 'data' && psi.page.originFallback;
  return {
    page: pageFallsBack ? compareWithPsi(originInp, psi.page, 'origin') : compareWithPsi(inpAt(url, 'url'), psi.page, 'url'),
    origin: compareWithPsi(originInp, psi.origin, 'origin'),
  };
}
