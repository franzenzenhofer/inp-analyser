import { z } from 'zod';
import { parseApi, requestJson } from './http.js';
import {
  CRUX_TIMEOUT_MS, cruxRequestBody, cruxUrl, describeTarget, keySchema, normalizationSchema, notFoundSchema, numberish,
  periodSchema, requireThreeBins,
  type CollectionPeriod, type CruxMetricName, type CruxTarget, type FormFactor, type RatingBounds, type RatingDensities,
} from './crux-schema.js';

/**
 * CrUX API records:queryRecord - p75 + good/NI/poor histogram over the latest 28-day collection period.
 * Spec: https://developer.chrome.com/docs/crux/api
 */
export interface CruxQuery {
  readonly target: CruxTarget;
  readonly formFactor: FormFactor;
  readonly metrics: readonly CruxMetricName[];
}

export interface CruxMetricSummary {
  /** 75th percentile (ms for INP/LCP, unitless for CLS). */
  readonly p75: number;
  readonly densities: RatingDensities;
  readonly bounds: RatingBounds;
}

export type CruxRecordResult =
  | {
      readonly kind: 'data';
      readonly target: CruxTarget;
      readonly formFactor: FormFactor;
      readonly collectionPeriod: CollectionPeriod;
      /** Only metrics CrUX has data for; a requested metric can be absent (e.g. INP below eligibility). */
      readonly metrics: Partial<Record<CruxMetricName, CruxMetricSummary>>;
      /** Set when CrUX normalised the requested URL (https://developer.chrome.com/docs/crux/api#url-normalization). */
      readonly normalizedUrl: string | null;
    }
  | { readonly kind: 'no-data'; readonly target: CruxTarget; readonly formFactor: FormFactor; readonly reason: string };

const binSchema = z.object({ start: numberish, end: numberish.optional(), density: z.number().min(0).max(1) });
const metricSchema = z.object({ histogram: z.array(binSchema), percentiles: z.object({ p75: numberish }) });
const recordSchema = z.object({
  record: z.object({ key: keySchema, metrics: z.record(z.string(), z.unknown()), collectionPeriod: periodSchema }),
  urlNormalizationDetails: normalizationSchema,
});

function summariseMetric(raw: unknown, label: string): CruxMetricSummary {
  const metric = parseApi(metricSchema, raw, label);
  const [good, ni, poor] = requireThreeBins(metric.histogram, label);
  if (good.end === undefined) throw new Error(`${label}: first histogram bin has no end`);
  return {
    p75: metric.percentiles.p75,
    densities: { good: good.density, needsImprovement: ni.density, poor: poor.density },
    bounds: { goodMax: good.end, poorMin: poor.start },
  };
}

function summariseMetrics(raw: Record<string, unknown>, query: CruxQuery): Partial<Record<CruxMetricName, CruxMetricSummary>> {
  const metrics: Partial<Record<CruxMetricName, CruxMetricSummary>> = {};
  for (const name of query.metrics) {
    const value = raw[name];
    if (value !== undefined) metrics[name] = summariseMetric(value, `CrUX ${name} for ${describeTarget(query.target)}`);
  }
  return metrics;
}

/** Queries one CrUX record. HTTP 404 NOT_FOUND is returned as a typed "no-data" result; other errors throw. */
export async function queryCruxRecord(query: CruxQuery, apiKey: string): Promise<CruxRecordResult> {
  const label = `CrUX queryRecord ${describeTarget(query.target)} ${query.formFactor}`;
  const body = cruxRequestBody(query.target, query.formFactor, query.metrics);
  const response = await requestJson({ label, url: cruxUrl('queryRecord', apiKey), body, timeoutMs: CRUX_TIMEOUT_MS }, [404]);
  const base = { target: query.target, formFactor: query.formFactor };
  if (response.status === 404) {
    return { ...base, kind: 'no-data', reason: parseApi(notFoundSchema, response.json, label).error.message };
  }
  const parsed = parseApi(recordSchema, response.json, label);
  return {
    ...base,
    kind: 'data',
    collectionPeriod: parsed.record.collectionPeriod,
    metrics: summariseMetrics(parsed.record.metrics, query),
    normalizedUrl: parsed.urlNormalizationDetails?.normalizedUrl ?? null,
  };
}
