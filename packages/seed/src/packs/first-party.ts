/**
 * The first-party packs one at a time: `portfolio`, `people`, `money-core`, `estate` and `work`, each
 * as a document `@braindog/declare` reads (docs/04-PACKS.md §6, `loop/research-modules.md` §5).
 *
 * SPLIT FROM THE STARTER, NOT WRITTEN BESIDE IT. Every declaration and every seed here is taken from
 * `packDocument()`, so the five documents and the combined one cannot say different things about a
 * register. A declaration goes to the pack its body names with `pack:`, and a page or metric that
 * names none goes to the one pack whose registers it reads.
 *
 * ONE DECLARATION BELONGS TO NONE OF THEM. The project template reads tasks, money and services at
 * once, so putting it in any one of those packs would make that pack require the other two, and a
 * person who asked only for Work would be handed Money as well. It stays in the starter, and
 * `crossPack()` names it.
 *
 * `requires` IS READ FROM THE BODIES, as the agents pack's is written: every register a field points
 * at, a page requires or a metric reads, less the pack's own and the kernel's `session`. The document
 * format names packs it depends on and not registers, and a record whose lists came from the seed has
 * no `pack` row for them, so the document says `packs: {}` and the installer checks the manifest.
 *
 * FUNCTIONS AND NOT CONSTANTS, because `index.ts` re-exports this file and this file reads
 * `index.ts`: a constant computed here would run before the declarations it reads exist.
 */

import { packDocument } from '../index.ts';
import type { PackManifest } from './agents.ts';

export type FirstPartyId = 'portfolio' | 'people' | 'money-core' | 'estate' | 'work';

/** Dependencies first: every other list points at a project, and Money points at People. */
export const FIRST_PARTY: readonly FirstPartyId[] = ['portfolio', 'people', 'money-core', 'estate', 'work'];

const SUMMARIES: Record<FirstPartyId, string> = {
  portfolio: 'The things you run, and the plan for each.',
  people: 'Clients, contractors and accountants, and what each one is for.',
  'money-core': 'What you owe and what you are owed, with a date and a currency.',
  estate: 'Domains, hosting, subscriptions and certificates, and when each one renews.',
  work: 'Tasks, the threads of work they belong to, and how each thread is going.',
};

const VERSION = '1.0.0';

type Body = Record<string, unknown>;

/**
 * THE FIELDS THAT LINK A ROW TO ANOTHER MODULE'S LIST WITHOUT NEEDING IT. People says which projects a person
 * was met in, and a record with no Projects still has people: a student's classmates, a founder's accountant.
 * So "Met in" is a link and not a dependency. When the record will not hold the list it points at, the field is
 * left out of the document with every column drawn over it, and the pack installs on its own. Installing the
 * pack again once that list is there puts the field back.
 */
const LINKS: Partial<Record<FirstPartyId, readonly string[]>> = { people: ['projects'] };

/** The id a declaration in a document is filed under: its kind's key. */
const idOf = (d: Body): string =>
  typeof d.rule === 'string'
    ? `rule.${d.rule}`
    : typeof d.register === 'string'
    ? `register.${d.register}`
    : typeof d.page === 'string'
      ? `page.${d.page}`
      : typeof d.metric === 'string'
        ? `metric.${d.metric}`
        : '';

/** Every register a body leans on: a field's `to:`, a page's `requires`, a metric's `source`. The `links` fields are not counted. */
function leansOn(d: Body, links: readonly string[] = []): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === 'string') out.add(v.replace(/^register\./, ''));
  };
  for (const f of Array.isArray(d.fields) ? (d.fields as Body[]) : [])
    if ((f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && !links.includes(String(f.id))) add(f.to);
  for (const r of Array.isArray(d.requires) ? d.requires : []) add(r);
  if (typeof d.source === 'string' && d.source.startsWith('register.')) add(d.source);
  out.delete('session');
  if (typeof d.register === 'string') out.delete(d.register);
  return out;
}

type Split = {
  owner: Map<string, FirstPartyId>;
  packs: Map<FirstPartyId, { declarations: Body[]; seeds: Body[] }>;
  cross: Body[];
  seeds: Body[];
};

