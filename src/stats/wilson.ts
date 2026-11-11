import { criticalZ } from './normal.js';
import { assertConfidence } from './validate.js';

/**
 * Wilson (1927) score interval for a binomial proportion k / n, https://doi.org/10.2307/2276774
 * centre = (p + z^2/2n) / (1 + z^2/n), half = z / (1 + z^2/n) * sqrt(p(1 - p)/n + z^2/4n^2), no continuity
 * correction (Newcombe 1998 method 3, https://doi.org/10.1002/(SICI)1097-0258(19980430)17:8<857::AID-SIM777>3.0.CO;2-E).
 * k = 0 gives low = 0 and k = n gives high = 1 exactly (the formula's limits, without rounding noise).
 */

export interface ProportionInterval {
  readonly proportion: number;
  readonly low: number;
  readonly high: number;
}

export interface WilsonInput {
  readonly successes: number;
  readonly trials: number;
  readonly confidence?: number;
}

export function wilsonInterval(input: WilsonInput): ProportionInterval {
  const { successes: k, trials: n } = input;
  const confidence = input.confidence ?? 0.95;
  assertConfidence(confidence, 'wilsonInterval');
  if (!Number.isInteger(n) || n < 1) throw new Error(`wilsonInterval: trials must be a positive integer, got ${n}`);
  if (!Number.isInteger(k) || k < 0 || k > n) throw new Error(`wilsonInterval: successes must be an integer in [0, ${n}], got ${k}`);
  const z = criticalZ(confidence);
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { proportion: p, low: k === 0 ? 0 : centre - half, high: k === n ? 1 : centre + half };
}
