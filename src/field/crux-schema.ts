import { z } from 'zod';

/**
 * Shared CrUX API / CrUX History API vocabulary and zod schemas.
 * Specs: https://developer.chrome.com/docs/crux/api and https://developer.chrome.com/docs/crux/history-api
 */
export const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records';
export const CRUX_TIMEOUT_MS = 30_000;

/** "ALL" = no formFactor in the request, i.e. all form factors aggregated. */
export type FormFactor = 'PHONE' | 'DESKTOP' | 'TABLET' | 'ALL';
export type CruxMetricName = 'interaction_to_next_paint' | 'largest_contentful_paint' | 'cumulative_layout_shift';
export type CruxTarget = { readonly kind: 'url'; readonly url: string } | { readonly kind: 'origin'; readonly origin: string };

export const INP_METRIC: CruxMetricName = 'interaction_to_next_paint';
export const CONTEXT_METRICS: readonly CruxMetricName[] = ['interaction_to_next_paint', 'largest_contentful_paint', 'cumulative_layout_shift'];

/** Inclusive calendar dates (YYYY-MM-DD) of the 28-day collection window. */
export interface CollectionPeriod {
  readonly firstDate: string;
  readonly lastDate: string;
}

/** Share of page loads per CrUX bin; bins are good / needs improvement / poor in this order. */
export interface RatingDensities {
  readonly good: number;
  readonly needsImprovement: number;
  readonly poor: number;
}

/**
 * Bin edges exactly as CrUX reports them (first bin end, last bin start). PSI documents the INP buckets as
 * good [0, 200ms], NI (200ms, 500ms], poor over 500ms (https://developers.google.com/speed/docs/insights/v5/about),
 * so a p75 of exactly 200 is good.
 */
export interface RatingBounds {
  readonly goodMax: number;
  readonly poorMin: number;
}

/** CLS values are doubles encoded as strings (https://developer.chrome.com/docs/crux/api#metric). */
export const numberish = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) ctx.addIssue({ code: 'custom', message: `not a finite number: ${String(value)}` });
  return parsed;
});

const dateSchema = z.object({ year: z.number().int(), month: z.number().int(), day: z.number().int() });

function isoDate(date: z.output<typeof dateSchema>): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export const periodSchema = z
  .object({ firstDate: dateSchema, lastDate: dateSchema })
  .transform((p): CollectionPeriod => ({ firstDate: isoDate(p.firstDate), lastDate: isoDate(p.lastDate) }));

export const keySchema = z.object({
  formFactor: z.enum(['PHONE', 'DESKTOP', 'TABLET']).optional(),
  url: z.string().optional(),
  origin: z.string().optional(),
});

export const normalizationSchema = z.object({ originalUrl: z.string(), normalizedUrl: z.string() }).optional();

/** CrUX answers "chrome ux report data not found" with HTTP 404 status NOT_FOUND. */
export const notFoundSchema = z.object({ error: z.object({ code: z.literal(404), status: z.literal('NOT_FOUND'), message: z.string() }) });

/** Request body shared by queryRecord and queryHistoryRecord; formFactor "ALL" is omitted. */
export function cruxRequestBody(target: CruxTarget, formFactor: FormFactor, metrics: readonly CruxMetricName[]): Record<string, unknown> {
  const body: Record<string, unknown> = target.kind === 'url' ? { url: target.url } : { origin: target.origin };
  if (formFactor !== 'ALL') body['formFactor'] = formFactor;
  body['metrics'] = metrics;
  return body;
}

export function cruxUrl(method: 'queryRecord' | 'queryHistoryRecord', apiKey: string): URL {
  const url = new URL(`${CRUX_ENDPOINT}:${method}`);
  url.searchParams.set('key', apiKey);
  return url;
}

export function describeTarget(target: CruxTarget): string {
  return target.kind === 'url' ? `url ${target.url}` : `origin ${target.origin}`;
}

/** Three-bin CrUX histograms map to good / NI / poor; any other bin count is a contract change and fails. */
export function requireThreeBins<T>(bins: readonly T[], label: string): readonly [T, T, T] {
  const [good, ni, poor] = bins;
  if (bins.length !== 3 || good === undefined || ni === undefined || poor === undefined) {
    throw new Error(`${label}: expected 3 histogram bins (good/NI/poor), got ${bins.length}`);
  }
  return [good, ni, poor];
}
