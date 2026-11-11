import { assertMinSize, assertProbability, assertSample, sortedAscending, valueAt } from './validate.js';

/**
 * Sample quantile, Hyndman & Fan (1996) definition 7 (R `quantile(type = 7)` default, numpy "linear"):
 * h = (n - 1) * p, Q(p) = x[floor h] + (h - floor h) * (x[floor h + 1] - x[floor h]) on the sorted sample
 * (0-based). Hyndman & Fan, The American Statistician 50(4):361-365, https://doi.org/10.2307/2684934
 */
export function quantile(values: readonly number[], p: number): number {
  assertSample(values, 'quantile');
  assertProbability(p, 'quantile');
  return sortedQuantile(sortedAscending(values), p);
}

/** Type-7 quantile of an already sorted, validated sample. */
export function sortedQuantile(sorted: readonly number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const lower = Math.floor(h);
  const below = valueAt(sorted, lower);
  if (lower === sorted.length - 1) return below;
  return below + (h - lower) * (valueAt(sorted, lower + 1) - below);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function min(values: readonly number[]): number {
  assertSample(values, 'min');
  return Math.min(...values);
}

export function max(values: readonly number[]): number {
  assertSample(values, 'max');
  return Math.max(...values);
}

/** Interquartile range Q(0.75) - Q(0.25), both type 7. */
export function iqr(values: readonly number[]): number {
  return quantile(values, 0.75) - quantile(values, 0.25);
}

/** Relative dispersion IQR / median (ticket "dispersion IQR/median"). Throws if the median is 0. */
export function iqrOverMedian(values: readonly number[]): number {
  const middle = median(values);
  if (middle === 0) throw new Error('iqrOverMedian: median is 0, relative dispersion undefined');
  return iqr(values) / middle;
}

/** Minimum n for reporting p95 (ticket: "p95 only if n>=20"). */
export const P95_MIN_SAMPLES = 20;

/** 95th percentile (type 7); refuses samples below 20 values because the tail would be one or two runs. */
export function p95(values: readonly number[]): number {
  assertMinSize(values, P95_MIN_SAMPLES, 'p95');
  return quantile(values, 0.95);
}
