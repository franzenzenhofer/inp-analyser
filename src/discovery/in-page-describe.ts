import type { Rect, TargetKind } from '../model/scenario.js';
import type { Candidate, FormContext, PageScanOptions } from './types.js';

/*
 * In-page functions (run inside the page), serialised together with in-page-find.ts by
 * collect-candidates.ts. Top-level declarations only; they may call each other but nothing imported.
 */

/** `:nth-of-type(n)` only when a same-tag sibling exists. */
export function nthOfType(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentNode;
  if (parent === null) return tag;
  const same = [...parent.children].filter((c) => c.tagName === el.tagName);
  return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag;
}

/** Unique match of `selector` within the tree scope. */
export function uniqueIn(scope: Document | ShadowRoot, selector: string): boolean {
  return scope.querySelectorAll(selector).length === 1;
}

/** Child-combinator path up to the scope top or the nearest ancestor with a unique id. */
export function pathSelector(el: Element, scope: Document | ShadowRoot): string {
  const steps: string[] = [];
  let current: Element | null = el;
  while (current !== null) {
    const idStep = `${current.tagName.toLowerCase()}#${CSS.escape(current.id)}`;
    if (current !== el && current.id !== '' && uniqueIn(scope, idStep)) {
      steps.unshift(idStep);
      break;
    }
    steps.unshift(nthOfType(current));
    current = current.parentElement;
  }
  return steps.join(' > ');
}

/** Selector inside the element's own tree scope: tag#id, tag[data-testid], else the path. */
export function localSelector(el: Element): string {
  const root = el.getRootNode();
  const scope = root instanceof ShadowRoot ? root : document;
  const tag = el.tagName.toLowerCase();
  if (el.id !== '' && uniqueIn(scope, `${tag}#${CSS.escape(el.id)}`)) return `${tag}#${CSS.escape(el.id)}`;
  const testId = el.getAttribute('data-testid');
  if (testId !== null && uniqueIn(scope, `${tag}[data-testid="${CSS.escape(testId)}"]`)) return `${tag}[data-testid="${CSS.escape(testId)}"]`;
  return pathSelector(el, scope);
}

/** Selector crossing open shadow roots with puppeteer's deep combinator: `host >>> inner`. */
export function deepSelector(el: Element): string {
  const root = el.getRootNode();
  const local = localSelector(el);
  return root instanceof ShadowRoot ? `${deepSelector(root.host)} >>> ${local}` : local;
}

/** Tag + sorted, digit-free class list + behaviour attributes: elements that look and act alike. */
export function domSignature(el: Element): string {
  const classes = [...new Set([...el.classList].map((c) => c.replaceAll(/\d+/g, '')))].filter((c) => c !== '').toSorted();
  const attrs = ['type', 'role', 'target', 'download'].filter((a) => el.hasAttribute(a)).map((a) => `[${a}=${el.getAttribute(a) ?? ''}]`);
  return `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join('')}${attrs.join('')}`;
}

/** Value of buttons and non-password inputs (password values are never read). */
export function valueOf(el: Element): string {
  if (el instanceof HTMLButtonElement) return el.value;
  if (el instanceof HTMLInputElement && el.type !== 'password') return el.value;
  return '';
}

/** aria-label || innerText || value || title, whitespace-collapsed, trimmed to maxLength. */
export function labelOf(el: Element, maxLength: number): string {
  const text = el instanceof HTMLElement ? el.innerText : el.textContent;
  const parts = [el.getAttribute('aria-label'), text, valueOf(el), el.getAttribute('title')];
  const first = parts.map((p) => (p ?? '').replaceAll(/\s+/g, ' ').trim()).find((p) => p !== '');
  return first === undefined ? '' : first.slice(0, maxLength);
}

export function inputKind(type: string): TargetKind {
  if (type === 'checkbox' || type === 'radio') return 'checkbox';
  if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return 'button';
  return 'input-text';
}

export function kindOf(el: Element, roles: readonly string[]): TargetKind {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'select';
  if (tag === 'summary') return 'summary';
  if (tag === 'textarea') return 'input-text';
  if (el instanceof HTMLInputElement) return inputKind(el.type);
  if (roles.includes(el.getAttribute('role') ?? '')) return 'role';
  return 'listener';
}

export function isSubmitControl(el: Element): boolean {
  if (el instanceof HTMLButtonElement) return el.type === 'submit';
  return el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'image');
}

/** Owning form (form attribute aware for form controls) with method and sensitive-field flags. */
export function formContextOf(el: Element): FormContext | null {
  const isControl = el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
  const form = isControl ? el.form : el.closest('form');
  if (form === null) return null;
  const override = el.getAttribute('formmethod');
  return {
    method: override === null ? form.method : override.toLowerCase(),
    hasPassword: form.querySelector('input[type=password]') !== null,
    hasPayment: form.querySelector('[autocomplete*="cc-"]') !== null,
    isSubmit: isSubmitControl(el),
  };
}

/** getBoundingClientRect shifted by the scroll offset: page coordinates. */
export function pageRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
}

export function describeElement(el: Element, options: PageScanOptions): Candidate {
  const rect = pageRect(el);
  const anchor = el instanceof HTMLAnchorElement && el.hasAttribute('href') ? el : null;
  return {
    selector: deepSelector(el),
    label: labelOf(el, options.maxLabelLength),
    ariaLabel: el.getAttribute('aria-label') ?? '',
    value: valueOf(el),
    title: el.getAttribute('title') ?? '',
    kind: kindOf(el, options.interactiveRoles),
    rect,
    aboveFold: rect.y < innerHeight,
    href: anchor === null ? null : anchor.href,
    linkTarget: anchor === null ? null : anchor.getAttribute('target'),
    download: anchor !== null && anchor.hasAttribute('download'),
    form: formContextOf(el),
    domSignature: domSignature(el),
  };
}
