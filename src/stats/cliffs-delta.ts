import { assertSample } from './validate.js';

/**
 * Cliff's delta (Cliff 1993, https://doi.org/10.1037/0033-2909.114.3.494):
 * delta = (#(b_j > a_i) - #(b_j < a_i)) / (n_a n_b), in [-1, 1]; positive = b tends to be larger (slower),
 * same orientation as the Hodges-Lehmann shift b - a.
 * Magnitude thresholds from Romano, Kromrey, Coraggio & Skowronek 2006 ("Appropriate statistics for ordinal level
 * data", annual meeting of the Florida Association of Institutional Research): |d| < 0.147 negligible, < 0.33 small,
 * < 0.474 medium, else large - as implemented in R effsize::cliff.delta,
 * https://softeng.polito.it/software/effsize/cliff.delta.html
 */

export type CliffMagnitude = 'negligible' | 'small' | 'medium' | 'large';

export interface CliffsDeltaResult {
  readonly delta: number;
  readonly magnitude: CliffMagnitude;
}

export const ROMANO_THRESHOLDS = { negligible: 0.147, small: 0.33, medium: 0.474 } as const;

export function cliffMagnitude(delta: number): CliffMagnitude {
  if (!(delta >= -1 && delta <= 1)) throw new Error(`cliffMagnitude: delta must be in [-1, 1], got ${delta}`);
  const size = Math.abs(delta);
  if (size < ROMANO_THRESHOLDS.negligible) return 'negligible';
  if (size < ROMANO_THRESHOLDS.small) return 'small';
  if (size < ROMANO_THRESHOLDS.medium) return 'medium';
  return 'large';
}

export function cliffsDelta(a: readonly number[], b: readonly number[]): CliffsDeltaResult {
  assertSample(a, 'cliffsDelta sample a');
  assertSample(b, 'cliffsDelta sample b');
  let dominance = 0;
  for (const bj of b) for (const ai of a) dominance += Math.sign(bj - ai);
  const delta = dominance / (a.length * b.length);
  return { delta, magnitude: cliffMagnitude(delta) };
}
