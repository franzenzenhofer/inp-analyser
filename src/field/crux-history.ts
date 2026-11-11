import { z } from 'zod';
import { parseApi, requestJson } from './http.js';
import {
  CRUX_TIMEOUT_MS, cruxRequestBody, cruxUrl, describeTarget, keySchema, normalizationSchema, notFoundSchema, numberish,
  periodSchema, requireThreeBins,
  type CollectionPeriod, type CruxMetricName, type CruxTarget, type FormFactor, type RatingDensities,
} from './crux-schema.js';

/**
 * CrUX History API records:queryHistoryRecord - weekly 28-day collection periods (default 25, max 40).
 * Ineligible periods come back as p75 null and density "NaN"; both are kept as null, never dropped or filled.
 * Spec: https://developer.chrome.com/docs/crux/history-api
 */
export const DEFAULT_PERIOD_COUNT = 25;
const MAX_PERIOD_COUNT = 40;

export interface CruxHistoryQuery {
  readonly target: CruxTarget;
  readonly formFactor: FormFactor;
  readonly metrics: readonly CruxMetricName[];
  readonly collectionPeriodCount?: number;
}

/** One entry per collection period, aligned with `collectionPeriods` (oldest first). */
export interface CruxHistorySeries {
  readonly p75s: readonly (number | null)[];
  readonly densities: readonly (RatingDensities | null)[];
}

export type CruxHistoryResult =
  | {
      readonly kind: 'data';
      readonly target: CruxTarget;
      readonly formFactor: FormFactor;
      readonly collectionPeriods: readonly CollectionPeriod[];
      readonly metrics: Partial<Record<CruxMetricName, CruxHistorySeries>>;
      readonly normalizedUrl: string | null;
    }
  | { readonly kind: 'no-data'; readonly target: CruxTarget; readonly formFactor: FormFactor; readonly reason: string };

const densitySchema = z.union([z.number().min(0).max(1), z.literal('NaN').transform(() => null)]);
const seriesSchema = z.object({
  histogramTimeseries: z.array(z.object({ start: numberish, end: numberish.optional(), densities: z.array(densitySchema) })),
  percentilesTimeseries: z.object({ p75s: z.array(z.union([numberish, z.null()])) }),
});
const historySchema = z.object({
  record: z.object({ key: keySchema, metrics: z.record(z.string(), z.unknown()), collectionPeriods: z.array(periodSchema) }),
  urlNormalizationDetails: normalizationSchema,
});

function requireLength(values: readonly unknown[], expected: number, label: string): void {
  if (values.length !== expected) throw new Error(`${label}: ${values.length} values for ${expected} collection periods`);
}

function densitiesAt(bins: readonly [readonly (number | null)[], readonly (number | null)[], readonly (number | null)[]], i: number): RatingDensities | null {
  const good = bins[0][i] ?? null;
  const needsImprovement = bins[1][i] ?? null;
  const poor = bins[2][i] ?? null;
  if (good === null || needsImprovement === null || poor === null) return null;
  return { good, needsImprovement, poor };
}

function summariseSeries(raw: unknown, periodCount: number, label: string): CruxHistorySeries {
  const series = parseApi(seriesSchema, raw, label);
  const [good, ni, poor] = requireThreeBins(series.histogramTimeseries, label);
  const bins = [good.densities, ni.densities, poor.densities] as const;
  for (const bin of bins) requireLength(bin, periodCount, label);
  requireLength(series.percentilesTimeseries.p75s, periodCount, label);
  const densities = Array.from({ length: periodCount }, (_, i) => densitiesAt(bins, i));
  return { p75s: series.percentilesTimeseries.p75s, densities };
}

function periodCountOf(query: CruxHistoryQuery): number {
  const count = query.collectionPeriodCount ?? DEFAULT_PERIOD_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > MAX_PERIOD_COUNT) {
    throw new Error(`collectionPeriodCount must be an integer 1..${MAX_PERIOD_COUNT}, got ${count}`);
  }
  return count;
}

function summariseMetrics(raw: Record<string, unknown>, query: CruxHistoryQuery, periodCount: number): Partial<Record<CruxMetricName, CruxHistorySeries>> {
  const metrics: Partial<Record<CruxMetricName, CruxHistorySeries>> = {};
  for (const name of query.metrics) {
    const value = raw[name];
    if (value !== undefined) metrics[name] = summariseSeries(value, periodCount, `CrUX history ${name} for ${describeTarget(query.target)}`);
  }
  return metrics;
}

/** Queries the CrUX History API. HTTP 404 NOT_FOUND is a typed "no-data" result; other errors throw. */
export async function queryCruxHistory(query: CruxHistoryQuery, apiKey: string): Promise<CruxHistoryResult> {
  const count = periodCountOf(query);
  const label = `CrUX queryHistoryRecord ${describeTarget(query.target)} ${query.formFactor}`;
  const body = { ...cruxRequestBody(query.target, query.formFactor, query.metrics), collectionPeriodCount: count };
  const response = await requestJson({ label, url: cruxUrl('queryHistoryRecord', apiKey), body, timeoutMs: CRUX_TIMEOUT_MS }, [404]);
  const base = { target: query.target, formFactor: query.formFactor };
  if (response.status === 404) {
    return { ...base, kind: 'no-data', reason: parseApi(notFoundSchema, response.json, label).error.message };
  }
  const parsed = parseApi(historySchema, response.json, label);
  const periods = parsed.record.collectionPeriods;
  requireLength(periods, count, label);
  return {
    ...base,
    kind: 'data',
    collectionPeriods: periods,
    metrics: summariseMetrics(parsed.record.metrics, query, count),
    normalizedUrl: parsed.urlNormalizationDetails?.normalizedUrl ?? null,
  };
}
