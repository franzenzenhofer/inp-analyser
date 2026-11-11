import { describe, expect, it } from 'vitest';
import { iqr, iqrOverMedian, max, median, min, p95, quantile } from './descriptive.js';

// Reference: numpy 2.3.5, np.quantile(v, p, method='linear') (= Hyndman & Fan type 7 = R default):
//   v = [232,96,120,144,112,160,104,128,200,136,176]
//   p=0.25 -> 116.0, p=0.5 -> 136.0, p=0.75 -> 168.0, p=0.9 -> 200.0
//   w = list(range(8, 168, 8)) (20 values) -> np.quantile(w, 0.95) = 152.4
const V = [232, 96, 120, 144, 112, 160, 104, 128, 200, 136, 176];
const W = Array.from({ length: 20 }, (_, index) => 8 * (index + 1));

describe('type-7 quantiles', () => {
  it.each([
    [0.25, 116],
    [0.5, 136],
    [0.75, 168],
    [0.9, 200],
  ])('quantile(V, %d) = numpy linear', (p, expected) => {
    expect(quantile(V, p)).toBeCloseTo(expected, 10);
  });

  it('median of an even sample averages the middle pair (Hyndman & Fan type 7)', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('quantile(0) and quantile(1) are min and max', () => {
    expect(quantile(V, 0)).toBe(96);
    expect(quantile(V, 1)).toBe(232);
    expect(min(V)).toBe(96);
    expect(max(V)).toBe(232);
  });

  it('IQR and IQR/median from the numpy quartiles: (168 - 116) / 136', () => {
    expect(iqr(V)).toBeCloseTo(52, 10);
    expect(iqrOverMedian(V)).toBeCloseTo(52 / 136, 12);
  });
});

describe('p95 gate (ticket: p95 only if n >= 20)', () => {
  it('equals numpy for n = 20', () => {
    expect(p95(W)).toBeCloseTo(152.4, 10);
  });

  it('throws for n = 19', () => {
    expect(() => p95(W.slice(1))).toThrow(/at least 20/);
  });
});

describe('invalid input fails loud', () => {
  it('rejects empty, NaN, Infinity and p outside [0,1]', () => {
    expect(() => median([])).toThrow(/empty/);
    expect(() => median([1, Number.NaN])).toThrow(/index 1/);
    expect(() => max([1, Number.POSITIVE_INFINITY])).toThrow(/finite/);
    expect(() => quantile([1, 2], 1.5)).toThrow(/\[0, 1\]/);
    expect(() => iqrOverMedian([0, 0, 0])).toThrow(/median is 0/);
  });
});
