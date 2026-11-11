import { cdfAt, mannWhitneyDistribution, sfAt } from './exact-distributions.js';
import { continuityCorrectedZ, twoSidedP } from './normal.js';
import { midranks, sum, tieTerm } from './ranks.js';
import { assertSample } from './validate.js';

/**
 * Two-sided Mann-Whitney U test (Wilcoxon rank-sum), Mann & Whitney 1947, https://doi.org/10.1214/aoms/1177730491
 * U = R_a - n_a(n_a + 1)/2 with midranks R_a of sample a (scipy `mannwhitneyu` U1 / R `wilcox.test` W).
 * Exact p (enumerated null distribution) when both n <= 10 and there are no ties; otherwise normal
 * approximation with tie-corrected variance n_a n_b / 12 * ((N + 1) - sum(t^3 - t) / (N (N - 1)))
 * and continuity correction 0.5, identical to scipy.stats.mannwhitneyu(method="asymptotic", use_continuity=True),
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html (R wilcox.test with
 * exact = FALSE, correct = TRUE computes the same z; with ties and n < 50 current R uses a conditional exact
 * test instead: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/wilcox.test.html).
 * If every value is tied the null distribution is a point mass at its mean: p = 1 exactly.
 */

export const MANN_WHITNEY_EXACT_MAX_N = 10;

export type RankTestMethod = 'exact' | 'normal' | 'all-tied';

export interface MannWhitneyResult {
  /** U of sample a: number of pairs with a > b, ties counted 1/2. */
  readonly u: number;
  /** Normal-approximation z (tie- and continuity-corrected); positive when a tends to be larger. 0 if all tied. */
  readonly z: number;
  readonly p: number;
  readonly method: RankTestMethod;
}

/** Tie-corrected standard deviation of U under H0. */
export function mannWhitneySigma(n1: number, n2: number, tieSizes: readonly number[]): number {
  const total = n1 + n2;
  return Math.sqrt(((n1 * n2) / 12) * (total + 1 - tieTerm(tieSizes) / (total * (total - 1))));
}

function exactP(u: number, n1: number, n2: number): number {
  const distribution = mannWhitneyDistribution(n1, n2);
  return Math.min(1, 2 * Math.min(cdfAt(distribution, u), sfAt(distribution, u)));
}

export function mannWhitney(a: readonly number[], b: readonly number[]): MannWhitneyResult {
  assertSample(a, 'mannWhitney sample a');
  assertSample(b, 'mannWhitney sample b');
  const { ranks, tieSizes } = midranks([...a, ...b]);
  const u = sum(ranks.slice(0, a.length)) - (a.length * (a.length + 1)) / 2;
  const sigma = mannWhitneySigma(a.length, b.length, tieSizes);
  if (sigma === 0) return { u, z: 0, p: 1, method: 'all-tied' };
  const z = continuityCorrectedZ(u - (a.length * b.length) / 2, sigma);
  const small = a.length <= MANN_WHITNEY_EXACT_MAX_N && b.length <= MANN_WHITNEY_EXACT_MAX_N;
  if (small && tieSizes.length === 0) return { u, z, p: exactP(u, a.length, b.length), method: 'exact' };
  return { u, z, p: twoSidedP(z), method: 'normal' };
}
