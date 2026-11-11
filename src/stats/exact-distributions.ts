/**
 * Exact null distributions of the rank statistics without ties, as counts (frequencies).
 * Mann-Whitney U: coefficients of the Gaussian binomial [m+n choose m]_q (Mann & Whitney 1947,
 * https://doi.org/10.1214/aoms/1177730491). Wilcoxon signed rank T+: coefficients of prod_{i=1..n}(1 + q^i)
 * (Wilcoxon 1945, https://doi.org/10.2307/3001968). Counts stay exact integers below 2^53 for the sizes used here.
 */

export interface CountDistribution {
  /** counts[s] = number of equally likely arrangements with statistic value s. */
  readonly counts: readonly number[];
  readonly total: number;
}

const MAX_SAFE_TOTAL = Number.MAX_SAFE_INTEGER;

function finish(counts: number[]): CountDistribution {
  const total = counts.reduce((acc, c) => acc + c, 0);
  if (total > MAX_SAFE_TOTAL) throw new Error('exact distribution too large for exact integer counts');
  return { counts, total };
}

/** Coefficients of the constant polynomial 1, padded to the given degree. */
function unitPolynomial(degree: number): number[] {
  const counts = Array.from({ length: degree + 1 }, (): number => 0);
  counts[0] = 1;
  return counts;
}

/** Distribution of U for sample sizes m and n (no ties). */
export function mannWhitneyDistribution(m: number, n: number): CountDistribution {
  if (!Number.isInteger(m) || !Number.isInteger(n) || m < 1 || n < 1) throw new Error(`mannWhitneyDistribution: invalid sizes ${m}, ${n}`);
  const counts = unitPolynomial(m * n);
  for (let i = 1; i <= m; i += 1) {
    for (let s = m * n; s >= n + i; s -= 1) counts[s] = (counts[s] ?? 0) - (counts[s - n - i] ?? 0);
    for (let s = i; s <= m * n; s += 1) counts[s] = (counts[s] ?? 0) + (counts[s - i] ?? 0);
  }
  return finish(counts);
}

/** Distribution of the signed-rank sum T+ for n non-zero, untied differences. */
export function signedRankDistribution(n: number): CountDistribution {
  if (!Number.isInteger(n) || n < 1) throw new Error(`signedRankDistribution: invalid size ${n}`);
  const max = (n * (n + 1)) / 2;
  const counts = unitPolynomial(max);
  for (let i = 1; i <= n; i += 1) {
    for (let s = max; s >= i; s -= 1) counts[s] = (counts[s] ?? 0) + (counts[s - i] ?? 0);
  }
  return finish(counts);
}

/** P(S <= s). */
export function cdfAt(distribution: CountDistribution, s: number): number {
  const upper = Math.min(Math.floor(s), distribution.counts.length - 1);
  let acc = 0;
  for (let index = 0; index <= upper; index += 1) acc += distribution.counts[index] ?? 0;
  return acc / distribution.total;
}

/** P(S >= s). */
export function sfAt(distribution: CountDistribution, s: number): number {
  return 1 - cdfAt(distribution, Math.ceil(s) - 1);
}

/** Tolerance R uses when comparing exact CDF values with alpha / 2 (10 * .Machine$double.eps). */
const R_TOLERANCE = 10 * Number.EPSILON;

/**
 * Critical rank of the exact CI: smallest q with P(S <= q) > alphaHalf, so P(S <= q - 1) <= alphaHalf.
 * Identical to R's two-sided exact CI: qu <- qwilcox(alpha/2, ...); if (pwilcox(qu, ...) <= alpha/2 + toler)
 * qu <- qu + 1 (and qsignrank/psignrank for the paired case), https://github.com/wch/r-source/blob/trunk/src/library/stats/R/wilcox.test.R
 * Returns 0 when even q = 0 qualifies, i.e. no finite interval reaches the confidence.
 */
export function criticalLowerRank(distribution: CountDistribution, alphaHalf: number): number {
  let acc = 0;
  for (let index = 0; index < distribution.counts.length; index += 1) {
    acc += distribution.counts[index] ?? 0;
    if (acc / distribution.total > alphaHalf + R_TOLERANCE) return index;
  }
  return distribution.counts.length - 1;
}
