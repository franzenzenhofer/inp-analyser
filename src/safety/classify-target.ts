import type { Candidate } from '../discovery/types.js';
import type { SafetyClass } from '../model/scenario.js';
import { dangerousTerm, decodedUrl } from './denylist.js';

export type ClassifiableTarget = Pick<Candidate, 'label' | 'ariaLabel' | 'value' | 'title' | 'href' | 'linkTarget' | 'download' | 'form'>;

export interface SafetyVerdict {
  readonly safety: SafetyClass;
  readonly reason: string;
}

const SIDE_EFFECT_SCHEMES: ReadonlySet<string> = new Set(['mailto:', 'tel:', 'sms:']);
const SAME_WINDOW_TARGETS: ReadonlySet<string> = new Set(['', '_self', '_top', '_parent']);

function parseUrl(href: string, base: string): URL {
  if (!URL.canParse(href, base)) throw new Error(`[safety] cannot parse href ${JSON.stringify(href)} against ${base}`);
  return new URL(href, base);
}

function denylistHit(target: ClassifiableTarget, pageUrl: string): string | null {
  const texts: [string, string][] = [['label', target.label], ['aria-label', target.ariaLabel], ['value', target.value], ['title', target.title]];
  if (target.href !== null) {
    const url = parseUrl(target.href, pageUrl);
    texts.push(['href', decodedUrl(`${url.pathname}${url.search}`)]);
  }
  for (const [where, text] of texts) {
    const term = dangerousTerm(text);
    if (term !== null) return `denylist term "${term}" in ${where}`;
  }
  return null;
}

function dangerReason(target: ClassifiableTarget, pageUrl: string): string | null {
  const hit = denylistHit(target, pageUrl);
  if (hit !== null) return hit;
  if (target.form?.hasPassword === true) return 'inside a form with a password field';
  if (target.form?.hasPayment === true) return 'inside a form with payment (autocomplete cc-*) fields';
  if (target.href !== null) {
    const scheme = parseUrl(target.href, pageUrl).protocol;
    if (SIDE_EFFECT_SCHEMES.has(scheme)) return `${scheme} link opens an external app`;
    if (target.download) return 'download attribute';
  }
  return null;
}

/**
 * Same-document only when the URL equals the current one with fragments excluded AND carries a fragment
 * (https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate-fragid-step).
 */
function linkNavigationReason(href: string, linkTarget: string | null, pageUrl: string): string | null {
  if (linkTarget !== null && !SAME_WINDOW_TARGETS.has(linkTarget)) return `target=${linkTarget} opens a new browsing context`;
  const url = parseUrl(href, pageUrl);
  if (url.protocol === 'javascript:') return null;
  const page = new URL(pageUrl);
  if (url.origin !== page.origin) return `link to another origin (${url.origin})`;
  if (url.pathname !== page.pathname || url.search !== page.search) return `link to another document (${url.pathname}${url.search})`;
  return href.includes('#') ? null : 'link reloads the current document';
}

/** Safety class of a candidate on `pageUrl`: dangerous > mutating > cross-document-navigation > safe. */
export function classifyTarget(target: ClassifiableTarget, pageUrl: string): SafetyVerdict {
  const danger = dangerReason(target, pageUrl);
  if (danger !== null) return { safety: 'dangerous', reason: danger };
  const form = target.form;
  if (form?.isSubmit === true && form.method === 'post') return { safety: 'mutating', reason: 'submit button of a POST form' };
  if (form?.isSubmit === true && form.method === 'get') return { safety: 'cross-document-navigation', reason: 'submit button of a GET form' };
  const navigation = target.href === null ? null : linkNavigationReason(target.href, target.linkTarget, pageUrl);
  if (navigation !== null) return { safety: 'cross-document-navigation', reason: navigation };
  return { safety: 'safe', reason: 'no denylist term, no form submit, no navigation to another document' };
}
