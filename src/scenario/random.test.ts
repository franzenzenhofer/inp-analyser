import { describe, expect, it } from 'vitest';
import { seededRandom, shuffled } from './random.js';

describe('seededRandom / shuffled', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = [seededRandom(42)(), seededRandom(42)()];
    expect(a[0]).toBe(a[1]);
    expect(seededRandom(42)()).not.toBe(seededRandom(43)());
  });
  it('produces values in [0,1)', () => {
    const r = seededRandom(7);
    const values = Array.from({ length: 1000 }, r);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
  it('shuffles to a permutation, same seed same order', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const once = shuffled(items, seededRandom(1));
    expect(once.toSorted()).toEqual(items);
    expect(shuffled(items, seededRandom(1))).toEqual(once);
  });
});
