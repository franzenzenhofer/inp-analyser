/** Every threshold a rule uses, with the source it comes from (all read 2026-10-09). */
export const THRESHOLDS = {
  /** INP good <= 200 ms, poor > 500 ms: https://web.dev/articles/inp#good-score */
  inpGoodMs: 200,
  inpPoorMs: 500,
  /** Long task > 50 ms: devtools-frontend WarningsHandler LONG_MAIN_THREAD_TASK_THRESHOLD. */
  longTaskMs: 50,
  /** "no forced reflows that take longer than 30 milliseconds": https://developer.chrome.com/docs/performance/insights/forced-reflow */
  forcedReflowMs: 30,
  /** Large style recalc / layout: > 40 ms and > 300 elements / > 100 layout objects: https://developer.chrome.com/docs/performance/insights/dom-size */
  largeRenderMs: 40,
  largeStyleElements: 300,
  largeLayoutObjects: 100,
  /** Lighthouse dom-size warns > ~800, errors > ~1,400 body nodes: https://developer.chrome.com/docs/lighthouse/performance/dom-size */
  domWarnElements: 800,
  domErrorElements: 1400,
} as const;
