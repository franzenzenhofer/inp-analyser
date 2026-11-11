import { describe, expect, it } from 'vitest';
import type { LongTask } from '../model/measurement.js';
import { bootOffsets, hazardTimeline } from './hazard.js';

const task = (startTime: number, durationMs: number): LongTask => ({ startTime, durationMs, topScriptUrl: '', entity: 'x', isFirstParty: true });

describe('hazardTimeline', () => {
  it('finds the 1 s window after FCP with the most long-task time', () => {
    const t = hazardTimeline(500, [task(300, 400), task(1800, 300), task(2100, 500), task(5000, 100)]);
    expect(t.peakHazardMs).toBe(1800);
    expect(t.peakBusyMs).toBe(800);
  });
  it('boot offsets: after FCP and at peak, collapsed when they nearly coincide', () => {
    expect(bootOffsets(hazardTimeline(500, [task(1800, 300), task(2100, 500)]))).toEqual([600, 1850]);
    expect(bootOffsets(hazardTimeline(500, [task(520, 300)]))).toEqual([600]);
  });
});
