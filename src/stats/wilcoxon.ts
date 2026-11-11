import { cdfAt, sfAt, signedRankDistribution } from './exact-distributions.js';
import type { RankTestMethod } from './mann-whitney.js';
import { continuityCorrectedZ, twoSidedP } from './normal.js';
import { midranks, sum, tieTerm } from './ranks.js';
import { assertSample } from './validate.js';

/**
 * Two-sided Wilcoxon signed-rank test for paired samples, Wilcoxon 1945, https://doi.org/10.2307/3001968
 * Differences d = b - a. Zero differences are DROPPED before ranking (Wilcoxon's original method, scipy
 * `zero_method="wilcox"`), not kept as in Pratt (1959).
 * Statistic V = sum of midranks of |d| over positive d (R's V).
 * Exact p when n < 50 (R's default size limit), no ties among |d| and no zero was dropped; otherwise normal
 * approximation with variance n(n+1)(2n+1)/24 - sum(t^3 - t)/48 and continuity correction 0.5, identical to
 * scipy.stats.wilcoxon(zero_method="wilcox", correction=True, method="approx"),
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.wilcoxon.html
 * No non-zero difference at all: the paired samples are identical, p = 1 exactly.
 */

export const WILCOXON_EXACT_BELOW_N = 50;

export interface WilcoxonResult {
  /** Sum of ranks of the positive differences b - a. */
  readonly v: number;
  /** Number of non-zero differences used. */
  readonly n: number;
  readonly zerosDropped: number;
  readonly z: number;
  readonly p: number;
  readonly method: RankTestMethod;
}

/** Tie-corrected standard deviation of V under H0. */
export function signedRankSigma(n: number, tieSizes: readonly number[]): number {
  return Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieTerm(tieSizes) / 48);
}

export function pairedDifferences(a: readonly number[], b: readonly number[]): number[] {
  assertSample(a, 'paired sample a');
  assertSample(b, 'paired sample b');
  if (a.length !== b.length) throw new Error(`paired samples differ in length: ${a.length} vs ${b.length}`);
  return b.map((value, index) => value - (a[index] ?? Number.NaN));
}

function exactP(v: number, n: number): number {
  const distribution = signedRankDistribution(n);
  const mean = (n * (n + 1)) / 4;
  return Math.min(1, 2 * (v > mean ? sfAt(distribution, v) : cdfAt(distribution, v)));
}

export function wilcoxonSignedRank(a: readonly number[], b: readonly number[]): WilcoxonResult {
  const all = pairedDifferences(a, b);
  const nonZero = all.filter((d) => d !== 0);
  const zerosDropped = all.length - nonZero.length;
  const n = nonZero.length;
  if (n === 0) return { v: 0, n, zerosDropped, z: 0, p: 1, method: 'all-tied' };
  const { ranks, tieSizes } = midranks(nonZero.map((d) => Math.abs(d)));
  const v = sum(ranks.filter((_, index) => (nonZero[index] ?? 0) > 0));
  const sigma = signedRankSigma(n, tieSizes);
  const z = continuityCorrectedZ(v - (n * (n + 1)) / 4, sigma);
  if (n < WILCOXON_EXACT_BELOW_N && tieSizes.length === 0 && zerosDropped === 0) {
    return { v, n, zerosDropped, z, p: exactP(v, n), method: 'exact' };
  }
  return { v, n, zerosDropped, z, p: twoSidedP(z), method: 'normal' };
}
