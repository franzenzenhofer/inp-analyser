import type { TargetKind } from '../model/scenario.js';
import type { DiscoveredTarget } from './types.js';

/** Lower runs first: handlers on buttons/roles/listeners > inputs > selects > links. */
const KIND_PRIORITY: Readonly<Record<TargetKind, number>> = {
  button: 0, role: 0, listener: 0, summary: 0, checkbox: 1, 'input-text': 1, select: 2, link: 3,
};

function area(item: DiscoveredTarget): number {
  return item.target.rect.width * item.target.rect.height;
}

function compareTargets(a: DiscoveredTarget, b: DiscoveredTarget): number {
  if (a.target.aboveFold !== b.target.aboveFold) return a.target.aboveFold ? -1 : 1;
  const byKind = KIND_PRIORITY[a.target.kind] - KIND_PRIORITY[b.target.kind];
  return byKind === 0 ? area(b) - area(a) : byKind;
}

/** Above the fold first, then kind priority, then larger area; capped at maxTargets. */
export function rankTargets(items: readonly DiscoveredTarget[], maxTargets: number): readonly DiscoveredTarget[] {
  if (!Number.isInteger(maxTargets) || maxTargets < 1) throw new Error(`[discovery] maxTargets must be a positive integer, got ${maxTargets}`);
  return items.toSorted(compareTargets).slice(0, maxTargets);
}
