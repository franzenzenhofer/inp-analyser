/** Methods that do not change server state (https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1). */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const SITE_LABELS = 2;

/**
 * Site key: the last two host labels (IP addresses and IPv6 stay whole). Without a public-suffix list
 * this over-groups hosts under shared suffixes (a.co.uk and b.co.uk count as one site), which makes
 * MORE requests first-party and therefore blocked: the error is on the safe side.
 */
export function siteKey(hostname: string): string {
  if (IPV4.test(hostname) || hostname.includes(':') || hostname.startsWith('[')) return hostname;
  return hostname.split('.').slice(-SITE_LABELS).join('.');
}

export function isFirstParty(url: string, pageUrl: string): boolean {
  return siteKey(new URL(url).hostname) === siteKey(new URL(pageUrl).hostname);
}

export interface PausedRequest {
  readonly url: string;
  readonly method: string;
  /** CDP Network.ResourceType: Document, XHR, Fetch, Ping, Other, ... */
  readonly resourceType: string;
  readonly frameId: string;
}

export interface DecisionContext {
  readonly pageUrl: string;
  readonly mainFrameId: string;
  /** --allow-mutations: matching URLs are exempt from mutation blocking (never from navigation cancelling). */
  readonly allowMutations: RegExp | null;
}

export type FetchDecision =
  | { readonly action: 'continue' }
  | { readonly action: 'cancel-navigation' }
  | { readonly action: 'block'; readonly reason: string };

/**
 * Armed guard: a main-frame document request is answered 204 so the page stays and the handler cost is still
 * measured ("servers can respond with 204 or 205 status codes ... which cause navigation to abort and the
 * navigable to stay on its original active document",
 * https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigation-and-session-history:~:text=During%20navigation%2C%20servers%20can%20respond%20with%20204);
 * a first-party non-GET/HEAD/OPTIONS request is failed; the rest passes.
 */
export function decideRequest(request: PausedRequest, context: DecisionContext): FetchDecision {
  if (request.resourceType === 'Document' && request.frameId === context.mainFrameId) return { action: 'cancel-navigation' };
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { action: 'continue' };
  if (!isFirstParty(request.url, context.pageUrl)) return { action: 'continue' };
  if (context.allowMutations?.test(request.url) === true) return { action: 'continue' };
  return { action: 'block', reason: `first-party ${request.method} ${request.resourceType}` };
}
