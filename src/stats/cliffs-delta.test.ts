import { describe, expect, it } from 'vitest';
import { cliffMagnitude, cliffsDelta } from './cliffs-delta.js';

// Reference: Cliff's delta equals 2U/(n_a n_b) - 1 with U = Mann-Whitney U of b over a (ties counted 1/2),
// Cliff 1993 eq. relation to the Mann-Whitney statistic. scipy 1.17.1:
//   mannwhitneyu([2,3,4], [1,2,3]).statistic = 7.0 -> 2*7/9 - 1 = 0.5555555555555556
//   mannwhitneyu(b, a).statistic = 125.0 for the 8 ms samples below -> 2*125/156 - 1 = 0.6025641025641026
// Thresholds: Romano et al. 2006 as in R effsize::cliff.delta, https://softeng.polito.it/software/effsize/cliff.delta.html

describe('cliffsDelta', () => {
  it('small example equals 2U/(mn) - 1 from scipy', () => {
    expect(cliffsDelta([1, 2, 3], [2, 3, 4]).delta).toBeCloseTo(0.555_555_555_555_555_6, 14);
  });

  it('tied 8 ms data equals scipy-derived value and is "large"', () => {
    const a = [96, 104, 104, 112, 120, 120, 128, 136, 144, 152, 160, 168];
    const b = [112, 128, 136, 136, 144, 152, 160, 168, 176, 184, 192, 200, 208];
    const result = cliffsDelta(a, b);
    expect(result.delta).toBeCloseTo(0.602_564_102_564_102_6, 14);
    expect(result.magnitude).toBe('large');
  });

  it('orientation: b slower than a gives positive delta, reversed gives negative', () => {
    expect(cliffsDelta([1], [2]).delta).toBe(1);
    expect(cliffsDelta([2], [1]).delta).toBe(-1);
  });
});

describe('cliffMagnitude (Romano et al. 2006)', () => {
  it.each([
    [0, 'negligible'], [0.146, 'negligible'], [-0.147, 'small'], [0.329, 'small'],
    [0.33, 'medium'], [-0.473, 'medium'], [0.474, 'large'], [-1, 'large'],
  ])('|%d| -> %s', (delta, label) => {
    expect(cliffMagnitude(delta)).toBe(label);
  });

  it('rejects values outside [-1, 1]', () => {
    expect(() => cliffMagnitude(1.5)).toThrow(/\[-1, 1\]/);
  });
});
