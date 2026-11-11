import { sortedQuantile } from './descriptive.js';
import { assertConfidence, assertProbability, assertSample, sortedAscending, valueAt } from './validate.js';

/**
 * Exact distribution-free confidence interval for a population quantile from order statistics.
 * With B ~ Binomial(n, p) the number of observations below the p-quantile,
 * P(X_(l) <= xi_p <= X_(u)) >= P(l <= B <= u - 1) (equality for continuous data, conservative with ties,
 * which suits the 8 ms INP grid). Equal-tailed choice: l is the largest rank with P(B <= l - 1) <= alpha/2,
 * u the smallest rank with P(B >= u) <= alpha/2. Reference: Conover, Practical Nonparametric Statistics,
 * 3rd ed. 1999, sec. 3.2; Hahn & Meeker, Statistical Intervals 1991, sec. 5.2;
 * same rule as scipy.stats.quantile_test(...).confidence_interval,
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.quantile_test.html
 */

export interface OrderStatisticCi {
  /** Type-7 sample quantile. */
  readonly estimate: number;
  readonly low: number;
  readonly high: number;
  /** 1-based ranks of the order statistics used as bounds. */
  readonly lowRank: number;
  readonly highRank: number;
  /** Exact binomial coverage 1 - P(B <= l-1) - P(B >= u) (continuous case). */
  readonly achievedConfidence: number;
}

export interface QuantileCiOptions {
  readonly p: number;
  readonly confidence?: number;
}

/** Binomial(n, p) probability mass function, computed in log space so large n does not underflow. */
export function binomialPmf(n: number, p: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`binomialPmf: n must be a positive integer, got ${n}`);
  if (!(p > 0 && p < 1)) throw new Error(`binomialPmf: p must be in (0, 1), got ${p}`);
  const logs = [n * Math.log1p(-p)];
  const logOdds = Math.log(p) - Math.log1p(-p);
  for (let k = 0; k < n; k += 1) logs.push((logs[k] ?? 0) + Math.log((n - k) / (k + 1)) + logOdds);
  return logs.map((value) => Math.exp(value));
}

function cumulative(pmf: readonly number[]): number[] {
  let acc = 0;
  return pmf.map((value) => (acc += value));
}

/** Ranks (l, u) and coverage; throws when n cannot reach the requested confidence. */
export function orderStatisticRanks(n: number, options: QuantileCiOptions): { lowRank: number; highRank: number; achievedConfidence: number } {
  const confidence = options.confidence ?? 0.95;
  assertConfidence(confidence, 'orderStatisticRanks');
  assertProbability(options.p, 'orderStatisticRanks');
  const alphaHalf = (1 - confidence) / 2;
  const cdf = cumulative(binomialPmf(n, options.p));
  const below = (k: number): number => (k < 0 ? 0 : valueAt(cdf, Math.min(k, n)));
  let lowRank = 0;
  while (lowRank + 1 <= n && below(lowRank) <= alphaHalf) lowRank += 1;
  let highRank = n + 1;
  while (highRank - 1 >= 1 && 1 - below(highRank - 2) <= alphaHalf) highRank -= 1;
  if (lowRank < 1 || highRank > n) {
    throw new Error(`n=${n} is too small for a ${confidence * 100}% order-statistic CI of the p${options.p * 100} quantile: needs more runs`);
  }
  return { lowRank, highRank, achievedConfidence: 1 - below(lowRank - 1) - (1 - below(highRank - 1)) };
}

/** Quantile estimate with its exact order-statistic CI. */
export function quantileCi(values: readonly number[], options: QuantileCiOptions): OrderStatisticCi {
  assertSample(values, 'quantileCi');
  const sorted = sortedAscending(values);
  const ranks = orderStatisticRanks(sorted.length, options);
  return {
    estimate: sortedQuantile(sorted, options.p),
    low: valueAt(sorted, ranks.lowRank - 1),
    high: valueAt(sorted, ranks.highRank - 1),
    ...ranks,
  };
}

export function medianCi(values: readonly number[], confidence = 0.95): OrderStatisticCi {
  return quantileCi(values, { p: 0.5, confidence });
}

export function p75Ci(values: readonly number[], confidence = 0.95): OrderStatisticCi {
  return quantileCi(values, { p: 0.75, confidence });
}
