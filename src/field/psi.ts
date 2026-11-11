import { z } from 'zod';
import { parseApi, requestJson } from './http.js';

/**
 * PageSpeed Insights v5 runPagespeed: the CrUX-derived loadingExperience (page) and originLoadingExperience
 * blocks, metric INTERACTION_TO_NEXT_PAINT. A separate source shown next to the CrUX API, never a substitute.
 * Spec: https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed
 * PSI does not report a collection period; its numbers can differ from the CrUX API for the same day.
 */
const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
/** PSI runs a full Lighthouse audit server-side before answering; 60-130 s measured on a large origin. */
const PSI_TIMEOUT_MS = 240_000;
export const PSI_INP_METRIC = 'INTERACTION_TO_NEXT_PAINT';

export type PsiStrategy = 'mobile' | 'desktop';
export type PsiCategory = 'FAST' | 'AVERAGE' | 'SLOW' | 'NONE';

export interface PsiDistribution {
  readonly min: number;
  /** Absent on the last (open-ended) bucket. */
  readonly max: number | null;
  readonly proportion: number;
}

export interface PsiInp {
  readonly percentile: number;
  readonly distributions: readonly PsiDistribution[];
  readonly category: PsiCategory;
}

export type PsiExperience =
  | {
      readonly kind: 'data';
      /** URL, pattern or origin the metrics belong to. */
      readonly id: string;
      readonly inp: PsiInp;
      readonly overallCategory: PsiCategory | null;
      /** True when PSI had no page-level data and reported origin data in the page block instead. */
      readonly originFallback: boolean;
    }
  | { readonly kind: 'no-data'; readonly reason: string };

export interface PsiField {
  readonly strategy: PsiStrategy;
  readonly requestedUrl: string;
  readonly analysedAt: string;
  readonly page: PsiExperience;
  readonly origin: PsiExperience;
}

const categorySchema = z.enum(['FAST', 'AVERAGE', 'SLOW', 'NONE']);
const inpSchema = z.object({
  percentile: z.number(),
  distributions: z.array(z.object({ min: z.number(), max: z.number().optional(), proportion: z.number().min(0).max(1) })),
  category: categorySchema,
});
const experienceSchema = z.object({
  id: z.string().optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  overall_category: categorySchema.optional(),
  origin_fallback: z.boolean().optional(),
});
const responseSchema = z.object({
  analysisUTCTimestamp: z.string(),
  loadingExperience: experienceSchema.optional(),
  originLoadingExperience: experienceSchema.optional(),
});

function toExperience(raw: z.output<typeof experienceSchema> | undefined, label: string): PsiExperience {
  if (raw === undefined) return { kind: 'no-data', reason: `${label}: block absent in PSI response` };
  const metric = raw.metrics?.[PSI_INP_METRIC];
  if (metric === undefined) return { kind: 'no-data', reason: `${label}: no ${PSI_INP_METRIC} metric` };
  if (raw.id === undefined) throw new Error(`${label}: metrics present but no id`);
  const inp = parseApi(inpSchema, metric, `${label} ${PSI_INP_METRIC}`);
  return {
    kind: 'data',
    id: raw.id,
    inp: { ...inp, distributions: inp.distributions.map((d) => ({ min: d.min, max: d.max ?? null, proportion: d.proportion })) },
    overallCategory: raw.overall_category ?? null,
    originFallback: raw.origin_fallback ?? false,
  };
}

function psiUrl(url: string, strategy: PsiStrategy, apiKey: string): URL {
  const endpoint = new URL(PSI_ENDPOINT);
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  endpoint.searchParams.set('category', 'performance');
  endpoint.searchParams.set('key', apiKey);
  return endpoint;
}

/** Runs PSI for a URL and returns its page and origin INP field data. HTTP errors throw. */
export async function runPsiField(url: string, strategy: PsiStrategy, apiKey: string): Promise<PsiField> {
  const label = `PSI runPagespeed ${strategy} ${url}`;
  const response = await requestJson({ label, url: psiUrl(url, strategy, apiKey), timeoutMs: PSI_TIMEOUT_MS });
  const parsed = parseApi(responseSchema, response.json, label);
  return {
    strategy,
    requestedUrl: url,
    analysedAt: parsed.analysisUTCTimestamp,
    page: toExperience(parsed.loadingExperience, `${label} loadingExperience`),
    origin: toExperience(parsed.originLoadingExperience, `${label} originLoadingExperience`),
  };
}
