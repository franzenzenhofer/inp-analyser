import { describe, expect, it } from 'vitest';
import { midranks, sortedMedian, tieTerm } from './ranks.js';

// Reference: scipy 1.17.1 scipy.stats.rankdata([40, 10, 20, 20, 30, 20], method='average')
//   -> [6. 1. 3. 3. 5. 3.]  (tie group of size 3 at positions 2..4)
describe('midranks', () => {
  it('matches scipy rankdata(method="average")', () => {
    const { ranks, tieSizes } = midranks([40, 10, 20, 20, 30, 20]);
    expect(ranks).toEqual([6, 1, 3, 3, 5, 3]);
    expect(tieSizes).toEqual([3]);
    expect(tieTerm(tieSizes)).toBe(24);
  });

  it('sortedMedian handles odd and even n and rejects empty input', () => {
    expect(sortedMedian([1, 2, 3])).toBe(2);
    expect(sortedMedian([1, 2, 3, 10])).toBe(2.5);
    expect(() => sortedMedian([])).toThrow(/empty/);
  });
});
