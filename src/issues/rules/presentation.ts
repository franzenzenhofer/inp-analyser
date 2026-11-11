import { ms, scriptEvidence, sumMs } from '../format.js';
import { THRESHOLDS } from '../thresholds.js';
import type { Rule } from '../types.js';
import { dominantPhase } from './processing.js';

const SPEC_DOM = 'https://developer.chrome.com/docs/performance/insights/dom-size';

export const largeStyleRecalc: Rule = {
  id: 'presentation/large-style-recalc',
  title: 'Large style recalculation (> 40 ms, > 300 elements)',
  phase: 'presentation',
  scope: 'interaction',
  specUrl: SPEC_DOM,
  check(run) {
    const big = run.attribution.rendering.filter((r) => r.kind === 'style' && r.ms > THRESHOLDS.largeRenderMs && (r.elementCount ?? 0) > THRESHOLDS.largeStyleElements);
    const top = big[0];
    if (top === undefined) return undefined;
    return { ms: top.ms, evidence: big.map((r) => ({ label: r.forced ? 'forced style recalc' : 'style recalc', value: `${ms(r.ms)}, ${r.elementCount ?? 0} elements`, ms: r.ms })) };
  },
};

/**
 * dirtyObjects counts layout roots; their subtrees can be the whole page (6 dirty of 21012 objects took 214 ms
 * on test-site/large-layout), so a layout's size is max(dirty, total).
 */
function layoutObjects(r: { readonly dirtyObjects?: number; readonly totalObjects?: number }): number {
  return Math.max(r.dirtyObjects ?? 0, r.totalObjects ?? 0);
}

export const largeLayout: Rule = {
  id: 'presentation/large-layout',
  title: 'Large layout (> 40 ms over > 100 layout objects)',
  phase: 'presentation',
  scope: 'interaction',
  specUrl: SPEC_DOM,
  check(run) {
    const big = run.attribution.rendering.filter((r) => r.kind === 'layout' && r.ms > THRESHOLDS.largeRenderMs && layoutObjects(r) > THRESHOLDS.largeLayoutObjects);
    const top = big[0];
    if (top === undefined) return undefined;
    return { ms: top.ms, evidence: big.map((r) => ({ label: r.forced ? 'forced layout' : 'layout', value: `${ms(r.ms)}, ${r.dirtyObjects ?? 0} of ${r.totalObjects ?? 0} objects`, ms: r.ms })) };
  },
};

export const postHandlerScript: Rule = {
  id: 'presentation/script-before-paint',
  title: 'Script runs after the handlers but before the next paint (rAF / observers / timers)',
  phase: 'presentation',
  scope: 'interaction',
  specUrl: 'https://web.dev/articles/optimize-inp#minimize_presentation_delay',
  check(run) {
    const scripts = run.attribution.scripts.filter((s) => s.phase === 'presentation');
    const total = sumMs(scripts, (s) => s.selfMs);
    if (total <= THRESHOLDS.longTaskMs) return undefined;
    return { ms: total, evidence: [{ label: 'script in presentation delay', value: ms(total), ms: total }, ...scriptEvidence(scripts, 5)] };
  },
};

export const renderingDominant: Rule = {
  id: 'presentation/rendering-dominant',
  title: 'Rendering work dominates a slow interaction (presentation delay is the largest phase)',
  phase: 'presentation',
  scope: 'interaction',
  specUrl: 'https://web.dev/articles/inp#good-score',
  check(run) {
    if (run.timing.durationExact <= THRESHOLDS.inpGoodMs || dominantPhase(run) !== 'presentation') return undefined;
    const byKind = ['style', 'layout', 'paint', 'commit'].map((kind) => ({ kind, total: sumMs(run.attribution.rendering.filter((r) => r.kind === kind), (r) => r.ms) }));
    return { ms: run.timing.presentationDelay, evidence: byKind.map((k) => ({ label: k.kind, value: ms(k.total), ms: k.total })) };
  },
};

export const largeDomChange: Rule = {
  id: 'presentation/large-dom-change',
  title: 'The interaction changes many DOM nodes and triggers large style/layout work',
  phase: 'presentation',
  scope: 'interaction',
  specUrl: SPEC_DOM,
  check(run) {
    const nodes = run.attribution.live?.mutationsAfterInput ?? 0;
    const render = run.attribution.rendering.filter((r) => (r.kind === 'style' || r.kind === 'layout') && r.ms > THRESHOLDS.largeRenderMs);
    if (nodes <= THRESHOLDS.largeStyleElements || render.length === 0) return undefined;
    return { ms: sumMs(render, (r) => r.ms), evidence: [{ label: 'DOM nodes changed', value: String(nodes) }, ...render.map((r) => ({ label: r.kind, value: ms(r.ms), ms: r.ms }))] };
  },
};

export const nonCompositedAnimation: Rule = {
  id: 'presentation/non-composited-animation',
  title: 'Non-composited animation runs during the interaction (needs layout/paint every frame)',
  phase: 'presentation',
  scope: 'page',
  specUrl: 'https://developer.chrome.com/docs/lighthouse/performance/non-composited-animations',
  check(run) {
    const list = run.attribution.nonCompositedAnimations;
    if (list.length === 0) return undefined;
    return { evidence: list.map((a) => ({ label: `${a.nodeName} ${a.name}`, value: `failure code ${a.failureCode}; properties: ${a.unsupportedProperties.join(', ') || 'n/a'}` })) };
  },
};
