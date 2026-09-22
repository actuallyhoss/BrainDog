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
import { MONEY_HOME_SETTING, targetConfigOf } from '../modules/money.ts';
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

/**
 * EACH PACK'S OWN VERSION. A record is offered an update when the version here is later than the one it installed, so a
 * pack whose declarations or settings change goes up, and one that did not stays where it is: nobody is asked to update
 * Estate because Work gained a field. A new field, page, figure or setting is a minor step; a list or field taken away is
 * a major one. `test/pack-versions.test.ts` holds each version to what it declares, and fails when a pack changes and its
 * version does not.
 *
 * - portfolio 1.1.0: a project says how it is going, what is next, how far along it is and which agent holds it, with
 *   the Overview and the rule over them.
 * - portfolio 1.2.0: How they are going draws each part in its intent.
 * - portfolio 1.3.0: a project says what it earned in a year and what it earned the year before, and the Overview draws
 *   both: the twelve-month total beside the year before it, the difference, and a bar a project. One field added, so the
 *   step is a minor one and nothing is taken away.
 * - portfolio 1.4.0: the Earning figures stop being a sum over every project in play and become a sum over the
 *   projects that said what they earn, which is the same row set the bar beside them draws, and the tile says how
 *   many of them there were. A record where nobody has said anything read `Earned in a year GBP 0.00` in the tone
 *   the product uses for good news. One figure added, `projects-earning-said`, so the step is a minor one.
 * - money-core 1.1.0: the home currency is chosen from a list.
 * - money-core 1.2.0: the ledger arrives: transactions, categories, recurring items, instalments and snapshots, with
 *   the rules over them and the figures they carry. Five lists, so the step is a minor one and nothing is taken away.
 * - money-core 1.3.0: a night can be found by the name it is shown under, the Ledger page tiles, an account says its
 *   last four digits, and the whole book you owe is a figure. Snapshots gain a searchable text title, `accounts` gains
 *   `last4`, the two three-column tables at the foot of Ledger are half and half instead of 7 and a 5 the clamp widened
 *   to 6, and `owed-by-you` is the fourth of the four figures a snapshot holds. Two fields and one figure added and
 *   nothing taken away, so the step is a minor one.
 * - money-core 1.4.0: NOTHING NEW IS DECLARED AT 1.4.0, and that is the point of it. The declarations under the label
 *   1.3.0 were rewritten five times in the seven hours and forty-seven minutes after the label was set, and the last but
 *   one of those, `491e7e05`, added `recurring-ended`, the rule that moves a schedule to `ended` once its last day is
 *   past. A record that installed any earlier 1.3.0 is never offered that rule, so it goes on counting a stopped row at
 *   its full monthly share, GBP 249.00 a month on the row that commit measured. 1.3.0 therefore names five different
 *   sets of declarations and cannot be asked what a record holds, so it is retired and 1.4.0 names what the pack
 *   declares today. Minor and not major by the rule above, which asks a major step for a list or a field taken away: the
 *   two declarations 1.3.0 lost are figures, `recurring-out-month` and `recurring-in-month`, and both registers they read
 *   are still here. They were NOT a second name for `every-month-out` and `every-month-in`, and it is worth saying so
 *   because the short version of this reads as though nothing was lost. They read a different list over a different
 *   filter and gave a different answer to the same question: `62511a98` measured GBP 10,416.16 off `obligations.repeats`
 *   against GBP 9,196.33 off `recurring`, on two pages two clicks apart, and dropped the second because a reader had no
 *   way to tell which one the record meant. So a record on the 17:53 to 18:52 build of 1.3.0 does lose two figures at
 *   1.4.0, and what it loses is the half of a contradiction this pack has since decided against.
 *   `test/pack-versions.test.ts` records all five resets and refuses a sixth.
 * - money-core 1.5.0: a register for what you hold. Gold, a saving certificate and an insurance policy each have a
 *   cost, a day they were acquired and sometimes a day they mature, and until now the only list that would take them was
 *   an account with a balance, which counts a policy as cash somebody could spend. `holdings` is the list that does not.
 *   One list added and nothing taken away, so the step is a minor one.
 * - estate 1.2.0: a service carries a note. the old tool's domains carry the reason each name is held and what is
 *   unresolved about it, and Services had no field that holds prose, so the import left every note in the export. One
 *   field added and nothing taken away, so the step is a minor one. It moves the version rather than riding on 1.1.0
 *   because a record on 1.1.0 is told about the field only through an update, and without one the importer would be
 *   sending a field that record answers `FIELD_UNKNOWN` to.
 * - work 1.1.0: tasks gain an owner, an agent, a priority, steps, a done day and a Backlog status; the Overview and the
 *   Board pages, and the figures under them.
 * - work 1.2.0: Open, on Work and on a project, leaves out work kept for later, and Kept for later is its own figure.
 * - work 1.4.0: the Board says which cards an agent is on right now.
 * - work 1.5.0: Due soon on the Overview stops drawing what is already in the queue above it, and the queue says when
 *   each of its tickets is due. Driven against the sample at 390 and at 1440, the Overview drew three of its fourteen
 *   tickets twice on one screen. Nothing is taken away and no list or field moves, so the step is a minor one: what
 *   changed is `page.work`'s Due soon predicate, its empty line, which would otherwise say nothing is due while blocked
 *   work is, and the Waiting on you columns.
 */
