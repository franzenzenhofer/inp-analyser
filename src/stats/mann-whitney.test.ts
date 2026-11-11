import { describe, expect, it } from 'vitest';
import { mannWhitney } from './mann-whitney.js';

// Reference: scipy 1.17.1, scipy.stats.mannwhitneyu (two-sided; U = U1 of the first sample).
// 1. R documentation example of wilcox.test (?wilcox.test, "Mann-Whitney U test" example), no ties:
//    x = c(0.80, 0.83, 1.89, 1.04, 1.45, 1.38, 1.91, 1.64, 0.73, 1.46); y = c(1.15, 0.88, 0.90, 0.74, 1.21)
//    R reports W = 35. mannwhitneyu(x, y, method='exact') -> statistic 35.0, pvalue 0.2544122544122544
// 2. INP-like 8 ms grid with ties, a (12) vs b (13):
//    mannwhitneyu(a, b, method='asymptotic', use_continuity=True) -> 31.0, 0.011240765213034914
// 3. small with ties a2 (5) vs b2 (6): asymptotic, use_continuity=True -> 4.5, 0.06476896969888761
// 4. all values tied: mannwhitneyu([8,8,8],[8,8], method='asymptotic') -> 3.0, 1.0
const X = [0.8, 0.83, 1.89, 1.04, 1.45, 1.38, 1.91, 1.64, 0.73, 1.46];
const Y = [1.15, 0.88, 0.9, 0.74, 1.21];
const A = [96, 104, 104, 112, 120, 120, 128, 136, 144, 152, 160, 168];
const B = [112, 128, 136, 136, 144, 152, 160, 168, 176, 184, 192, 200, 208];

describe('mannWhitney', () => {
  it('exact p for the R doc example (no ties, n <= 10)', () => {
    const result = mannWhitney(X, Y);
    expect(result.u).toBe(35);
    expect(result.method).toBe('exact');
    expect(result.p).toBeCloseTo(0.254_412_254_412_254_4, 12);
  });

  it('tie- and continuity-corrected normal approximation on 8 ms data', () => {
    const result = mannWhitney(A, B);
    expect(result.u).toBe(31);
    expect(result.method).toBe('normal');
    expect(result.p).toBeCloseTo(0.011_240_765_213_034_914, 10);
    expect(result.z).toBeLessThan(0);
  });

  it('small samples with ties use the normal approximation', () => {
    const result = mannWhitney([16, 24, 24, 32, 40], [24, 32, 48, 56, 64, 72]);
    expect(result.u).toBe(4.5);
    expect(result.method).toBe('normal');
    expect(result.p).toBeCloseTo(0.064_768_969_698_887_61, 10);
  });

  it('all tied: p = 1 exactly, like scipy', () => {
    expect(mannWhitney([8, 8, 8], [8, 8])).toEqual({ u: 3, z: 0, p: 1, method: 'all-tied' });
  });

  it('fails loud on empty or NaN input', () => {
    expect(() => mannWhitney([], [1])).toThrow(/sample a: sample is empty/);
    expect(() => mannWhitney([1], [Number.NaN])).toThrow(/sample b/);
  });
});
