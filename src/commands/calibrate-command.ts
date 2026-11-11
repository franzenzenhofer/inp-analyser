import { launchChrome } from '../browser/launch.js';
import { computeBenchmarkIndex } from '../machine/in-page-benchmark.js';
import { sequential } from '../scenario/sequential.js';

/**
 * Lighthouse BenchmarkIndex device classes (as of Chrome m86, "variation is quite high"):
 * https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md#benchmarking-cpu-power
 */
const CLASSES: ReadonlyArray<readonly [string, number]> = [
  ['low-end mobile (<125)', 125], ['mid-tier mobile (125-800)', 800], ['high-end mobile (800-1200)', 1200],
  ['low-end desktop (1000-1500)', 1500], ['high-end desktop (1500-2000)', 2000],
];
const RATES: readonly number[] = [1, 2, 4, 6, 8, 10, 12, 16, 20];

export function deviceClass(index: number): string {
  return CLASSES.find(([, upper]) => index < upper)?.[0] ?? 'faster than the table (>2000)';
}

export interface CalibrationRow { readonly rate: number; readonly benchmarkIndex: number; readonly deviceClass: string }

/** Measures BenchmarkIndex under each CPU throttling rate instead of trusting the m86 table. */
export async function calibrateCommand(): Promise<CalibrationRow[]> {
  const browser = await launchChrome();
  try {
    return await sequential(RATES, async (rate) => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const client = await page.createCDPSession();
      await client.send('Emulation.setCPUThrottlingRate', { rate });
      const benchmarkIndex = await page.evaluate(computeBenchmarkIndex);
      await context.close();
      const row = { rate, benchmarkIndex, deviceClass: deviceClass(benchmarkIndex) };
      console.log(`[calibrate] ${String(rate).padStart(2)}x  benchmarkIndex ${String(Math.round(benchmarkIndex)).padStart(5)}  ${row.deviceClass}`);
      return row;
    });
  } finally {
    await browser.close();
  }
}
