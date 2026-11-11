import { assertProbability } from './validate.js';

/**
 * Holm (1979) step-down adjusted p-values, https://www.jstor.org/stable/4615733
 * Sorted ascending p_(1..m): adj_(i) = max_{j <= i} min(1, (m - j + 1) p_(j)); returned in INPUT order.
 * Identical to R `p.adjust(p, method = "holm")`: pmin(1, cummax((n + 1 - i) * p[o]))[ro],
 * https://github.com/wch/r-source/blob/trunk/src/library/stats/R/p.adjust.R
 */
export function holmAdjust(pValues: readonly number[]): number[] {
  if (pValues.length === 0) throw new Error('holmAdjust: no p-values');
  pValues.forEach((p, index) => assertProbability(p, `holmAdjust p[${index}]`));
  const m = pValues.length;
  const order = pValues.map((p, index) => ({ p, index })).toSorted((x, y) => x.p - y.p);
  const adjusted = Array.from({ length: m }, () => 0);
  let runningMax = 0;
  order.forEach((entry, rank) => {
    runningMax = Math.max(runningMax, Math.min(1, (m - rank) * entry.p));
    adjusted[entry.index] = runningMax;
  });
  return adjusted;
}
