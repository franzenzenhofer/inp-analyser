/**
 * Lighthouse BenchmarkIndex, transcribed from
 * https://github.com/GoogleChrome/lighthouse/blob/main/core/lib/page-functions.js (computeBenchmarkIndex).
 * Runs inside the page via page.evaluate: no inner named functions (tsx/esbuild would wrap them in __name()).
 */
export function computeBenchmarkIndex(): number {
  const gcStart = Date.now();
  let gcIterations = 0;
  while (Date.now() - gcStart < 500) {
    let s = '';
    for (let j = 0; j < 10000; j++) s += 'a';
    if (s.length === 1) throw new Error('will never happen, but prevents compiler optimizations');
    gcIterations++;
  }
  const gcIndex = Math.round(gcIterations / 10 / ((Date.now() - gcStart) / 1000));
  const arrA: number[] = [];
  const arrB: number[] = [];
  for (let i = 0; i < 100000; i++) arrA[i] = arrB[i] = i;
  const copyStart = Date.now();
  let copyIterations = 0;
  while (copyIterations % 10 !== 0 || Date.now() - copyStart < 500) {
    const src = copyIterations % 2 === 0 ? arrA : arrB;
    const tgt = copyIterations % 2 === 0 ? arrB : arrA;
    for (let j = 0; j < src.length; j++) tgt[j] = src[j] ?? 0;
    copyIterations++;
  }
  const noGcIndex = Math.round(copyIterations / 10 / ((Date.now() - copyStart) / 1000));
  return (gcIndex + noGcIndex) / 2;
}
