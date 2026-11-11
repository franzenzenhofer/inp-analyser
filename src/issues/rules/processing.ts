import type { TimingPhase } from '../../model/measurement.js';
import { ms, scriptEvidence, sumMs } from '../format.js';
import { THRESHOLDS } from '../thresholds.js';
import type { MeasuredRun, Rule } from '../types.js';

const SPEC_INP = 'https://web.dev/articles/inp#good-score';
const SPEC_FORCED = 'https://developer.chrome.com/docs/performance/insights/forced-reflow';

export function dominantPhase(run: MeasuredRun): TimingPhase {
  const { inputDelay, processing, presentationDelay } = run.timing;
  if (processing >= inputDelay && processing >= presentationDelay) return 'processing';
  return inputDelay >= presentationDelay ? 'input-delay' : 'presentation';
}

function isSlow(run: MeasuredRun): boolean {
  return run.timing.durationExact > THRESHOLDS.inpGoodMs;
}

export const slowHandler: Rule = {
  id: 'processing/slow-event-handlers',
  title: 'Event handlers make the interaction slow (processing is the largest phase)',
  phase: 'processing',
  scope: 'interaction',
  specUrl: SPEC_INP,
  check(run) {
    if (!isSlow(run) || dominantPhase(run) !== 'processing') return undefined;
    const scripts = run.attribution.scripts.filter((s) => s.phase === 'processing');
    return { ms: run.timing.processing, evidence: [{ label: 'processing', value: ms(run.timing.processing), ms: run.timing.processing }, ...scriptEvidence(scripts, 5)] };
  },
};

export const thirdPartyInDispatch: Rule = {
  id: 'processing/third-party-script',
  title: 'Third-party code runs inside the event handling (>= 50 ms, a long task)',
  phase: 'processing',
  scope: 'interaction',
  specUrl: 'https://web.dev/articles/optimize-inp',
  check(run) {
    const thirdParty = run.attribution.scripts.filter((s) => s.phase === 'processing' && !s.isFirstParty);
    const total = sumMs(thirdParty, (s) => s.selfMs);
    if (total < THRESHOLDS.longTaskMs) return undefined;
    return { ms: total, evidence: [{ label: 'third-party script self time', value: ms(total), ms: total }, ...scriptEvidence(thirdParty, 5)] };
  },
};

function forced(run: MeasuredRun): MeasuredRun['attribution']['rendering'] {
  return run.attribution.rendering.filter((r) => r.forced && (r.kind === 'style' || r.kind === 'layout'));
}

export const forcedReflow: Rule = {
  id: 'processing/forced-reflow',
  title: 'Script forces synchronous style/layout (forced reflow over 30 ms)',
  phase: 'processing',
  scope: 'interaction',
  specUrl: SPEC_FORCED,
  check(run) {
    const events = forced(run);
    const total = sumMs(events, (r) => r.ms);
    if (total <= THRESHOLDS.forcedReflowMs) return undefined;
    const top = events.toSorted((a, b) => b.ms - a.ms)[0];
    return { ms: total, evidence: [{ label: 'forced style + layout', value: `${ms(total)} in ${events.length} reflows`, ms: total }, { label: 'triggered from', value: top?.stack.join(' <- ') ?? '' }] };
  },
};

export const layoutThrashing: Rule = {
  id: 'processing/layout-thrashing',
  title: 'Layout thrashing: repeated forced reflows within one interaction',
  phase: 'processing',
  scope: 'interaction',
  specUrl: SPEC_FORCED,
  check(run) {
    const events = forced(run);
    const total = sumMs(events, (r) => r.ms);
    if (events.length < 2 || total <= THRESHOLDS.forcedReflowMs) return undefined;
    return { ms: total, evidence: [{ label: 'forced reflows', value: `${events.length} reflows, ${ms(total)} total`, ms: total }] };
  },
};
