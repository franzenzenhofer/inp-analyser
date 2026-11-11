import type { InpStore, ObservedFrame } from './in-page-store.js';

/**
 * Runs inside the page before any page script (evaluateOnNewDocument). Must be self-contained and must not
 * declare inner named functions: puppeteer serialises the source, and tsx/esbuild would add __name() calls
 * that do not exist in the page (guarded by src/collect/in-page-serialisation.test.ts).
 * durationThreshold 16 is the minimum the spec allows: https://w3c.github.io/event-timing/#sec-should-add-performanceeventtiming
 */
export function installInPageObservers(): void {
  const store: InpStore = { events: [], frames: [], errors: [], targets: new Map(), mutations: 0 };
  Object.defineProperty(window, 'inpAnalyserStore', { value: store, enumerable: false });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (!(e instanceof PerformanceEventTiming)) continue;
      const t = e.target;
      const targetSelector = t instanceof Element ? `${t.tagName.toLowerCase()}${t.id === '' ? '' : `#${t.id}`}` : '';
      store.events.push({ name: e.name, interactionId: e.interactionId, startTime: e.startTime, duration: e.duration, processingStart: e.processingStart, processingEnd: e.processingEnd, targetSelector });
      if (e.interactionId > 0 && t instanceof Element) store.targets.set(e.interactionId, new WeakRef(t));
    }
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (!(e instanceof PerformanceLongAnimationFrameTiming)) continue;
      const scripts = e.scripts.map((s) => ({ invoker: s.invoker, invokerType: s.invokerType, sourceURL: s.sourceURL, sourceFunctionName: s.sourceFunctionName, sourceCharPosition: s.sourceCharPosition, startTime: s.startTime, duration: s.duration, forcedStyleAndLayoutDuration: s.forcedStyleAndLayoutDuration, pauseDuration: s.pauseDuration }));
      const frame: ObservedFrame = { startTime: e.startTime, duration: e.duration, renderStart: e.renderStart, styleAndLayoutStart: e.styleAndLayoutStart, blockingDuration: e.blockingDuration, firstUIEventTimestamp: e.firstUIEventTimestamp, scripts };
      store.frames.push(frame);
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
  window.addEventListener('error', (ev) => store.errors.push(ev.message));
}

/**
 * Counts changed DOM nodes, not records (one fragment insert of 2000 items is one record but 2000+ nodes).
 * Attribution runs only - observing a large insertion costs main-thread time itself.
 */
export function installMutationCounter(): void {
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      let changed = r.type === 'childList' ? r.removedNodes.length : 1;
      for (const n of r.addedNodes) changed += n instanceof Element ? n.getElementsByTagName('*').length + 1 : 1;
      window.inpAnalyserStore.mutations += changed;
    }
  });
  const options = { childList: true, subtree: true, attributes: true, characterData: true };
  const root = document.querySelector(':root');
  if (root === null) {
    document.addEventListener('readystatechange', () => { observer.observe(document.documentElement, options); }, { once: true });
  } else {
    observer.observe(root, options);
  }
}
