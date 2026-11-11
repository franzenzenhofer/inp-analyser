import { describe, expect, it } from 'vitest';
import { createPoliteness, SYSTEM_CLOCK, type Clock } from './politeness.js';

/** A real clock implementation whose time only moves when someone sleeps or advance() is called. */
function steppedClock(): Clock & { readonly slept: number[]; advance(ms: number): void } {
  let time = 1_000_000;
  const slept: number[] = [];
  return {
    now: () => time,
    sleep: (ms) => {
      slept.push(ms);
      time += ms;
      return Promise.resolve();
    },
    advance: (ms) => {
      time += ms;
    },
    slept,
  };
}

describe('politeness', () => {
  it('first load of an origin is immediate, the next waits the rest of the interval', async () => {
    const clock = steppedClock();
    const polite = createPoliteness({ minIntervalMs: 10_000, clock });
    expect(await polite.beforeLoad('https://a.example/x')).toBe(0);
    clock.advance(3000);
    expect(await polite.beforeLoad('https://a.example/y?z=1')).toBe(7000);
    expect(clock.slept).toStrictEqual([7000]);
  });

  it('origins are independent and counted separately', async () => {
    const clock = steppedClock();
    const polite = createPoliteness({ minIntervalMs: 10_000, clock });
    await polite.beforeLoad('https://a.example/');
    expect(await polite.beforeLoad('https://b.example/')).toBe(0);
    await polite.beforeLoad('https://a.example/2');
    expect(polite.totalLoads()).toBe(3);
    expect([...polite.loadsByOrigin()]).toStrictEqual([['https://a.example', 2], ['https://b.example', 1]]);
  });

  it('concurrent callers reserve slots one interval apart', async () => {
    const frozen: Clock = { now: () => 0, sleep: () => Promise.resolve() };
    const polite = createPoliteness({ minIntervalMs: 10_000, clock: frozen });
    const waits = await Promise.all([polite.beforeLoad('https://a.example/1'), polite.beforeLoad('https://a.example/2'), polite.beforeLoad('https://a.example/3')]);
    expect(waits).toStrictEqual([0, 10_000, 20_000]);
  });

  it('a caller that slept resumes exactly on its slot', async () => {
    const clock = steppedClock();
    const polite = createPoliteness({ minIntervalMs: 10_000, clock });
    const waits = await Promise.all([polite.beforeLoad('https://a.example/1'), polite.beforeLoad('https://a.example/2'), polite.beforeLoad('https://a.example/3')]);
    expect(waits).toStrictEqual([0, 10_000, 10_000]);
    expect(clock.now()).toBe(1_000_000 + 20_000);
  });

  it('no wait once the interval has passed', async () => {
    const clock = steppedClock();
    const polite = createPoliteness({ minIntervalMs: 10_000, clock });
    await polite.beforeLoad('https://a.example/');
    clock.advance(25_000);
    expect(await polite.beforeLoad('https://a.example/')).toBe(0);
  });

  it('really sleeps with the system clock', async () => {
    const polite = createPoliteness({ minIntervalMs: 50, clock: SYSTEM_CLOCK });
    await polite.beforeLoad('https://a.example/');
    const start = Date.now();
    await polite.beforeLoad('https://a.example/');
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it('rejects a negative interval', () => {
    expect(() => createPoliteness({ minIntervalMs: -1, clock: SYSTEM_CLOCK })).toThrow(/minIntervalMs/);
  });
});
