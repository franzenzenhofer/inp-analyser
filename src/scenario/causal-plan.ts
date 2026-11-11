import type { RunRecord } from '../model/run.js';
import type { Scenario } from '../model/scenario.js';
import { median } from '../stats/descriptive.js';

/** Third-party time worth a causal test: at least one long task's worth (50 ms, devtools-frontend WarningsHandler). */
export const CAUSAL_MIN_THIRD_PARTY_MS = 50;
export const CAUSAL_MAX_SCENARIOS = 3;
export const LEAVE_ONE_OUT_SCENARIOS = 2;
export const LEAVE_ONE_OUT_ENTITIES = 3;

/** Third-party ms per entity in one attribution run: script self time + third-party long tasks the input waited for. */
function thirdPartyMs(record: RunRecord): Map<string, number> {
  const byEntity = new Map<string, number>();
  for (const s of record.attribution?.scripts ?? []) if (!s.isFirstParty) byEntity.set(s.entity, (byEntity.get(s.entity) ?? 0) + s.selfMs);
  for (const t of record.attribution?.blockingTasks ?? []) if (!t.isFirstParty) byEntity.set(t.entity, (byEntity.get(t.entity) ?? 0) + t.durationMs);
  return byEntity;
}

export interface CausalCandidate {
  readonly scenario: Scenario;
  readonly thirdPartyMedianMs: number;
  /** Entities by median third-party ms, largest first. */
  readonly entities: readonly string[];
}

function candidateFor(scenario: Scenario, records: readonly RunRecord[]): CausalCandidate | undefined {
  const runs = records.filter((r) => r.scenarioId === scenario.id && r.mode === 'attribution' && r.excluded === undefined && r.attribution !== undefined);
  if (runs.length === 0) return undefined;
  const perRun = runs.map(thirdPartyMs);
  const totals = perRun.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const thirdPartyMedianMs = median(totals);
  if (thirdPartyMedianMs < CAUSAL_MIN_THIRD_PARTY_MS) return undefined;
  // Pseudo-entities like "(unattributed)" / "(no JS samples)" own no URL and cannot be blocked.
  const names = [...new Set(perRun.flatMap((m) => [...m.keys()]))].filter((n) => !n.startsWith('('));
  const entities = names
    .map((name) => ({ name, ms: median(perRun.map((m) => m.get(name) ?? 0)) }))
    .toSorted((a, b) => b.ms - a.ms)
    .map((e) => e.name);
  return { scenario, thirdPartyMedianMs, entities };
}

/** Deep-dived scenarios whose slow window holds third-party time, most third-party time first. */
export function causalCandidates(scenarios: readonly Scenario[], records: readonly RunRecord[]): CausalCandidate[] {
  return scenarios
    .flatMap((s) => candidateFor(s, records) ?? [])
    .toSorted((a, b) => b.thirdPartyMedianMs - a.thirdPartyMedianMs)
    .slice(0, CAUSAL_MAX_SCENARIOS);
}

export const VARIANT_SEPARATOR = '|3p:';

export function variantScenarios(candidates: readonly CausalCandidate[]): Scenario[] {
  const blockAll = candidates.map((c) => ({ ...c.scenario, id: `${c.scenario.id}${VARIANT_SEPARATOR}block-all`, condition: { ...c.scenario.condition, thirdParty: { kind: 'block-all' as const } } }));
  const loo = candidates.slice(0, LEAVE_ONE_OUT_SCENARIOS).flatMap((c) => c.entities.slice(0, LEAVE_ONE_OUT_ENTITIES).map((entity) => ({
    ...c.scenario, id: `${c.scenario.id}${VARIANT_SEPARATOR}-${entity}`, condition: { ...c.scenario.condition, thirdParty: { kind: 'block-entity' as const, entity } },
  })));
  return [...blockAll, ...loo];
}

export function baseScenarioId(variantId: string): string {
  const at = variantId.indexOf(VARIANT_SEPARATOR);
  return at === -1 ? variantId : variantId.slice(0, at);
}
