export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const SYSTEM_CLOCK: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Production default: at most one page load per origin every 10 s. */
export const DEFAULT_MIN_INTERVAL_MS = 10_000;

export interface PolitenessOptions {
  readonly minIntervalMs: number;
  readonly clock: Clock;
}

export interface Politeness {
  /** Waits until the origin of `url` may be loaded again, then counts the load. Returns the ms waited. */
  beforeLoad(url: string): Promise<number>;
  readonly totalLoads: () => number;
  readonly loadsByOrigin: () => ReadonlyMap<string, number>;
}

/** Per-origin rate limiter; the slot is reserved before sleeping, so concurrent callers queue up. */
export function createPoliteness(options: PolitenessOptions): Politeness {
  if (!Number.isFinite(options.minIntervalMs) || options.minIntervalMs < 0) {
    throw new Error(`[safety] minIntervalMs must be a non-negative number, got ${options.minIntervalMs}`);
  }
  const nextSlot = new Map<string, number>();
  const loads = new Map<string, number>();
  return {
    beforeLoad: async (url) => {
      const origin = new URL(url).origin;
      const now = options.clock.now();
      const slot = Math.max(now, nextSlot.get(origin) ?? now);
      nextSlot.set(origin, slot + options.minIntervalMs);
      loads.set(origin, (loads.get(origin) ?? 0) + 1);
      const wait = slot - now;
      if (wait > 0) {
        console.log(`[safety] politeness: waiting ${wait} ms before the next load of ${origin}`);
        await options.clock.sleep(wait);
      }
      return wait;
    },
    totalLoads: () => [...loads.values()].reduce((sum, n) => sum + n, 0),
    loadsByOrigin: () => new Map(loads),
  };
}
