/**
 * Runs `fn` over `items` strictly one after another. Measurements must never overlap: parallel Chrome
 * instances compete for CPU cores and corrupt INP (https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md).
 */
export async function sequential<T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  await items.reduce(async (previous, item, index) => {
    await previous;
    results.push(await fn(item, index));
  }, Promise.resolve());
  return results;
}