export const FIRST_PARTY_VERSIONS: Readonly<Record<FirstPartyId, string>> = {
  portfolio: '1.4.0',
  people: '1.0.0',
  'money-core': '1.6.0',
  estate: '1.2.0',
  work: '1.5.0',
};

type Body = Record<string, unknown>;

/**
 * THE FIELDS THAT LINK A ROW TO ANOTHER MODULE'S LIST WITHOUT NEEDING IT. People says which projects a person
 * was met in, and a record with no Projects still has people: a student's classmates, a founder's accountant.
 * So "Met in" is a link and not a dependency. When the record will not hold the list it points at, the field is
 * left out of the document with every column drawn over it, and the pack installs on its own. Installing the
 * pack again once that list is there puts the field back. Work's tasks and threads say which project they are for and
 * who holds them the same way, so a homework list installs Work with no Projects and no People.
 */
const LINKS: Partial<Record<FirstPartyId, readonly string[]>> = { people: ['projects'], work: ['owner', 'thing'] };

/**
 * The id a declaration in a document is filed under: its kind's key.
 *
 * `ingest` IS HERE BEFORE ANY INGEST IS, and deliberately. `MONEY_INGESTS` in `modules/money.ts`
 * declares how a forwarded bank message becomes a ledger row, and the one thing left before it
 * installs is an arm in `index.ts`'s declaration list. Without this line that arm would file every
 * pattern under the empty string, so `firstPartyManifest(...).provides` would carry a nameless
 * member and a record comparing two versions of the pack would see one declaration replace another.
 * Five kinds reach a first-party document and this function knew four.
 */
const idOf = (d: Body): string =>
  typeof d.ingest === 'string'
    ? `ingest.${d.ingest}`
    : typeof d.rule === 'string'
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
  return { id, version: FIRST_PARTY_VERSIONS[id], requires: [...needs].sort(), provides: mine.map(idOf).sort(), links };
}

/** The block kinds whose first column is what they group by, so they say nothing once it is gone. */
const GROUPED = new Set(['bar', 'split']);

/**
 * A declaration with the fields in `gone` taken out, and every column and phone field drawn over them. A bar grouped by
 * a field that is gone is left out whole: "Open work by project" on a record with no projects has nothing to group by.
 */
function without(d: Body, gone: ReadonlySet<string>): Body | null {
  if (gone.size === 0) return d;
  const out: Body = { ...d };
  if (Array.isArray(d.fields)) out.fields = (d.fields as Body[]).filter((f) => !gone.has(String(f.id)));
  if (Array.isArray(d.mobile)) out.mobile = (d.mobile as unknown[]).filter((f) => !gone.has(String(f)));
  /* A FIGURE ASKED OF A FIELD THAT IS GONE is left out whole: `project-open` counts a project's tasks, and a record with
     no projects has none to count. */
  if (typeof d.metric === 'string' && typeof d.where === 'string' && [...gone].some((f) => new RegExp(`(?:^|,\\s*)${f}\\s`, 'u').test(d.where as string)))
    return null;
  if (Array.isArray(d.blocks))
    out.blocks = (d.blocks as Body[])
      .filter((b) => !(GROUPED.has(String(b.kind)) && Array.isArray(b.columns) && gone.has(String((b.columns as Body[])[0]?.field))))
      .map((b) => (Array.isArray(b.columns) ? { ...b, columns: (b.columns as Body[]).filter((c) => !gone.has(String(c.field))) } : b));
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
  /* A WALK'S LEG OVER A LIST THE RECORD WILL NOT HOLD IS LEFT OUT, as a link field is: Money's cash walk reads Estate's
     services when they are there, and a person's or a founder's record without Estate still has a walk. */
  const held = options.holds === undefined ? null : new Set(options.holds);
  const legs = (d: Body): Body =>
    held === null || !Array.isArray(d.blocks)
      ? d
      : {
          ...d,
          blocks: (d.blocks as Body[]).map((b) =>
            Array.isArray(b.from) ? { ...b, from: (b.from as Body[]).filter((leg) => typeof leg.register !== 'string' || held.has(leg.register)) } : b,
          ),
        };
  const pack = {
    declarations: whole.declarations.flatMap((d) => {
      const kept = without(d, gone);
      return kept === null ? [] : [legs(kept)];
    }),
    seeds: (options.seeds ?? whole.seeds).map((s) => ({
      ...s,
      fields: Object.fromEntries(Object.entries(s.fields as Body).filter(([k]) => !gone.has(k))),
    })),
  };
  return {
    pack: id,
    version: FIRST_PARTY_VERSIONS[id as FirstPartyId],
    summary: SUMMARIES[id as FirstPartyId],
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: pack.declarations,
    ...(pack.seeds.length > 0 ? { seeds: pack.seeds } : {}),
    /* THE SETTINGS ITS FIGURES' TARGETS ARE HELD TO (`MONEY_TARGET_SETTINGS`), which a person changes later, and Money's
       home currency. */
    ...(Object.keys(configOf(id, pack.declarations)).length > 0 ? { config: configOf(id, pack.declarations) } : {}),
  };
}

/** A first-party pack's settings: its figures' targets, and for Money the currency everything is added up in. */
const configOf = (id: string, declarations: readonly Body[]): Record<string, unknown> => ({
  ...(id === 'money-core' ? MONEY_HOME_SETTING : {}),
  ...targetConfigOf(declarations),
});

/** The starter's declarations no single first-party pack can hold, because they read more than one. */
export const crossPack = (): Record<string, unknown>[] => split().cross;
