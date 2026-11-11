import { describe, expect, it } from 'vitest';
import { cdfAt, criticalLowerRank, mannWhitneyDistribution, sfAt, signedRankDistribution } from './exact-distributions.js';

// References:
// - Mann-Whitney critical-value table (two-sided alpha = 0.05; e.g. Siegel & Castellan 1988 Table J,
//   Zar 2010 Table B.11): m = n = 10 -> U_crit = 23, m = n = 5 -> U_crit = 2 (reject if U <= U_crit).
// - Brute-force enumeration in Python of all C(m+n, m) rank subsets (scratch script, itertools.combinations):
//   m=n=10: P(U <= 23) = 0.02162852627248912, P(U <= 24) = 0.026212951135551756
//   m=n=5:  P(U <= 2) = 0.015873015873015872, P(U <= 3) = 0.027777777777777776
// - Wilcoxon signed-rank table (two-sided 0.05, e.g. Zar 2010 Table B.12): n = 10 -> T_crit = 8,
//   n = 9 -> T_crit = 5; brute force over 2^9 sign vectors: P(T <= 5) = 10/512 = 0.01953125.
// - Python DP (Mann & Whitney 1947 recurrence f(m,n,u) = f(m-1,n,u-n) + f(m,n-1,u)): smallest q with
//   P(U <= q) > 0.025 is 42 for (12, 13), 164 for (20, 25), 318 for (30, 30).

describe('mannWhitneyDistribution', () => {
  it('total is C(m+n, m) and the distribution is symmetric', () => {
    const d = mannWhitneyDistribution(10, 10);
    expect(d.total).toBe(184_756);
    expect(d.counts[0]).toBe(1);
    expect(d.counts[100]).toBe(1);
    expect(d.counts[37]).toBe(d.counts[63]);
  });

  it('m = n = 10 matches brute force and the critical-value table (23)', () => {
    const d = mannWhitneyDistribution(10, 10);
    expect(cdfAt(d, 23)).toBeCloseTo(0.021_628_526_272_489_12, 14);
    expect(cdfAt(d, 24)).toBeCloseTo(0.026_212_951_135_551_756, 14);
    expect(criticalLowerRank(d, 0.025)).toBe(24);
  });

  it('m = n = 5 matches brute force and the table (2)', () => {
    const d = mannWhitneyDistribution(5, 5);
    expect(cdfAt(d, 2)).toBeCloseTo(0.015_873_015_873_015_872, 14);
    expect(criticalLowerRank(d, 0.025)).toBe(3);
  });

  it.each([[12, 13, 42], [20, 25, 164]])('(%d, %d) critical rank at alpha/2 = 0.025 is %d (Python recurrence)', (m, n, q) => {
    expect(criticalLowerRank(mannWhitneyDistribution(m, n), 0.025)).toBe(q);
  });

  it('refuses sizes whose counts exceed 2^53 (C(60, 30) ~ 1.18e17) instead of losing precision', () => {
    expect(() => mannWhitneyDistribution(30, 30)).toThrow(/too large/);
  });

  it('sfAt is the upper tail', () => {
    const d = mannWhitneyDistribution(5, 5);
    expect(sfAt(d, 23)).toBeCloseTo(cdfAt(d, 2), 15);
  });

  it('rejects invalid sizes', () => {
    expect(() => mannWhitneyDistribution(0, 3)).toThrow(/invalid sizes/);
  });
});

describe('signedRankDistribution', () => {
  it('n = 9: P(T <= 5) = 10/512, table critical value 5', () => {
    const d = signedRankDistribution(9);
    expect(d.total).toBe(512);
    expect(cdfAt(d, 5)).toBe(10 / 512);
    expect(criticalLowerRank(d, 0.025)).toBe(6);
  });

  it('n = 10: table critical value 8 -> P(T <= 8) = 25/1024 < 0.025 < P(T <= 9) = 33/1024', () => {
    const d = signedRankDistribution(10);
    expect(cdfAt(d, 8)).toBe(25 / 1024);
    expect(cdfAt(d, 9)).toBe(33 / 1024);
  });

  it('rejects invalid size', () => {
    expect(() => signedRankDistribution(0)).toThrow(/invalid size/);
  });
});
