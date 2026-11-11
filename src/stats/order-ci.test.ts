import { describe, expect, it } from 'vitest';
import { binomialPmf, medianCi, orderStatisticRanks, p75Ci, quantileCi } from './order-ci.js';

// References:
// 1. Classic table (Conover 1999, Table A3 use; Hollander & Wolfe 2014 sec. 3.6): for n = 10 the 95%
//    distribution-free median CI is (X_(2), X_(9)) with coverage 1 - 2 * 11/1024 = 0.978515625.
//    scipy 1.17.1: 1 - 2*binom.cdf(1, 10, 0.5) = 0.978515625
// 2. scipy 1.17.1 quantile_test(np.arange(1, n+1), q=n/2, p=p).confidence_interval(0.95) gives the ranks
//    (values = ranks for 1..n):
//    n=6 p=.5 -> (1, 6); n=8 -> (1, 8); n=10 -> (2, 9); n=12 -> (3, 10); n=20 -> (6, 15); n=30 -> (10, 21);
//    n=50 -> (18, 33); n=100 -> (40, 61); p=.75: n=20 -> (11, 19); n=30 -> (18, 28); n=50 -> (31, 44);
//    n=100 -> (66, 84); n=10 p=.75 -> high = nan (unreachable).
// 3. scipy: binom.cdf(18, 20, 0.75) - binom.cdf(10, 20, 0.75) = 0.9618229581910782
// 4. v20 below: quantile_test(v20, q=150, p=0.75).confidence_interval(0.95) = (144, 240),
//    p=0.5 -> (112, 176)

describe('orderStatisticRanks', () => {
  it('n = 10 median: ranks 2..9, coverage 0.978515625', () => {
    const ranks = orderStatisticRanks(10, { p: 0.5 });
    expect(ranks.lowRank).toBe(2);
    expect(ranks.highRank).toBe(9);
    expect(ranks.achievedConfidence).toBeCloseTo(0.978_515_625, 12);
  });

  it.each([
    [6, 0.5, 1, 6], [8, 0.5, 1, 8], [12, 0.5, 3, 10], [20, 0.5, 6, 15], [30, 0.5, 10, 21],
    [50, 0.5, 18, 33], [100, 0.5, 40, 61], [20, 0.75, 11, 19], [30, 0.75, 18, 28],
    [50, 0.75, 31, 44], [100, 0.75, 66, 84],
  ])('n=%d p=%d matches scipy quantile_test: (%d, %d)', (n, p, low, high) => {
    const ranks = orderStatisticRanks(n, { p });
    expect([ranks.lowRank, ranks.highRank]).toEqual([low, high]);
  });

  it('n = 20 p75 coverage equals the scipy binomial sum', () => {
    expect(orderStatisticRanks(20, { p: 0.75 }).achievedConfidence).toBeCloseTo(0.961_822_958_191_078_2, 12);
  });

  it('throws and says so when n cannot reach the confidence (scipy returns nan there)', () => {
    expect(() => orderStatisticRanks(5, { p: 0.5 })).toThrow(/n=5 is too small for a 95% order-statistic CI of the p50/);
    expect(() => orderStatisticRanks(10, { p: 0.75 })).toThrow(/n=10 is too small.*p75/);
  });
});

describe('quantileCi on data', () => {
  const v20 = [176, 88, 96, 120, 96, 280, 104, 112, 112, 240, 128, 128, 136, 144, 152, 216, 160, 168, 184, 200];

  it('p75 and median CI of v20 equal scipy quantile_test', () => {
    const p75 = p75Ci(v20);
    expect([p75.low, p75.high]).toEqual([144, 240]);
    const middle = medianCi(v20);
    expect([middle.low, middle.high]).toEqual([112, 176]);
    expect(middle.estimate).toBe(140);
  });

  it('n = 10 median CI is the 2nd and 9th order statistics', () => {
    const ci = medianCi([50, 10, 90, 30, 70, 20, 100, 40, 80, 60]);
    expect(ci).toEqual({ estimate: 55, low: 20, high: 90, lowRank: 2, highRank: 9, achievedConfidence: ci.achievedConfidence });
  });

  it('rejects bad confidence and empty input', () => {
    expect(() => quantileCi([1, 2, 3], { p: 0.5, confidence: 1 })).toThrow(/confidence/);
    expect(() => medianCi([])).toThrow(/empty/);
  });
});

describe('binomialPmf', () => {
  it('Binomial(10, 0.5) pmf(1) = 10/1024 and sums to 1, also for n = 5000 (log space)', () => {
    expect(binomialPmf(10, 0.5)[1]).toBeCloseTo(10 / 1024, 15);
    expect(binomialPmf(5000, 0.5).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});
