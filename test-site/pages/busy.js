/** Blocks the main thread for `ms` milliseconds - the deterministic cost every test page is built from. */
export function busy(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* spin */
  }
}
