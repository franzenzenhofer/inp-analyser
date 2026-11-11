import { createHash } from 'node:crypto';
import { classifyTarget, type SafetyVerdict } from '../safety/classify-target.js';
import { dedupe, handlerSignature, type Merged } from './dedupe.js';
import { rankTargets } from './rank.js';
import type { Candidate, DiscoveredTarget, DiscoveryResult, GlobalListener, Listener } from './types.js';

export interface DiscoveryInput {
  readonly pageUrl: string;
  readonly candidates: readonly Candidate[];
  /** Own listeners per candidate, index-aligned. */
  readonly listeners: readonly (readonly Listener[])[];
  readonly globalListeners: readonly GlobalListener[];
}

interface Classified {
  readonly candidate: Candidate;
  readonly listeners: readonly Listener[];
  readonly verdict: SafetyVerdict;
  readonly handlerSignature: string;
  readonly safety: SafetyVerdict['safety'];
  readonly aboveFold: boolean;
}

/** Deterministic id: the same selector yields the same id in every pass and every run. */
export function targetId(selector: string): string {
  return `t-${createHash('sha1').update(selector).digest('hex').slice(0, 10)}`;
}

function classify(input: DiscoveryInput): Classified[] {
  return input.candidates.map((candidate, i) => {
    const listeners = input.listeners[i];
    if (listeners === undefined) throw new Error(`[discovery] no listener list for candidate ${candidate.selector}`);
    const verdict = classifyTarget(candidate, input.pageUrl);
    const signature = handlerSignature(candidate.domSignature, listeners);
    return { candidate, listeners, verdict, handlerSignature: signature, safety: verdict.safety, aboveFold: candidate.aboveFold };
  });
}

function toDiscovered({ item, mergedCount }: Merged<Classified>): DiscoveredTarget {
  const c = item.candidate;
  const target = {
    id: targetId(c.selector), selector: c.selector, label: c.label, kind: c.kind, rect: c.rect, aboveFold: c.aboveFold,
    handlerSignature: item.handlerSignature, safety: item.verdict.safety, safetyReason: item.verdict.reason,
  };
  return { target, candidate: c, listeners: item.listeners, mergedCount };
}

/** Classify, dedupe by handler signature, split off dangerous targets, rank and cap the rest. */
export function buildDiscovery(input: DiscoveryInput, maxTargets: number): DiscoveryResult {
  const merged = dedupe(classify(input)).map(toDiscovered);
  const excluded = merged.filter((t) => t.target.safety === 'dangerous');
  const targets = rankTargets(merged.filter((t) => t.target.safety !== 'dangerous'), maxTargets);
  console.log(`[discovery] ${input.pageUrl}: ${input.candidates.length} candidates, ${merged.length} after dedupe, `
    + `${targets.length} targets, ${excluded.length} dangerous excluded, ${input.globalListeners.length} global listeners`);
  return { pageUrl: input.pageUrl, targets, excluded, globalListeners: input.globalListeners, candidateCount: input.candidates.length };
}
