import { ms } from '../format.js';
import { THRESHOLDS } from '../thresholds.js';
import type { Rule } from '../types.js';

export const domSize: Rule = {
  id: 'context/dom-size',
  title: 'Large DOM (more than ~800 / ~1,400 elements, Lighthouse dom-size)',
  phase: 'context',
  scope: 'page',
  specUrl: 'https://developer.chrome.com/docs/lighthouse/performance/dom-size',
  check(run) {
    const page = run.page;
    if (page === undefined || page.domElements <= THRESHOLDS.domWarnElements) return undefined;
    return {
      evidence: [
        { label: 'DOM elements', value: String(page.domElements) },
        { label: 'max depth', value: String(page.maxDepth) },
        { label: 'max children of one element', value: String(page.maxChildren) },
      ],
    };
  },
};

export const measurementArtifact: Rule = {
  id: 'context/measurement-artifact',
  title: 'Interaction overlaps work of the measuring tool (not a page problem)',
  phase: 'context',
  scope: 'interaction',
  specUrl: 'https://developer.chrome.com/docs/devtools/performance/reference',
  check(run) {
    if (run.attribution.measurementArtifacts.length === 0) return undefined;
    return { evidence: run.attribution.measurementArtifacts.map((a) => ({ label: 'tool activity', value: a })) };
  },
};

export const pageExceptions: Rule = {
  id: 'context/page-exceptions',
  title: 'Uncaught exceptions on the page during the run',
  phase: 'context',
  scope: 'page',
  specUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event',
  check(run) {
    if (run.record.pageExceptions.length === 0) return undefined;
    return { evidence: run.record.pageExceptions.slice(0, 5).map((e) => ({ label: 'exception', value: e })) };
  },
};

/** Time of a slow interaction that no main-thread work explains: compositor, GPU, raster or frame scheduling. */
export const unexplainedTime: Rule = {
  id: 'context/off-main-thread-time',
  title: 'Most of a slow interaction is not main-thread work (compositor / GPU / frame wait)',
  phase: 'context',
  scope: 'interaction',
  specUrl: 'https://web.dev/articles/inp#whats_in_an_interaction',
  check(run) {
    const share = run.attribution.unattributedMs / run.timing.durationExact;
    if (run.timing.durationExact <= THRESHOLDS.inpGoodMs || share < 0.5) return undefined;
    return { ms: run.attribution.unattributedMs, evidence: [{ label: 'not explained by main-thread work', value: `${ms(run.attribution.unattributedMs)} of ${ms(run.timing.durationExact)}`, ms: run.attribution.unattributedMs }] };
  },
};
