import { describe, expect, it } from 'vitest';
import { wilsonInterval } from './wilson.js';

// References:
// - Newcombe 1998 (Stat Med 17:857-872), Table I, method 3 (score interval without continuity correction):
//   81/263 -> 0.2553-0.3662, 15/148 -> 0.0624-0.1605, 0/20 -> 0.0000-0.1611, 1/29 -> 0.0061-0.1718
// - scipy 1.17.1 binomtest(k, n).proportion_ci(confidence_level=0.95, method='wilson'):
//   81/263 -> (0.2552885198782742, 0.36620957698280004); 15/148 -> (0.06238639953073629, 0.16048724172330803)
//   0/20 -> (0.0, 0.16112515805281935); 1/29 -> (0.006113214292762667, 0.17175521879320282)
//   29/29 -> (0.8830302015002592, 1.0)
describe('wilsonInterval', () => {
  it.each([
    [81, 263, 0.255_288_519_878_274_2, 0.366_209_576_982_800_04],
    [15, 148, 0.062_386_399_530_736_29, 0.160_487_241_723_308_03],
    [0, 20, 0, 0.161_125_158_052_819_35],
    [1, 29, 0.006_113_214_292_762_667, 0.171_755_218_793_202_82],
    [29, 29, 0.883_030_201_500_259_2, 1],
  ])('%d/%d matches scipy (and Newcombe 1998 to 4 dp)', (k, n, low, high) => {
    const ci = wilsonInterval({ successes: k, trials: n });
    expect(ci.low).toBeCloseTo(low, 12);
    expect(ci.high).toBeCloseTo(high, 12);
  });

  it('Newcombe 1998 rounded values', () => {
    const ci = wilsonInterval({ successes: 81, trials: 263 });
    expect([Number(ci.low.toFixed(4)), Number(ci.high.toFixed(4))]).toEqual([0.2553, 0.3662]);
  });

  it('rejects impossible counts', () => {
    expect(() => wilsonInterval({ successes: 3, trials: 2 })).toThrow(/successes/);
    expect(() => wilsonInterval({ successes: 0, trials: 0 })).toThrow(/trials/);
    expect(() => wilsonInterval({ successes: 1, trials: 2, confidence: 0 })).toThrow(/confidence/);
  });
});
