import type { LongTask } from '../model/measurement.js';

/** Busy main-thread time in sliding windows: where an interaction during load would wait longest. */
export const HAZARD_WINDOW_MS = 1000;

export interface HazardTimeline {
  readonly fcpMs: number;
  /** Long tasks since navigation start (startTime relative to navigation start). */
  readonly longTasks: readonly LongTask[];
  /** Start of the 1 s window after FCP with the most long-task time. */
  readonly peakHazardMs: number;
  readonly peakBusyMs: number;
}

function busyIn(tasks: readonly LongTask[], start: number, end: number): number {
  return tasks.reduce((sum, t) => sum + Math.max(0, Math.min(end, t.startTime + t.durationMs) - Math.max(start, t.startTime)), 0);
}

/** Candidate window starts: FCP and every long-task start after it. */
export function hazardTimeline(fcpMs: number, longTasks: readonly LongTask[]): HazardTimeline {
  const starts = [fcpMs, ...longTasks.map((t) => t.startTime).filter((s) => s >= fcpMs)];
  let peakHazardMs = fcpMs;
  let peakBusyMs = busyIn(longTasks, fcpMs, fcpMs + HAZARD_WINDOW_MS);
  for (const start of starts) {
    const busy = busyIn(longTasks, start, start + HAZARD_WINDOW_MS);
    if (busy > peakBusyMs) {
      peakBusyMs = busy;
      peakHazardMs = start;
    }
  }
  return { fcpMs, longTasks, peakHazardMs, peakBusyMs };
}

/** Boot tap offsets: just after FCP (earliest visible) and at the peak of main-thread busyness. */
export function bootOffsets(timeline: HazardTimeline): number[] {
  const earliest = Math.round(timeline.fcpMs + 100);
  const peak = Math.round(timeline.peakHazardMs + 50);
  return Math.abs(peak - earliest) < 200 ? [earliest] : [earliest, peak];
}
