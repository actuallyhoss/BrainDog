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
 * A FIGURE'S TARGET IS THE USE CASE'S TOO, so a person's Money does not hold them to a studio's sums (`MODULE_TARGETS`).
 *
 * HOME IS A PAGE THE USE CASE DECLARES, called `home-<use case>`, with no place on the rail. The display draws
 * it on Home in place of the house figures (`homePageOf`).
 */

import { AGENTS_PACK, agentsPackDocument } from '../packs/agents.ts';
import { FIRST_PARTY, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../packs/first-party.ts';
import { dated, dayOf } from './dates.ts';
import { FOUNDER_EXAMPLES } from './founder.ts';
import { formGuide, GUIDE_KINDS, type FormedPlan } from './guide-kinds.ts';
import type { ExampleLink } from './links.ts';
import { PERSONAL_EXAMPLES, PERSONAL_NAMES, PERSONAL_TARGETS } from './personal.ts';
import { TEAM_EXAMPLES } from './team.ts';
import { useCaseDocument, type UseCase } from './index.ts';

type Body = Record<string, unknown>;

/** The example rows each use case gives the first-party modules it names. A use case not listed gives none. */
const MODULE_EXAMPLES: Readonly<Record<string, readonly Body[]>> = { founder: FOUNDER_EXAMPLES, personal: PERSONAL_EXAMPLES, team: TEAM_EXAMPLES };

/** The targets each use case gives the modules' figures, by metric. A figure not listed keeps the module's own. */
const MODULE_TARGETS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = { personal: PERSONAL_TARGETS };

/** What each use case calls the modules' figures, by metric: the words a tile and the forecast's late knob say. */
const MODULE_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = { personal: PERSONAL_NAMES };

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
  const targets = u === null ? {} : (MODULE_TARGETS[u.usecase] ?? {});
  const names = u === null ? {} : (MODULE_NAMES[u.usecase] ?? {});
  const config = (doc.config ?? {}) as Record<string, Body>;
  if (Array.isArray(doc.declarations))
    doc.declarations = (doc.declarations as Body[]).map((d) => {
      if (typeof d.metric !== 'string') return d;
      const target = targets[d.metric] as Record<string, unknown> | undefined;
      /* A TARGET THAT IS A SETTING KEEPS NAMING IT, and the setting starts at the use case's sum. */
      const setting = (d.target as { setting?: unknown } | undefined)?.setting;
      const held = typeof setting === 'string' ? config[setting] : undefined;
      if (target && held) {
        const bound = typeof target.lte === 'number' ? target.lte : (target.gte as number);
        const was = held.default as { currency?: string } | number | undefined;
        held.default = typeof was === 'object' && was !== null ? { amount: bound, currency: was.currency } : bound;
      }
      return {
        ...d,
        ...(target === undefined ? {} : { target: { ...target, ...(held ? { setting } : {}) } }),
        ...(names[d.metric] === undefined ? {} : { name: names[d.metric] }),
      };
    });
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

/**
 * WHAT A USE CASE FORMS AROUND WHAT THE PERSON SAID, by its id: the guide's plan for a podcast, a shop or an app
 * (`guide-kinds.ts`). A use case not listed, or a sentence that names nothing it knows, forms nothing and keeps its examples.
 */
const FORMS: Readonly<Record<string, (said: string) => FormedPlan | null>> = { guide: formGuide };

/** The example rows a use case forms around a sentence, with how they point at each other, or `null`. */
export const formedFor = (u: UseCase, said: string | null | undefined): FormedPlan | null =>
  said && said.trim() ? (FORMS[u.usecase]?.(said) ?? null) : null;

export type { FormedPlan };

/** The words a use case that forms around a sentence hears as the kind of thing being made, beside its own signals. */
const FORM_WORDS: Readonly<Record<string, readonly string[]>> = { guide: GUIDE_KINDS.flatMap((k) => k.signals) };

const escapeWord = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * WHAT A USE CASE ALREADY HOLDS OF A SENTENCE: whether a phrase heard at `at` lies inside one of its own signals, or one of
 * the words it forms a plan from. "An Etsy shop" said to the guide is the project the guide is for, not a request for
 * Projects, so onboarding does not install a module for a phrase the use case claims (`apps/web/src/lib/shape.ts` `heardFor`).
 */
export function claimedBy(u: UseCase, said: string): (span: { at: number; text: string }) => boolean {
  /* A USE CASE THAT CARRIES NOTHING CLAIMS NOTHING. Small business is whichever modules the sentence names, so "I send
     invoices" said to it is Money, and claiming the word left a bakery with People alone. */
  if (!u.pack && u.modules.length === 0) return () => false;
  const lower = said.toLowerCase();
  const taken: [number, number][] = [];
  for (const signal of [...u.signals, ...(FORM_WORDS[u.usecase] ?? [])])
    for (const m of lower.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeWord(signal.toLowerCase())}(?![\\p{L}\\p{N}])`, 'gu')))
      taken.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return (span) => taken.some(([a, b]) => span.at < b && a < span.at + span.text.length);
}

/** Whether a use case forms its examples around what the person says, so onboarding can ask what the project is. */
export const forms = (u: UseCase): boolean => Object.hasOwn(FORMS, u.usecase);

/**
 * The pack a use case carries, with its voice as settings and its examples' days counted from today, or `null`. Given what
 * the person said, a use case that forms around it carries that plan as its examples instead of its own (`formedFor`).
 */
export function carriedDocument(u: UseCase, today: string, said?: string | null): Body | null {
  const formed = formedFor(u, said);
  if (!formed) return useCaseDocument(u.usecase, today);
  const doc = useCaseDocument(u.usecase, '1970-01-01');
  if (!doc) return null;
  return dated({ ...doc, seeds: formedSeeds(formed.seeds) }, today);
}

/**
 * THE SAME PLAN, WRITTEN AFTER THE PACK IS IN. Where a model is configured, onboarding installs the use case's lists with no
 * rows and asks the model for a plan (`sparkForm`). When it forms nothing, these are the rows the pack's seeds would have
 * been, tagged as the install tags them, with the links to make once they are in, so the templates stand exactly as before.
 */
export function plantedRows(u: UseCase, today: string, said?: string | null): { rows: { register: string; fields: Body }[]; links: ExampleLink[] | undefined } {
  const doc = carriedDocument(u, today, said);
  const rows = ((doc?.seeds ?? []) as Body[]).map((s) => {
    const fields = (s.fields ?? {}) as Body;
    const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : [];
    return { register: String(s.register), fields: { ...fields, tags: tags.includes(EXAMPLE_TAG) ? tags : [...tags, EXAMPLE_TAG] } };
  });
  return { rows, links: formedFor(u, said)?.links };
}

/** A use case's pack with no rows of its own, for a record that asks a model for its plan first. */
export function withoutRows(doc: Body): Body {
  const { seeds: _seeds, ...rest } = doc;
  return rest;
}

/** The tag the install path puts on every row a pack seeds. */
const EXAMPLE_TAG = 'example';

/** The tag a row formed around what the person said carries beside `example`, so Clear the examples never offers their plan. */
export const FORMED_TAG = 'formed';

/**
 * A FORMED PLAN IS THE PERSON'S, NOT A DEMO. Its rows are planted like examples, so they can be edited, finished or deleted
 * like any, but they are what somebody's own words asked for: "Clear the examples" deleting an untouched plan would take
 * away the thing they came for. Each carries `formed` in its tags, and the kernel leaves such a row out of what it clears.
 */
const formedSeeds = (seeds: readonly Body[]): Body[] =>
  seeds.map((s) => {
    const fields = (s.fields ?? {}) as Record<string, unknown>;
    const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : [];
    return { ...s, fields: { ...fields, tags: tags.includes(FORMED_TAG) ? tags : [...tags, FORMED_TAG] } };
  });

/** The example rows a use case gives the modules it names, for a test or a proposal to show. */
export const moduleExamples = (u: UseCase): readonly Body[] => MODULE_EXAMPLES[u.usecase] ?? [];

/**
 * Whether a use case gives a module words or targets of its own: a figure the module declares that the use case names or
 * holds to its own sum. A module installed before the use case keeps the words it went in with, and this is what says the
 * use case has something to offer it (`/packs`, the plan's "Update for").
 */
export function relabels(u: UseCase, id: string): boolean {
  const own = new Set([...Object.keys(MODULE_NAMES[u.usecase] ?? {}), ...Object.keys(MODULE_TARGETS[u.usecase] ?? {})]);
  if (own.size === 0) return false;
  const doc = firstPartyDocument(id);
  return ((doc?.declarations ?? []) as Body[]).some((d) => typeof d.metric === 'string' && own.has(d.metric));
}
