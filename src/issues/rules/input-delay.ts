import { ms } from '../format.js';
import type { Rule } from '../types.js';

/** A task over 50 ms is a long task (devtools-frontend WarningsHandler); input delay is the wait for one to finish. */
const INPUT_DELAY_MIN_MS = 50;
const SPEC_INPUT_DELAY = 'https://web.dev/articles/optimize-input-delay';

export const longTaskInputDelay: Rule = {
  id: 'input-delay/long-task',
  title: 'Input waited for a first-party long task',
  phase: 'input-delay',
  scope: 'interaction',
  specUrl: SPEC_INPUT_DELAY,
  check(run) {
    const tasks = run.attribution.blockingTasks.filter((t) => t.isFirstParty);
    if (run.timing.inputDelay < INPUT_DELAY_MIN_MS || tasks.length === 0) return undefined;
    return {
      ms: run.timing.inputDelay,
      evidence: [
        { label: 'input delay', value: ms(run.timing.inputDelay), ms: run.timing.inputDelay },
        ...tasks.map((t) => ({ label: `long task ${ms(t.durationMs)} (${t.entity})`, value: t.topScriptUrl === '' ? 'no JS samples in task' : t.topScriptUrl, ms: t.durationMs, url: t.topScriptUrl })),
      ],
    };
  },
};

export const thirdPartyInputDelay: Rule = {
  id: 'input-delay/third-party-task',
  title: 'Input waited for a third-party long task',
  phase: 'input-delay',
  scope: 'interaction',
  specUrl: SPEC_INPUT_DELAY,
  check(run) {
    const tasks = run.attribution.blockingTasks.filter((t) => !t.isFirstParty);
    if (run.timing.inputDelay < INPUT_DELAY_MIN_MS || tasks.length === 0) return undefined;
    return {
      ms: run.timing.inputDelay,
      evidence: tasks.map((t) => ({ label: `${t.entity} long task`, value: `${ms(t.durationMs)} - ${t.topScriptUrl}`, ms: t.durationMs, url: t.topScriptUrl })),
    };
  },
};

/** Without a mobile viewport meta, mobile browsers may wait ~300 ms for a double-tap: DevTools Viewport insight. */
export const missingViewport: Rule = {
  id: 'input-delay/no-mobile-viewport',
  title: 'No mobile viewport meta tag (tap delay on mobile)',
  phase: 'input-delay',
  scope: 'page',
  specUrl: 'https://developer.chrome.com/docs/performance/insights/viewport',
  check(run, ctx) {
    if (ctx.scenario.condition.device !== 'mobile' || run.page === undefined || run.page.hasMobileViewport) return undefined;
    return { ms: run.timing.inputDelay, evidence: [{ label: 'meta viewport', value: 'missing or without width=device-width', ms: run.timing.inputDelay }] };
  },
};
