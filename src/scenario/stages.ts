import type { Condition, Phase, Scenario, Target } from '../model/scenario.js';
import { shuffled } from './random.js';
import type { ScenarioSummary } from './summarise.js';

/** Plan defaults (docs/tickets/0001, "Stages"). */
export const SCREENING_RUNS = 3;
export const DEEP_BLOCK_RUNS = 4;
export const DEEP_MIN_RUNS = 8;
export const DEEP_MAX_RUNS = 20;
export const ATTRIBUTION_RUNS = 5;
/** Deep-dive what can be slow: INP "needs improvement" starts above 200 ms (https://web.dev/articles/inp#good-score). */
export const DEEP_DIVE_FROM_MS = 200;

export interface ScreeningInput {
  readonly targets: readonly Target[];
  readonly phases: readonly Phase[];
  readonly condition: Condition;
  /** Boot tap points per offset (ms after navigation start) from the boot-geometry probe. */
  readonly bootGeometry: ReadonlyMap<number, ReadonlyMap<string, { readonly x: number; readonly y: number }>>;
}

function scenarioId(target: Target, phase: Phase, offset?: number): string {
  return offset === undefined ? `${phase}:${target.id}` : `${phase}@${Math.round(offset)}:${target.id}`;
}

export function screeningScenarios(input: ScreeningInput): Scenario[] {
  return input.targets.flatMap((target) => input.phases.flatMap((phase): Scenario[] => {
    if (phase === 'idle') return [{ id: scenarioId(target, phase), targetId: target.id, phase, condition: input.condition }];
    if (phase === 'boot') {
      if (!target.aboveFold) return [];
      return [...input.bootGeometry].flatMap(([offsetMs, points]) => {
        const tapPoint = points.get(target.id);
        return tapPoint === undefined ? [] : [{ id: scenarioId(target, phase, offsetMs), targetId: target.id, phase, offsetMs, tapPoint, condition: input.condition }];
      });
    }
    return [];
  }));
}

export interface PlannedRun { readonly scenario: Scenario; readonly block: number }

/** Every block runs every scenario once, in a fresh seeded random order (interleaving against drift). */
export function blockOrder(scenarios: readonly Scenario[], blocks: number, random: () => number): PlannedRun[] {
  return Array.from({ length: blocks }, (_, block) => shuffled(scenarios, random).map((scenario) => ({ scenario, block }))).flat();
}

/** Screening has 3 runs (no CI possible): deep-dive any scenario whose slowest run exceeded 200 ms. */
export function selectDeepDive(summaries: readonly ScenarioSummary[]): string[] {
  return summaries
    .filter((s) => (s.max ?? 0) > DEEP_DIVE_FROM_MS)
    .toSorted((a, b) => (b.median ?? 0) - (a.median ?? 0))
    .map((s) => s.scenarioId);
}
