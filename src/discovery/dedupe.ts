import type { SafetyClass } from '../model/scenario.js';
import type { Listener } from './types.js';

/**
 * DOM signature + sorted set of own listener locations. url:line:column rather than url:line, because
 * minified bundles put every handler on line 1 and would otherwise collapse unrelated elements.
 */
export function handlerSignature(domSignature: string, listeners: readonly Listener[]): string {
  const locations = [...new Set(listeners.map((l) => `${l.url}:${l.line}:${l.column}`))].toSorted();
  return `${domSignature}|${locations.join(',')}`;
}

export interface Dedupable {
  readonly handlerSignature: string;
  readonly safety: SafetyClass;
  readonly aboveFold: boolean;
}

export interface Merged<T> {
  readonly item: T;
  readonly mergedCount: number;
}

/**
 * Collapses items sharing handler signature AND safety class (a same-looking link to another document
 * must not hide behind a hash link). Keeps the first above-the-fold item, else the first; group order
 * follows the first appearance.
 */
export function dedupe<T extends Dedupable>(items: readonly T[]): readonly Merged<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.safety}|${item.handlerSignature}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return [...groups.values()].map((group) => {
    const kept = group.find((i) => i.aboveFold) ?? group[0];
    if (kept === undefined) throw new Error('[discovery] empty dedupe group');
    return { item: kept, mergedCount: group.length };
  });
}
