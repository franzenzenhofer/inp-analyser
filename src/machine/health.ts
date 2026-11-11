import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'puppeteer-core';
import type { MachineSnapshot } from '../model/run.js';
import { computeBenchmarkIndex } from './in-page-benchmark.js';

/** Lighthouse: never run measurements concurrently, avoid busy machines: https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md */
export const MAX_BENCHMARK_DRIFT = 0.1;

function pmset(args: readonly string[]): string {
  return execFileSync('pmset', [...args], { encoding: 'utf8' });
}

export interface PowerState { readonly onBattery: boolean; readonly lowPowerMode: boolean; readonly cpuSpeedLimit: number }

const FULL_POWER: PowerState = { onBattery: false, lowPowerMode: false, cpuSpeedLimit: 100 };

/** Linux: any mains adapter reporting online=0 while a battery exists means battery power. */
function linuxPowerState(): PowerState {
  const dir = '/sys/class/power_supply';
  if (!existsSync(dir)) return FULL_POWER;
  const supplies = readdirSync(dir).map((name) => ({
    type: readTrimmed(join(dir, name, 'type')),
    online: readTrimmed(join(dir, name, 'online')),
  }));
  const mains = supplies.filter((s) => s.type === 'Mains');
  const hasBattery = supplies.some((s) => s.type === 'Battery');
  return { ...FULL_POWER, onBattery: hasBattery && mains.length > 0 && mains.every((s) => s.online === '0') };
}

function readTrimmed(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

/** macOS via pmset, Linux via /sys/class/power_supply; other platforms are not checked (BenchmarkIndex gates still apply). */
export function powerState(): PowerState {
  if (process.platform === 'linux') return linuxPowerState();
  if (process.platform !== 'darwin') return FULL_POWER;
  const limit = /CPU_Speed_Limit\s*=\s*(\d+)/.exec(pmset(['-g', 'therm']))?.[1];
  return {
    onBattery: pmset(['-g', 'batt']).includes("'Battery Power'"),
    lowPowerMode: /lowpowermode\s+1/.test(pmset(['-g'])),
    // pmset prints CPU_Speed_Limit only once macOS has throttled; no record = full speed (100).
    cpuSpeedLimit: limit === undefined ? 100 : Number(limit),
  };
}

/** Benchmark in a fresh, unthrottled about:blank page. */
export async function benchmarkIndex(browser: Browser): Promise<number> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    return await page.evaluate(computeBenchmarkIndex);
  } finally {
    await context.close();
  }
}

export async function machineSnapshot(browser: Browser): Promise<MachineSnapshot> {
  return { benchmarkIndex: await benchmarkIndex(browser), loadAverage1m: loadavg()[0] ?? 0, onBattery: powerState().onBattery };
}

/** Default busy limit: 1-minute load above half the cores. */
export function defaultMaxLoad(): number {
  return availableParallelism() / 2;
}

/**
 * Fail loud instead of producing numbers from a throttled or busy machine. `maxLoad` can be raised explicitly on a
 * shared machine (e.g. a CI runner); every run still records its load and each block is still gated on BenchmarkIndex drift.
 */
export function assertMachineFit(snapshot: MachineSnapshot, maxLoad: number = defaultMaxLoad()): void {
  const power = powerState();
  const problems = [
    power.onBattery ? 'running on battery (CPU may be throttled) - plug in the power supply' : '',
    power.lowPowerMode ? 'Low Power Mode is on' : '',
    power.cpuSpeedLimit < 100 ? `thermal pressure: CPU_Speed_Limit=${power.cpuSpeedLimit}` : '',
    snapshot.loadAverage1m > maxLoad ? `machine busy: load ${snapshot.loadAverage1m.toFixed(1)} > ${maxLoad} (--max-load)` : '',
  ].filter((p) => p !== '');
  if (problems.length > 0) throw new Error(`[machine] not fit for measurement: ${problems.join('; ')}`);
}

export function benchmarkDrift(before: number, after: number): number {
  return Math.abs(after - before) / before;
}

/** Keeps the Mac from idling/sleeping while this process runs (caffeinate -i -w <pid>). */
export function keepAwake(): void {
  if (process.platform !== 'darwin') return;
  spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
}
