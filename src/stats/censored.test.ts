import { describe, expect, it } from 'vitest';
import { CENSORED_SENTINEL, censoredAsLowestTies, isCensoredPlaceholder } from './censored.js';
import { mannWhitney } from './mann-whitney.js';
import { medianCi } from './order-ci.js';

// Reference: rank statistics depend only on the ordering, so ANY value below all measured values gives the
// same result. scipy 1.17.1: mannwhitneyu([0,0,24,32,40], [24,48,56,64,72], method='asymptotic').pvalue
// = 0.04586616156942451 and the same call with [8,8,24,32,40] -> 0.04586616156942451.
describe('censoredAsLowestTies', () => {
  const C = CENSORED_SENTINEL;

  it('maps censored runs to threshold/2, tied at the lowest rank, never dropped', () => {
    const sample = censoredAsLowestTies({ values: [C, C, 24, 32, 40], thresholdMs: 16 });
    expect(sample).toEqual({ values: [8, 8, 24, 32, 40], censoredCount: 2, placeholderMs: 8 });
  });

  it('Mann-Whitney p equals scipy with censored values as lowest ties', () => {
    const sample = censoredAsLowestTies({ values: [C, C, 24, 32, 40], thresholdMs: 16 });
    expect(mannWhitney(sample.values, [24, 48, 56, 64, 72]).p).toBeCloseTo(0.045_866_161_569_424_51, 10);
  });

  it('CI bounds on the placeholder are flagged as "< threshold"', () => {
    const sample = censoredAsLowestTies({ values: [C, C, C, 24, 32, 40, 48, 56, 64, 72], thresholdMs: 16 });
    const ci = medianCi(sample.values);
    expect(isCensoredPlaceholder(ci.low, sample)).toBe(true);
    expect(isCensoredPlaceholder(ci.high, sample)).toBe(false);
  });

  it('fails loud on contradictory or empty input', () => {
    expect(() => censoredAsLowestTies({ values: [C, 4], thresholdMs: 16 })).toThrow(/index 1/);
    expect(() => censoredAsLowestTies({ values: [], thresholdMs: 16 })).toThrow(/empty/);
    expect(() => censoredAsLowestTies({ values: [24], thresholdMs: 0 })).toThrow(/thresholdMs/);
    expect(() => censoredAsLowestTies({ values: [Number.NaN], thresholdMs: 16 })).toThrow(/index 0/);
  });
});
