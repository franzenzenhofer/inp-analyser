import { describe, expect, it } from 'vitest';
import { continuityCorrectedZ, criticalZ, normalCdf, normalQuantile, twoSidedP } from './normal.js';

// Reference: scipy 1.17.1 (python3 -c "from scipy.stats import norm; print(repr(norm.cdf(x)), repr(norm.ppf(p)))").
// Outputs pasted verbatim:
//   norm.cdf(-10)  = 7.619853024160474e-24     norm.cdf(-5) = 2.8665157187919344e-07
//   norm.cdf(-3)   = 0.001349898031630093      norm.cdf(-1) = 0.15865525393145707
//   norm.cdf(0.3)  = 0.6179114221889526        norm.cdf(2)  = 0.9772498680518208
//   norm.ppf(1e-300) = -37.0470962993612       norm.ppf(1e-10) = -6.361340902404056
//   norm.ppf(0.001)  = -3.090232306167813      norm.ppf(0.07)  = -1.4757910281791704
//   norm.ppf(0.6)    = 0.2533471031357997      norm.ppf(0.975) = 1.959963984540054
//   norm.ppf(1 - 1e-12) = 7.0344869100478356

describe('normalCdf (Hart 1968 / West 2005)', () => {
  it.each([
    [-10, 7.619853024160474e-24],
    [-5, 2.8665157187919344e-7],
    [-3, 0.001349898031630093],
    [-1, 0.15865525393145707],
    [0, 0.5],
    [0.3, 0.6179114221889526],
    [2, 0.9772498680518208],
  ])('Phi(%d) matches scipy to 1e-8 relative', (x, expected) => {
    expect(Math.abs(normalCdf(x) - expected) / expected).toBeLessThan(1e-8);
  });

  it('is accurate to 1e-14 absolute in the body', () => {
    expect(Math.abs(normalCdf(-1) - 0.15865525393145707)).toBeLessThan(1e-14);
    expect(Math.abs(normalCdf(-3) - 0.001349898031630093)).toBeLessThan(1e-14);
  });

  it('throws on NaN', () => {
    expect(() => normalCdf(Number.NaN)).toThrow(/NaN/);
  });
});

describe('normalQuantile (Wichura AS 241)', () => {
  it.each([
    [1e-300, -37.0470962993612],
    [1e-10, -6.361340902404056],
    [0.001, -3.090232306167813],
    [0.07, -1.4757910281791704],
    [0.6, 0.2533471031357997],
    [0.975, 1.959963984540054],
    [1 - 1e-12, 7.0344869100478356],
  ])('Phi^-1(%d) matches scipy to 1e-14 relative', (p, expected) => {
    expect(Math.abs(normalQuantile(p) - expected) / Math.abs(expected)).toBeLessThan(1e-14);
  });

  it('rejects p outside (0, 1)', () => {
    expect(() => normalQuantile(0)).toThrow(/\(0, 1\)/);
    expect(() => normalQuantile(1)).toThrow(/\(0, 1\)/);
  });

  it('criticalZ(0.95) is the textbook 1.959964', () => {
    expect(criticalZ(0.95)).toBeCloseTo(1.959_964, 6);
  });
});

describe('twoSidedP and continuity correction', () => {
  it('2 * Phi(-1.959964) = 0.05 (scipy: 2*norm.sf(1.959963984540054) = 0.05)', () => {
    expect(twoSidedP(1.959_963_984_540_054)).toBeCloseTo(0.05, 12);
    expect(twoSidedP(0)).toBe(1);
  });

  it('subtracts 0.5 toward zero as R wilcox.test does', () => {
    expect(continuityCorrectedZ(3, 2)).toBe(1.25);
    expect(continuityCorrectedZ(-3, 2)).toBe(-1.25);
    expect(continuityCorrectedZ(0, 2)).toBe(0);
    expect(() => continuityCorrectedZ(1, 0)).toThrow(/sigma/);
  });
});
