import type { Attribution, Outcome } from './measurement.js';
import type { RunMode, Stage } from './scenario.js';

/** Page facts measured in the page at the end of the run (Lighthouse DOM thresholds 800/1400). */
export interface PageFacts {
  readonly domElements: number;
  readonly maxDepth: number;
  readonly maxChildren: number;
  readonly hasMobileViewport: boolean;
}

export interface MachineSnapshot {
  readonly benchmarkIndex: number;
  readonly loadAverage1m: number;
  readonly onBattery: boolean;
}

/** One measured page session = one line in runs.jsonl, the single source of truth for every report. */
export interface RunRecord {
  readonly runId: string;
  readonly scenarioId: string;
  readonly stage: Stage;
  readonly block: number;
  readonly mode: RunMode;
  readonly startedAt: string;
  readonly chromeVersion: string;
  readonly outcome: Outcome;
  readonly attribution?: Attribution;
  readonly pageExceptions: readonly string[];
  readonly blockedRequests: readonly string[];
  readonly tracePath?: string;
  readonly machine: MachineSnapshot;
  /** In-page Event Timing confirmed the tap landed inside the target (undefined: entry under 16 ms, no target info). */
  readonly hitVerified?: boolean;
  readonly page?: PageFacts;
  /** Set when the run's block failed a machine-health or sentinel check; excluded from all statistics. */
  readonly excluded?: string;
  /** Conditions worth knowing when reading the number (e.g. network never idle, main thread never quiet). */
  readonly notes: readonly string[];
}
