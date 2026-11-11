import { describe, expect, it } from 'vitest';
import { pairedDifferences, wilcoxonSignedRank } from './wilcoxon.js';

// References:
// 1. R documentation example of wilcox.test (Hollander & Wolfe 1973, p. 29f: Hamilton depression scale,
//    first visit x vs second visit y, n = 9). R: wilcox.test(x, y, paired = TRUE, alternative = "greater")
//    -> V = 40, p-value = 0.01953; two-sided exact p = 2 * 10/512 = 0.0390625.
//    scipy 1.17.1: wilcoxon(x, y, method='exact') -> statistic 5.0 (= min(V+, V-)), pvalue 0.0390625
// 2. Paired 8 ms data with ties and two zero differences (d = b - a = [8,24,0,16,24,8,32,0,24,16,16,8]):
//    scipy wilcoxon(d, zero_method='wilcox', correction=True, method='approx')
//    -> pvalue 0.005540680462065569, zstatistic -2.7737936834625763 (scipy signs z by min(V+,V-));
//    V+ = sum(rankdata(|d[d!=0]|)[d[d!=0] > 0]) = 55.0
const X = [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3];
const Y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29];
const PA = [200, 208, 216, 184, 192, 240, 256, 232, 200, 224, 216, 208];
const PB = [208, 232, 216, 200, 216, 248, 288, 232, 224, 240, 232, 216];

describe('wilcoxonSignedRank', () => {
  it('R doc depression example: V = 40, exact two-sided p = 0.0390625', () => {
    const result = wilcoxonSignedRank(Y, X);
    expect(result.v).toBe(40);
    expect(result.method).toBe('exact');
    expect(result.p).toBeCloseTo(0.039_062_5, 14);
  });

  it('ties + zeros: zeros dropped, tie-corrected normal approximation equals scipy', () => {
    const result = wilcoxonSignedRank(PA, PB);
    expect(result.zerosDropped).toBe(2);
    expect(result.n).toBe(10);
    expect(result.v).toBe(55);
    expect(result.method).toBe('normal');
    expect(result.p).toBeCloseTo(0.005_540_680_462_065_569, 10);
    expect(result.z).toBeCloseTo(2.773_793_683_462_576_3, 10);
  });

  it('identical pairs: no information, p = 1', () => {
    expect(wilcoxonSignedRank([8, 16], [8, 16])).toMatchObject({ n: 0, zerosDropped: 2, p: 1, method: 'all-tied' });
  });

  it('rejects unequal lengths', () => {
    expect(() => pairedDifferences([1, 2], [1])).toThrow(/differ in length/);
  });
});
