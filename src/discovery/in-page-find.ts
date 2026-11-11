import type { PageScanOptions } from './types.js';

/*
 * In-page functions (run inside the page). Each is a top-level function declaration and may only call
 * other declarations of THIS file or of in-page-describe.ts: collect-candidates.ts serialises them all
 * into one script, so no imports, module constants or closures are available at runtime.
 */

/** The document plus every OPEN shadow root, breadth first (closed roots are unreachable by design). */
export function collectRoots(): (Document | ShadowRoot)[] {
  const roots: (Document | ShadowRoot)[] = [document];
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    if (root === undefined) break;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot !== null) roots.push(el.shadowRoot);
    }
  }
  return roots;
}

/** True when `node` is `el` or inside it, crossing shadow boundaries upwards. */
export function composedContains(el: Element, node: Node): boolean {
  let current: Node | null = node;
  while (current !== null) {
    if (current === el) return true;
    current = current instanceof ShadowRoot ? current.host : current.parentNode;
  }
  return false;
}

/** Another element is on top at the centre point. Outside the viewport elementFromPoint sees nothing: not covered. */
export function isCovered(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
  const root = el.getRootNode();
  const scope = root instanceof ShadowRoot ? root : document;
  const hit = scope.elementFromPoint(x, y);
  return hit !== null && !composedContains(el, hit);
}

/** Visible (non-zero box, no display:none / visibility:hidden / opacity:0 up the tree), enabled, not covered. */
export function isInteractable(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  return !isCovered(el);
}

/** Inside an element that is already a candidate (cursor:pointer is inherited by every child). */
export function insideCandidate(el: Element, seen: ReadonlySet<Element>): boolean {
  let current: Node | null = el.parentNode;
  while (current !== null) {
    if (current instanceof Element && seen.has(current)) return true;
    current = current instanceof ShadowRoot ? current.host : current.parentNode;
  }
  return false;
}

/** The element where a cursor:pointer region starts (its parent does not have the pointer). */
export function startsPointerRegion(el: Element): boolean {
  if (getComputedStyle(el).cursor !== 'pointer') return false;
  const parent = el.parentElement;
  return parent === null || getComputedStyle(parent).cursor !== 'pointer';
}

/** Elements that only reveal themselves through cursor:pointer, capped by the scan options. */
export function pointerElements(roots: readonly (Document | ShadowRoot)[], seen: ReadonlySet<Element>, options: PageScanOptions): Element[] {
  const found: Element[] = [];
  let scanned = 0;
  for (const root of roots) {
    for (const el of root.querySelectorAll(root instanceof Document ? 'body *' : '*')) {
      if (found.length >= options.maxPointerCandidates || scanned >= options.maxPointerScan) return found;
      scanned++;
      if (seen.has(el) || !startsPointerRegion(el) || insideCandidate(el, seen)) continue;
      found.push(el);
    }
  }
  return found;
}

/** All interactable candidate elements: selector matches first, then cursor:pointer regions. */
export function findCandidateElements(options: PageScanOptions): Element[] {
  const roots = collectRoots();
  const matched = new Set<Element>();
  for (const root of roots) {
    for (const el of root.querySelectorAll(options.interactiveSelector)) matched.add(el);
  }
  const pointer = pointerElements(roots, matched, options);
  return [...matched, ...pointer].filter((el) => isInteractable(el));
}
