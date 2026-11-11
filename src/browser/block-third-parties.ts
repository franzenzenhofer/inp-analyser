import type { CDPSession } from 'puppeteer-core';
import thirdPartyWeb from 'third-party-web';
import type { EntityMap } from '../analysis/entities.js';
import type { ThirdPartyArm } from '../model/scenario.js';

/** Consent managers gate other 3P scripts; blocking them removes the banner and changes the whole experiment. */
// third-party-web is CommonJS: Node's ESM loader gives it only as the default export.
const { entities, getEntity, getRootDomain } = thirdPartyWeb;

const NEVER_BLOCK_CATEGORIES: ReadonlySet<string> = new Set(['consent-provider']);

export interface BlockContext {
  readonly pageUrl: string;
  /** Request URLs seen in preflight; "block-all" blocks every third-party host among them. */
  readonly observedUrls: readonly string[];
  readonly entityMap: EntityMap;
}

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname : '';
}

function isNeverBlocked(url: string, map: EntityMap): boolean {
  const custom = map.entities.find((e) => e.domains.some((d) => hostOf(url).endsWith(d)));
  const category = custom?.category ?? getEntity(url)?.category ?? '';
  return NEVER_BLOCK_CATEGORIES.has(category);
}

function isThirdParty(url: string, firstPartyRoot: string): boolean {
  const host = hostOf(url);
  return host !== '' && getRootDomain(url) !== firstPartyRoot;
}

/** Patterns match the whole URL string, so a host with a port (host:8080) needs its own pattern. */
function hostPatterns(hosts: Iterable<string>): string[] {
  return [...new Set(hosts)].toSorted().flatMap((h) => [`*://${h}/*`, `*://${h}:*/*`]);
}

function entityDomains(entity: string, map: EntityMap): readonly string[] {
  const custom = map.entities.find((e) => e.name === entity);
  if (custom !== undefined) return custom.domains;
  const known = entities.find((e) => e.name === entity);
  if (known !== undefined) return known.domains;
  // Hosts third-party-web does not know are attributed by hostname (src/analysis/entities.ts): block that host.
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(entity)) return [entity];
  throw new Error(`[block] unknown entity "${entity}" (not in third-party-web, --entity-map, nor a hostname)`);
}

/** URL patterns for Network.setBlockedURLs (requests fail with ERR_BLOCKED_BY_CLIENT, like an ad blocker). */
export function blockPatterns(arm: ThirdPartyArm, ctx: BlockContext): string[] {
  if (arm.kind === 'allow') return [];
  if (arm.kind === 'block-entity') return entityDomains(arm.entity, ctx.entityMap).flatMap((d) => hostPatterns([d.replace(/^\*\./, ''), `*.${d.replace(/^\*\./, '')}`]));
  const root = getRootDomain(ctx.pageUrl);
  const hosts = ctx.observedUrls.filter((u) => isThirdParty(u, root) && !isNeverBlocked(u, ctx.entityMap)).map(hostOf);
  return hostPatterns(hosts);
}

export async function applyBlocking(client: CDPSession, patterns: readonly string[]): Promise<void> {
  if (patterns.length === 0) return;
  await client.send('Network.setBlockedURLs', { urls: [...patterns] });
  console.log(`[block] blocking ${patterns.length} third-party patterns`);
}
