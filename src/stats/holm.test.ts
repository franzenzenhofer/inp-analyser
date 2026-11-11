import { describe, expect, it } from 'vitest';
import { holmAdjust } from './holm.js';

// Reference: R p.adjust(p, "holm") = pmin(1, cummax((n + 1 - i) * p[o]))[ro]
// (https://github.com/wch/r-source/blob/trunk/src/library/stats/R/p.adjust.R), worked by hand for the
// four-hypothesis example of https://en.wikipedia.org/wiki/Holm%E2%80%93Bonferroni_method (p = .01, .04, .03, .005):
//   sorted .005, .01, .03, .04 -> 4*.005 = .02, 3*.01 = .03, 2*.03 = .06, max(.06, 1*.04) = .06
//   back in input order -> .03, .06, .06, .02
describe('holmAdjust', () => {
  it('matches the hand-worked R p.adjust result, input order preserved', () => {
    const adjusted = holmAdjust([0.01, 0.04, 0.03, 0.005]);
    [0.03, 0.06, 0.06, 0.02].forEach((expected, index) => expect(adjusted[index]).toBeCloseTo(expected, 15));
  });

  it('caps at 1 and keeps monotonicity', () => {
    expect(holmAdjust([0.4, 0.6, 0.02])).toEqual([0.8, 0.8, 0.06]);
  });

  it('rejects empty and invalid p-values', () => {
    expect(() => holmAdjust([])).toThrow(/no p-values/);
    expect(() => holmAdjust([0.1, 1.2])).toThrow(/p\[1\]/);
  });
});