function split(): Split {
  const doc = packDocument() as { declarations: Body[]; seeds: Body[] };
  const known = new Set<string>(FIRST_PARTY);
  const owner = new Map<string, FirstPartyId>();
  for (const d of doc.declarations)
    if (typeof d.register === 'string' && typeof d.pack === 'string' && known.has(d.pack)) owner.set(d.register, d.pack as FirstPartyId);

  const packs = new Map(FIRST_PARTY.map((id) => [id, { declarations: [] as Body[], seeds: [] as Body[] }]));
  const cross: Body[] = [];
  for (const d of doc.declarations) {
    const tagged = typeof d.pack === 'string' && known.has(d.pack) ? (d.pack as FirstPartyId) : null;
    const readers = new Set([...leansOn(d)].map((r) => owner.get(r)));
    const only = readers.size === 1 ? [...readers][0] : undefined;
    const home = tagged ?? only ?? null;
    if (home === null) cross.push(d);
    else packs.get(home)!.declarations.push(d);
  }
  for (const s of doc.seeds) {
    const home = owner.get(String(s.register));
    if (home) packs.get(home)!.seeds.push(s);
  }
  return { owner, packs, cross, seeds: doc.seeds };
}

/**
 * One first-party pack's manifest: its id, its version, the registers it needs already there, and the ones it
 * only links to (`LINKS`), which it points at when the record holds them and leaves out when it does not.
 */
export function firstPartyManifest(id: FirstPartyId): PackManifest & { provides: readonly string[]; links: readonly string[] } {
  const { packs } = split();
  const mine = packs.get(id)!.declarations;
  const own = new Set(mine.filter((d) => typeof d.register === 'string').map((d) => d.register as string));
  const needs = new Set<string>();
  const any = new Set<string>();
  for (const d of mine) {
    for (const r of leansOn(d, LINKS[id])) if (!own.has(r)) needs.add(`register.${r}`);
    for (const r of leansOn(d)) if (!own.has(r)) any.add(`register.${r}`);
  }
  const links = [...any].filter((r) => !needs.has(r)).sort();
  return { id, version: VERSION, requires: [...needs].sort(), provides: mine.map(idOf).sort(), links };
}

/** A declaration with the fields in `gone` taken out, and every column and phone field drawn over them. */
function without(d: Body, gone: ReadonlySet<string>): Body {
  if (gone.size === 0) return d;
  const out: Body = { ...d };
  if (Array.isArray(d.fields)) out.fields = (d.fields as Body[]).filter((f) => !gone.has(String(f.id)));
  if (Array.isArray(d.mobile)) out.mobile = (d.mobile as unknown[]).filter((f) => !gone.has(String(f)));
  if (Array.isArray(d.blocks))
    out.blocks = (d.blocks as Body[]).map((b) => (Array.isArray(b.columns) ? { ...b, columns: (b.columns as Body[]).filter((c) => !gone.has(String(c.field))) } : b));
  return out;
}

export type DocumentOptions = {
  /**
   * The lists the record will hold once this pack is in. A link field (`LINKS`) to a list not among them is left
   * out. Absent keeps every link, which is the document as it always was.
   */
  holds?: Iterable<string>;
  /** The example rows to carry in place of the sample's, `[]` for none. Absent keeps the sample's. */
  seeds?: readonly Body[];
};

/** One first-party pack as a document, with its example rows. `null` for an id that is not one of the five. */
export function firstPartyDocument(id: string, options: DocumentOptions = {}): Record<string, unknown> | null {
  if (!(FIRST_PARTY as readonly string[]).includes(id)) return null;
  const whole = split().packs.get(id as FirstPartyId)!;
  const links = LINKS[id as FirstPartyId] ?? [];
  const gone = new Set<string>();
  if (options.holds !== undefined) {
    const held = new Set(options.holds);
    for (const d of whole.declarations)
      for (const f of Array.isArray(d.fields) ? (d.fields as Body[]) : [])
        if (links.includes(String(f.id)) && f.to !== d.register && !held.has(String(f.to))) gone.add(String(f.id));
  }
  const pack = {
    declarations: whole.declarations.map((d) => without(d, gone)),
    seeds: (options.seeds ?? whole.seeds).map((s) => ({
      ...s,
      fields: Object.fromEntries(Object.entries(s.fields as Body).filter(([k]) => !gone.has(k))),
    })),
  };
  return {
    pack: id,
    version: VERSION,
    summary: SUMMARIES[id as FirstPartyId],
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: pack.declarations,
    ...(pack.seeds.length > 0 ? { seeds: pack.seeds } : {}),
  };
}

/** The starter's declarations no single first-party pack can hold, because they read more than one. */
export const crossPack = (): Record<string, unknown>[] => split().cross;
