/**
 * Standard normal distribution.
 * CDF: Hart (1968) double-precision algorithm as published by G. West, "Better approximations to
 * cumulative normal functions", Wilmott Magazine 2005, https://www.wilmott.com/better-approximations-to-cumulative-normal-functions/
 * (absolute error < 1e-14, relative error < 1e-8 even at Phi(-10); the lower tail is computed directly, so small
 * p-values keep their relative precision instead of cancelling in 1 - Phi).
 * Quantile: Wichura (1988) algorithm AS 241 PPND16, Applied Statistics 37(3):477-484,
 * https://doi.org/10.2307/2347330 (relative error ~1e-16).
 */

const TAIL_SWITCH = 7.071_067_811_865_47;
const NUM = [0.035_262_496_599_891_1, 0.700_383_064_443_688, 6.373_962_203_531_65, 33.912_866_078_383,
  112.079_291_497_871, 221.213_596_169_931, 220.206_867_912_376];
const DEN = [0.088_388_347_648_318_4, 1.755_667_163_182_64, 16.064_177_579_207, 86.780_732_202_946_1,
  296.564_248_779_674, 637.333_633_378_831, 793.826_512_519_948, 440.413_735_824_752];
const SQRT_TWO_PI = 2.506_628_274_631;

function horner(coefficients: readonly number[], x: number): number {
  return coefficients.reduce((acc, c) => acc * x + c, 0);
}

/** P(Z <= -|x|), the lower tail at the negative absolute value. */
function lowerTail(absX: number): number {
  if (absX > 37) return 0;
  const exponential = Math.exp((-absX * absX) / 2);
  if (absX < TAIL_SWITCH) return (exponential * horner(NUM, absX)) / horner(DEN, absX);
  const fraction = absX + 1 / (absX + 2 / (absX + 3 / (absX + 4 / (absX + 0.65))));
  return exponential / fraction / SQRT_TWO_PI;
}

export function normalCdf(x: number): number {
  if (Number.isNaN(x)) throw new Error('normalCdf: x is NaN');
  const tail = lowerTail(Math.abs(x));
  return x > 0 ? 1 - tail : tail;
}

/** Two-sided p-value 2 * P(Z >= |z|), capped at 1. */
export function twoSidedP(z: number): number {
  if (Number.isNaN(z)) throw new Error('twoSidedP: z is NaN');
  return Math.min(1, 2 * lowerTail(Math.abs(z)));
}

/**
 * z with continuity correction as in scipy mannwhitneyu/wilcoxon and R wilcox.test: (diff - 0.5 * sign(diff)) / sigma,
 * where diff = statistic - null mean.
 */
export function continuityCorrectedZ(diff: number, sigma: number): number {
  if (!(sigma > 0)) throw new Error(`continuityCorrectedZ: sigma must be > 0, got ${sigma}`);
  return (diff - 0.5 * Math.sign(diff)) / sigma;
}

const A = [2509.0809287301227, 33430.57558358813, 67265.7709270087,
  45921.95393154987, 13731.69376550946, 1971.5909503065513,
  133.14166789178438, 3.3871328727963665];
const B = [5226.495278852854, 28729.085735721943, 39307.89580009271,
  21213.794301586597, 5394.196021424751, 687.1870074920579,
  42.31333070160091, 1];
const C = [0.0007745450142783414, 0.022723844989269184, 0.2417807251774506,
  1.2704582524523684, 3.6478483247632045, 5.769497221460691,
  4.630337846156546, 1.4234371107496835];
const D = [1.0507500716444169e-09, 0.0005475938084995345, 0.015198666563616457,
  0.14810397642748008, 0.6897673349851, 1.6763848301838038,
  2.053191626637759, 1];
const E = [2.0103343992922881e-07, 2.7115555687434876e-05, 0.0012426609473880784,
  0.026532189526576124, 0.29656057182850487, 1.7848265399172913,
  5.463784911164114, 6.657904643501103];
const F = [2.0442631033899397e-15, 1.421511758316446e-07, 1.8463183175100548e-05,
  0.0007868691311456133, 0.014875361290850615, 0.1369298809227358,
  0.599832206555888, 1];

/** Inverse standard normal CDF for p in (0, 1). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`normalQuantile: p must be in (0, 1), got ${p}`);
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180_625 - q * q;
    return (q * horner(A, r)) / horner(B, r);
  }
  const r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
  const value = r <= 5 ? horner(C, r - 1.6) / horner(D, r - 1.6) : horner(E, r - 5) / horner(F, r - 5);
  return q < 0 ? -value : value;
}

/** Two-sided critical value z_(1 - (1 - confidence) / 2). */
export function criticalZ(confidence: number): number {
  if (!(confidence > 0 && confidence < 1)) throw new Error(`criticalZ: confidence must be in (0, 1), got ${confidence}`);
  return normalQuantile(1 - (1 - confidence) / 2);
}
