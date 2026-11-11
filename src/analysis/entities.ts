import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Trace, type ParsedTrace, type TraceEvent } from './trace-engine-adapter.js';

/**
 * Who owns a script. Base classification is the DevTools EntityMapper (third-party-web dataset);
 * a user --entity-map adds owners the dataset cannot know (e.g. server-side GTM on the site's own domain).
 */
const entityMapSchema = z.object({
  entities: z.array(z.object({ name: z.string().min(1), category: z.string().min(1), domains: z.array(z.string().min(1)).min(1) })),
});
export type EntityMap = z.infer<typeof entityMapSchema>;

export async function loadEntityMap(path: string): Promise<EntityMap> {
  return entityMapSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export interface EntityRef {
  readonly name: string;
  readonly isFirstParty: boolean;
}

export const UNKNOWN_ENTITY: EntityRef = { name: '(unattributed)', isFirstParty: false };

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname : '';
}

function customEntity(map: EntityMap, url: string): string | undefined {
  const host = hostOf(url);
  if (host === '') return undefined;
  return map.entities.find((e) => e.domains.some((d) => host === d || host.endsWith(`.${d}`)))?.name;
}

export class EntityResolver {
  readonly #mapper: Trace.EntityMapper.EntityMapper;
  readonly #firstParty: string | undefined;
  readonly #custom: EntityMap;

  constructor(parsed: ParsedTrace, custom: EntityMap = { entities: [] }) {
    this.#mapper = Trace.EntityMapper.EntityMapper.getOrCreate(parsed);
    this.#firstParty = this.#mapper.firstPartyEntity()?.name;
    this.#custom = custom;
  }

  forEvent(event: TraceEvent, url: string): EntityRef {
    const custom = customEntity(this.#custom, url);
    if (custom !== undefined) return { name: custom, isFirstParty: false };
    const entity = this.#mapper.entityForEvent(event);
    if (entity === null) return url === '' ? UNKNOWN_ENTITY : { name: hostOf(url), isFirstParty: false };
    return { name: entity.name, isFirstParty: entity.name === this.#firstParty };
  }
}
