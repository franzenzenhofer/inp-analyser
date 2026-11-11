/** Input guards shared by every statistic. Invalid input throws; nothing is silently skipped. */

export function assertSample(values: readonly number[], label: string): void {
  if (values.length === 0) throw new Error(`${label}: sample is empty`);
  const bad = values.findIndex((value) => !Number.isFinite(value));
  if (bad !== -1) throw new Error(`${label}: value at index ${bad} is not a finite number (${String(values[bad])})`);
}

export function assertMinSize(values: readonly number[], min: number, label: string): void {
  assertSample(values, label);
  if (values.length < min) throw new Error(`${label}: needs at least ${min} values, got ${values.length}`);
}

/** Confidence level strictly between 0 and 1, e.g. 0.95. */
export function assertConfidence(confidence: number, label: string): void {
  if (!(confidence > 0 && confidence < 1)) throw new Error(`${label}: confidence must be in (0, 1), got ${confidence}`);
}

export function assertProbability(p: number, label: string): void {
  if (!(p >= 0 && p <= 1)) throw new Error(`${label}: probability must be in [0, 1], got ${p}`);
}

export function sortedAscending(values: readonly number[]): number[] {
  return values.toSorted((a, b) => a - b);
}

/** Bounds-checked index access (noUncheckedIndexedAccess safe). */
export function valueAt(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`index ${index} out of range for ${values.length} values`);
  return value;
}
