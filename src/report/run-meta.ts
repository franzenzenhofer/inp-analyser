import { z } from 'zod';
import type { HazardTimeline } from '../analysis/hazard.js';
import type { GlobalListener } from '../discovery/types.js';
import type { Condition, Scenario, Target } from '../model/scenario.js';

/** meta.json: everything about an analysis except the runs themselves (those live in runs.jsonl). */
export interface RunMeta {
  readonly url: string;
  readonly seed: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly chromeVersion: string;
  readonly condition: Condition;
  readonly hazard: HazardTimeline;
  readonly targets: readonly Target[];
  readonly excludedTargets: readonly Target[];
  readonly globalListeners: readonly GlobalListener[];
  readonly scenarios: readonly Scenario[];
  readonly deepDived: readonly string[];
  readonly sentinelReferenceMs: readonly number[];
  readonly loads: number;
  readonly incomplete?: string;
}

/** Shallow structural check on read; the nested shapes were written by this tool's own types. */
const metaSchema = z.object({
  url: z.string(), seed: z.number(), startedAt: z.string(), finishedAt: z.string(), chromeVersion: z.string(),
  condition: z.object({ device: z.enum(['mobile', 'desktop']), cpuRate: z.number() }).loose(),
  hazard: z.object({ fcpMs: z.number(), longTasks: z.array(z.unknown()), peakHazardMs: z.number(), peakBusyMs: z.number() }),
  targets: z.array(z.unknown()), excludedTargets: z.array(z.unknown()), globalListeners: z.array(z.unknown()),
  scenarios: z.array(z.unknown()), deepDived: z.array(z.string()), sentinelReferenceMs: z.array(z.number()), loads: z.number(),
  incomplete: z.string().exactOptional(),
});

export function isRunMeta(value: unknown): value is RunMeta {
  return metaSchema.safeParse(value).success;
}

export function parseRunMeta(value: unknown, source: string): RunMeta {
  const parsed = metaSchema.safeParse(value);
  if (!parsed.success || !isRunMeta(value)) throw new Error(`[report] ${source} is not a valid meta.json: ${parsed.error?.message ?? 'shape mismatch'}`);
  return value;
}
