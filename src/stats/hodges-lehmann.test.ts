import { describe, expect, it } from 'vitest';
import { hodgesLehmannPaired, hodgesLehmannShift, walshAverages } from './hodges-lehmann.js';

// References (no R on this machine; scipy has no Hodges-Lehmann CI, so the reference values come from the
// published critical-value tables plus brute-force enumeration in Python 3.14 / numpy 2.3.5):
// 1. Two-sample exact, m = n = 5: brute force over all C(10, 5) rank subsets gives P(U <= 2) = 0.015873,
//    P(U <= 3) = 0.027778 -> k = 3 (table: U_crit(5, 5; 0.05 two-sided) = 2). For ha/hb below:
//    D = sorted(bj - ai), np.median(D) = 31.0, D[k-1] = -2, D[N-k] = 66, coverage 1 - 2 * 0.015873 = 0.968254
// 2. Two-sample, 12 x 13, no ties -> normal path. Exact critical rank from the Mann-Whitney recurrence = 42
//    (see exact-distributions.test.ts); numpy: median(D) = 29.0, D[41] = 14, D[156-42] = 44.
// 3. Paired exact, R doc depression data (Hollander & Wolfe 1973 p. 29f), n = 9: brute force over 2^9 sign
//    vectors -> k = 6 (P(T <= 5) = 0.01953125, table T_crit = 5). numpy over the 45 Walsh averages of
//    d = x - y: median 0.46, W[5] = 0.01, W[39] = 0.786, coverage 1 - 2 * 0.01953125 = 0.9609375
// 4. Paired normal path (ties and zeros), d = [8,24,0,16,24,8,32,0,24,16,16,8]: tie term over |d| groups
//    (0:2, 8:3, 16:3, 24:3) = 78, sigma^2 = 12*13*25/24 - 78/48 = 160.875, k = floor(39 - 1.959964 * 12.6837 + 0.5) = 14;
//    numpy: median of the 78 Walsh averages = 16.0, W[13] = 8.0, W[78-14] = 20.0
// 5. Exact vs normal critical ranks (Python DP vs floor(mu - z sigma + 0.5)): (12,13) 42 vs 42,
//    (20,25) 164 vs 164, (30,30) 318 vs 317 -> normal is equal or one rank more conservative.

describe('hodgesLehmannShift', () => {
  it('exact Moses CI, m = n = 5', () => {
    const result = hodgesLehmannShift([112, 96, 140, 121, 105], [150, 133, 171, 162, 119]);
    expect(result).toMatchObject({ estimate: 31, low: -2, high: 66, k: 3, method: 'exact' });
    expect(result.achievedConfidence).toBeCloseTo(0.968_253_968_253_968_3, 12);
  });

  it('normal path (n > 10) lands on the exact critical rank 42 for 12 x 13', () => {
    const a = [101, 95, 118, 130, 87, 142, 110, 99, 125, 133, 92, 106];
    const b = [131, 120, 149, 158, 117, 166, 139, 128, 154, 162, 121, 135, 144];
    expect(hodgesLehmannShift(a, b)).toMatchObject({ estimate: 29, low: 14, high: 44, k: 42, method: 'normal' });
  });

  it('normal path for 30 x 30 is at most one rank below the exact 318', () => {
    const a = Array.from({ length: 30 }, (_, index) => index * 2);
    const b = Array.from({ length: 30 }, (_, index) => index * 2 + 1);
    const { k } = hodgesLehmannShift(a, b);
    expect([317, 318]).toContain(k);
  });

  it('throws when the samples cannot reach the confidence', () => {
    expect(() => hodgesLehmannShift([1, 2], [3, 4])).toThrow(/too small.*needs more runs/);
  });
});

describe('hodgesLehmannPaired', () => {
  const X = [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3];
  const Y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29];

  it('exact Tukey CI on the depression data (d = x - y)', () => {
    const result = hodgesLehmannPaired(Y, X);
    expect(result.k).toBe(6);
    expect(result.method).toBe('exact');
    expect(result.estimate).toBeCloseTo(0.46, 12);
    expect(result.low).toBeCloseTo(0.01, 12);
    expect(result.high).toBeCloseTo(0.786, 12);
    expect(result.achievedConfidence).toBeCloseTo(0.960_937_5, 12);
  });

  it('tie-corrected normal path on 8 ms paired data', () => {
    const pa = [200, 208, 216, 184, 192, 240, 256, 232, 200, 224, 216, 208];
    const pb = [208, 232, 216, 200, 216, 248, 288, 232, 224, 240, 232, 216];
    expect(hodgesLehmannPaired(pa, pb)).toMatchObject({ estimate: 16, low: 8, high: 20, k: 14, method: 'normal' });
  });

  it('Walsh averages count n(n+1)/2', () => {
    expect(walshAverages([1, 2, 3])).toEqual([1, 1.5, 2, 2, 2.5, 3]);
  });
});
