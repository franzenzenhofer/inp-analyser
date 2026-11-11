import { describe, expect, it } from 'vitest';
import { sequential } from './sequential.js';

describe('sequential', () => {
  it('never starts the next item before the previous one finished, keeps order', async () => {
    let running = 0;
    let maxRunning = 0;
    const results = await sequential([30, 5, 15], async (ms, i) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      return i;
    });
    expect(results).toEqual([0, 1, 2]);
    expect(maxRunning).toBe(1);
  });
});
