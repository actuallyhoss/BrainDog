/**
 * What a use case installs, made for one record on one day (`loop/research-spark.md` S10 and S13).
 *
 * EXAMPLE ROWS BELONG TO THE USE CASE, NOT TO THE MODULE. A first-party module carries the sample studio's
 * rows (Kiln, Halden Type Co, a brand-system invoice), which is right for the sample and wrong for anybody
 * else. A module a use case installs carries that use case's examples for it, or none: a student's record is
 * never handed a type foundry's projects and clients.
 *
 * A LINK IS NOT A DEPENDENCY. People points at Projects only to say where somebody was met, so People goes in
 * without Projects when the record will not hold them (`firstPartyDocument`'s `holds`).
 *
 * A DAY IN AN EXAMPLE IS COUNTED FROM TODAY (`dates.ts`), so Home's week has something in it on any day.
 *
 * HOME IS A PAGE THE USE CASE DECLARES, called `home-<use case>`, with no place on the rail. The display draws
 * it on Home in place of the house figures (`homePageOf`).
 */

import { AGENTS_PACK, agentsPackDocument } from '../packs/agents.ts';
import { FIRST_PARTY, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../packs/first-party.ts';
import { dated, dayOf } from './dates.ts';
import { FOUNDER_EXAMPLES } from './founder.ts';
import { useCaseDocument, type UseCase } from './index.ts';

type Body = Record<string, unknown>;

/** The example rows each use case gives the first-party modules it names. A use case not listed gives none. */
const MODULE_EXAMPLES: Readonly<Record<string, readonly Body[]>> = { founder: FOUNDER_EXAMPLES };

/** The page a use case's Home is, by the id of the pack it carries or the use case's own id. */
export const homePageOf = (id: string): string => `home-${id.replace(/^usecase-/u, '')}`;

export { dayOf };

export type ModuleOptions = {
  /** The day the record is made, `YYYY-MM-DD`. */
  today: string;
  /** The lists the record will hold once this module is in, so a link to a list it will not hold is left out. */
  holds?: Iterable<string>;
};

/**
 * A first-party module as this use case installs it: its examples, or none, with their days counted from today.
 * With no use case, the module as it always was, the sample's rows included. `null` for an id that is not one.
 */
export function moduleDocument(u: UseCase | null, id: string, options: ModuleOptions): Body | null {
  /* THE AGENTS PACK IS A MODULE TOO, so a sentence that mentions agents adds it rather than saying it is not here. It
     carries no example rows of anybody's. */
  if (id === AGENTS_PACK.manifest.id) return agentsPackDocument();
  const bare = firstPartyDocument(id);
  if (!bare) return null;
  const mine = new Set(((bare.declarations ?? []) as Body[]).flatMap((d) => (typeof d.register === 'string' ? [d.register] : [])));
  const seeds = u === null ? undefined : (MODULE_EXAMPLES[u.usecase] ?? []).filter((s) => mine.has(String(s.register)));
  const doc = firstPartyDocument(id, { ...(options.holds === undefined ? {} : { holds: options.holds }), ...(seeds === undefined ? {} : { seeds }) });
  if (!doc) return null;
  const out = dated(doc, options.today);
  if (Array.isArray(out.seeds) && out.seeds.length === 0) delete out.seeds;
  return out;
}

/**
 * What a module needs already in the record and the lists it adds, by id, for any of the six a use case may name.
 * `null` for an id that is not one.
 */
export function moduleManifest(id: string): { requires: readonly string[]; provides: readonly string[] } | null {
  if (id === AGENTS_PACK.manifest.id)
    return { requires: AGENTS_PACK.manifest.requires, provides: Object.keys(AGENTS_PACK.registers).map((r) => `register.${r}`) };
  return (FIRST_PARTY as readonly string[]).includes(id) ? firstPartyManifest(id as FirstPartyId) : null;
}

/** The pack a use case carries, with its voice as settings and its examples' days counted from today, or `null`. */
export function carriedDocument(u: UseCase, today: string): Body | null {
  return useCaseDocument(u.usecase, today);
}

/** The example rows a use case gives the modules it names, for a test or a proposal to show. */
export const moduleExamples = (u: UseCase): readonly Body[] => MODULE_EXAMPLES[u.usecase] ?? [];
