import { describe, expect, it } from 'vitest';
import { precisionReached } from './stopping.js';

// Reference: the n = 10 median CI is (X_(2), X_(9)) (Conover 1999; scipy quantile_test, see order-ci.test.ts),
// so for the samples below the half-width is (X_(9) - X_(2)) / 2, worked by hand:
//   tight: sorted 200,208,208,216,216,224,224,232,232,280 -> (232 - 208)/2 = 12 <= max(16, 0.1*220 = 22) -> stop
//   wide:  sorted 120,150,180,200,220,240,260,300,340,400 -> (340 - 150)/2 = 95 > max(16, 0.1*230 = 23) -> go on
describe('precisionReached', () => {
  it('stops when the median CI half-width is within max(16 ms, 10 %)', () => {
    const decision = precisionReached({ values: [216, 200, 232, 208, 224, 216, 280, 208, 224, 232] });
    expect(decision).toMatchObject({ stop: true, n: 10, halfWidthMs: 12, targetHalfWidthMs: 22 });
    expect([decision.median.low, decision.median.high]).toEqual([208, 232]);
  });

  it('continues when the CI is wide', () => {
    const decision = precisionReached({ values: [120, 150, 180, 200, 220, 240, 260, 300, 340, 400] });
    expect(decision).toMatchObject({ stop: false, halfWidthMs: 95, targetHalfWidthMs: 23 });
  });

  it('absolute floor wins for fast interactions; thresholds are parameters', () => {
    const values = [40, 48, 48, 56, 56, 56, 64, 64, 72, 72];
    expect(precisionReached({ values }).targetHalfWidthMs).toBe(16);
    expect(precisionReached({ values, absoluteMs: 4, relative: 0 }).stop).toBe(false);
  });

  it('throws while n is too small for a 95 % median CI (n = 5)', () => {
    expect(() => precisionReached({ values: [1, 2, 3, 4, 5] })).toThrow(/n=5 is too small/);
  });
});
