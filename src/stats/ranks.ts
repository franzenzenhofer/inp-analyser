import { valueAt } from './validate.js';

export interface Ranking {
  /** Midranks (1-based, ties get the mean of their positions) in input order. */
  readonly ranks: readonly number[];
  /** Size of every tie group with more than one member. */
  readonly tieSizes: readonly number[];
}

/** Midranks with tie groups, the ranking used by Mann-Whitney and Wilcoxon (Hollander & Wolfe 2014, ch. 3-4). */
export function midranks(values: readonly number[]): Ranking {
  const order = values.map((value, index) => ({ value, index })).toSorted((a, b) => a.value - b.value);
  const ranks = Array.from({ length: values.length }, () => 0);
  const tieSizes: number[] = [];
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]?.value === order[start]?.value) end += 1;
    const rank = (start + end + 2) / 2;
    for (let position = start; position <= end; position += 1) {
      const entry = order[position];
      if (entry !== undefined) ranks[entry.index] = rank;
    }
    if (end > start) tieSizes.push(end - start + 1);
    start = end + 1;
  }
  return { ranks, tieSizes };
}

/** Sum over tie groups of t^3 - t, the tie term of the rank-statistic variances. */
export function tieTerm(tieSizes: readonly number[]): number {
  return tieSizes.reduce((acc, t) => acc + t * t * t - t, 0);
}

export function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

/** Median of an already sorted array (mean of the two middle values for even n). */
export function sortedMedian(sorted: readonly number[]): number {
  if (sorted.length === 0) throw new Error('sortedMedian: empty array');
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return valueAt(sorted, middle);
  return (valueAt(sorted, middle - 1) + valueAt(sorted, middle)) / 2;
}
