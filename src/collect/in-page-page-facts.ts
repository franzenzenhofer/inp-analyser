import type { PageFacts } from '../model/run.js';

/**
 * DOM size facts as Lighthouse's dom-size audit reports them (elements, max depth, max children):
 * https://developer.chrome.com/docs/lighthouse/performance/dom-size. Runs in the page; no inner named functions.
 */
export function collectPageFacts(): PageFacts {
  let maxDepth = 0;
  let maxChildren = 0;
  const stack: Array<[Element, number]> = [[document.documentElement, 1]];
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const [el, depth] = item;
    maxDepth = Math.max(maxDepth, depth);
    maxChildren = Math.max(maxChildren, el.children.length);
    for (const child of el.children) stack.push([child, depth + 1]);
  }
  const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
  return {
    domElements: document.getElementsByTagName('*').length,
    maxDepth,
    maxChildren,
    hasMobileViewport: /width\s*=\s*device-width|initial-scale\s*=/.test(viewport),
  };
}
