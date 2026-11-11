import { cdfAt, criticalLowerRank, mannWhitneyDistribution, signedRankDistribution } from './exact-distributions.js';
import type { CountDistribution } from './exact-distributions.js';
import { MANN_WHITNEY_EXACT_MAX_N, mannWhitneySigma } from './mann-whitney.js';
import { criticalZ, normalCdf } from './normal.js';
import { midranks, sortedMedian } from './ranks.js';
import { assertConfidence, assertSample, sortedAscending, valueAt } from './validate.js';
import { WILCOXON_EXACT_BELOW_N, pairedDifferences, signedRankSigma } from './wilcoxon.js';

/**
 * Hodges-Lehmann estimators with distribution-free CIs (Hodges & Lehmann 1963, https://doi.org/10.1214/aoms/1177704172).
 * Two-sample shift: median of all n_a * n_b differences b_j - a_i; CI after Moses (Hollander & Wolfe,
 * Nonparametric Statistical Methods, 3rd ed. 2014, sec. 4.3): [D_(k), D_(N + 1 - k)] with N = n_a n_b and
 * k = smallest q with P(U <= q) > alpha/2, the same rule as R `wilcox.test(conf.int = TRUE)` for exact CIs
 * (see criticalLowerRank).
 * Paired: median of the n(n + 1)/2 Walsh averages (d_i + d_j)/2, i <= j, of d = b - a (all differences,
 * zeros included: the estimator is defined on the full sample); CI (Tukey) [W_(k), W_(M + 1 - k)] with
 * k from the signed-rank distribution (Hollander & Wolfe sec. 3.2; R `qsignrank` rule).
 * k is exact when the no-ties null distribution applies (two-sample: both n <= 10, no ties; paired: n < 50,
 * no ties among |d|, no zero d); otherwise the continuity-corrected normal approximation
 * k = floor(mu - z_(1 - alpha/2) * sigma + 0.5), sigma tie-corrected, which solves P(S <= k - 1) <= alpha/2
 * with P(S <= s) ~ Phi((s + 0.5 - mu) / sigma) (large-sample rule of Hollander & Wolfe; R instead inverts the
 * test numerically with uniroot, so R's approximate CIs can differ slightly). Against the exact critical rank
 * this k is equal or one rank lower (wider, conservative); see hodges-lehmann.test.ts.
 * k < 1 means the data cannot reach the confidence: throws (R silently returns (-Inf, Inf)).
 */

export interface ShiftEstimate {
  readonly estimate: number;
  readonly low: number;
  readonly high: number;
  /** 1-based rank k of the lower bound among the sorted differences / Walsh averages. */
  readonly k: number;
  readonly achievedConfidence: number;
  readonly method: 'exact' | 'normal';
}

interface NullModel {
  readonly exact?: CountDistribution;
  readonly mean: number;
  readonly sigma: number;
}

function criticalRank(model: NullModel, confidence: number): { k: number; achievedConfidence: number } {
  const alphaHalf = (1 - confidence) / 2;
  if (model.exact !== undefined) {
    const k = criticalLowerRank(model.exact, alphaHalf);
    return { k, achievedConfidence: 1 - 2 * cdfAt(model.exact, k - 1) };
  }
  const k = Math.floor(model.mean - criticalZ(confidence) * model.sigma + 0.5);
  return { k, achievedConfidence: 1 - 2 * normalCdf((k - 0.5 - model.mean) / model.sigma) };
}

function intervalFrom(sorted: readonly number[], model: NullModel, confidence: number): ShiftEstimate {
  assertConfidence(confidence, 'hodgesLehmann');
  const { k, achievedConfidence } = criticalRank(model, confidence);
  if (k < 1) throw new Error(`sample too small for a ${confidence * 100}% Hodges-Lehmann CI (critical rank ${k}): needs more runs`);
  return {
    estimate: sortedMedian(sorted),
    low: valueAt(sorted, k - 1),
    high: valueAt(sorted, sorted.length - k),
    k,
    achievedConfidence,
    method: model.exact === undefined ? 'normal' : 'exact',
  };
}

/** Shift of b relative to a (positive = b slower), with CI. */
export function hodgesLehmannShift(a: readonly number[], b: readonly number[], confidence = 0.95): ShiftEstimate {
  assertSample(a, 'hodgesLehmannShift sample a');
  assertSample(b, 'hodgesLehmannShift sample b');
  const differences = sortedAscending(b.flatMap((bj) => a.map((ai) => bj - ai)));
  const { tieSizes } = midranks([...a, ...b]);
  const small = a.length <= MANN_WHITNEY_EXACT_MAX_N && b.length <= MANN_WHITNEY_EXACT_MAX_N;
  const model: NullModel = {
    ...(small && tieSizes.length === 0 ? { exact: mannWhitneyDistribution(a.length, b.length) } : {}),
    mean: (a.length * b.length) / 2,
    sigma: mannWhitneySigma(a.length, b.length, tieSizes),
  };
  return intervalFrom(differences, model, confidence);
}

export function walshAverages(values: readonly number[]): number[] {
  return values.flatMap((vi, i) => values.slice(i).map((vj) => (vi + vj) / 2));
}

/** Paired (one-sample) Hodges-Lehmann: median Walsh average of b - a, with Tukey CI. */
export function hodgesLehmannPaired(a: readonly number[], b: readonly number[], confidence = 0.95): ShiftEstimate {
  const d = pairedDifferences(a, b);
  const n = d.length;
  const { tieSizes } = midranks(d.map((value) => Math.abs(value)));
  const exactApplies = n < WILCOXON_EXACT_BELOW_N && tieSizes.length === 0 && !d.includes(0);
  const model: NullModel = {
    ...(exactApplies ? { exact: signedRankDistribution(n) } : {}),
    mean: (n * (n + 1)) / 4,
    sigma: signedRankSigma(n, tieSizes),
  };
  return intervalFrom(sortedAscending(walshAverages(d)), model, confidence);
}
