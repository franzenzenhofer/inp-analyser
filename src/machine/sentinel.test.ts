import { describe, expect, it } from 'vitest';
import { judgeSentinel } from './sentinel.js';

describe('judgeSentinel', () => {
  it('accepts values within max(16 ms, 15%) of the reference median', () => {
    expect(judgeSentinel([128, 128, 136, 128, 128, 136], 145).valid).toBe(true);
  });
  it('rejects a block whose sentinel drifted out of the band', () => {
    const verdict = judgeSentinel([128, 128, 136, 128, 128, 136], 180);
    expect(verdict.valid).toBe(false);
    expect(verdict.toleranceMs).toBeCloseTo(19.2);
  });
});
