/**
 * What a use case installs, made for one record on one day.
 *
 * NOTHING IS INSTALLED AS AN EXAMPLE. A document built here carries no example
 * rows unless it is asked for them (`examples: true`), for a preview to draw or a test to hold a page against.
 * Asked, the rows belong to the use case, not to the module: a first-party module's own are the sample studio's
 * (Kiln, Halden Type Co), so a student's record is never handed a type foundry's projects and clients.
 *
 * A LINK IS NOT A DEPENDENCY. People points at Projects only to say where somebody was met, so People goes in
 * without Projects when the record will not hold them (`firstPartyDocument`'s `holds`).
 *
 * A DAY IN AN EXAMPLE IS COUNTED FROM TODAY (`dates.ts`), so Home's week has something in it on any day.
 *
 * A FIGURE'S TARGET IS THE USE CASE'S TOO, so a person's Money does not hold them to a studio's sums (`MODULE_TARGETS`).
 *
 * AND SO ARE A MODULE'S WORDS, so a student's Work says Homework and nobody but a business is owed money (`MODULE_NAMES`).
 *
 * HOME IS A PAGE THE USE CASE DECLARES, called `home-<use case>`, with no place on the rail. The display draws
 * it on Home in place of the house figures (`homePageOf`).
 */

import { holdsIn } from '@braindog/declare';

import { AGENTS_PACK, agentsPackDocument } from '../packs/agents.ts';
import { crossPack, FIRST_PARTY, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../packs/first-party.ts';
import { CATEGORIES_REGISTER, STARTER_CATEGORIES } from '../modules/money/lists/categories.ts';
import { dated, dayOf } from './dates.ts';
import { BUSINESS_EXAMPLES, BUSINESS_NAMES } from './business.ts';
import { FOUNDER_EXAMPLES, FOUNDER_NAMES } from './founder.ts';
import { GUIDE_NAMES } from './guide.ts';
import { formGuide, GUIDE_KINDS, type FormedPlan } from './guide-kinds.ts';
import type { ExampleLink } from './links.ts';
import { PERSONAL_NAMES, PERSONAL_TARGETS } from './personal.ts';
import { STUDENT_NAMES } from './student.ts';
import { TEAM_EXAMPLES, TEAM_NAMES } from './team.ts';
import { useCaseDocument, type UseCase } from './index.ts';

type Body = Record<string, unknown>;

/**
 * The example rows each use case gives the first-party modules it names, drawn only by a preview or a test. A use
 * case not listed gives none. PERSONAL IS NOT LISTED SINCE ITS 2.0.0: a person's month in pounds was the wrong picture
 * of anybody's record, and a person's Home is drawn from what they write.
 */
const MODULE_EXAMPLES: Readonly<Record<string, readonly Body[]>> = { business: BUSINESS_EXAMPLES, founder: FOUNDER_EXAMPLES, team: TEAM_EXAMPLES };

/**
 * WHAT A LIST STARTS WITH THAT IS THE PERSON'S FROM THE FIRST DAY, by list (ruling 341). Not an example: nobody's
 * demonstration, no use case's, and never in `MODULE_EXAMPLES`. A set here carries no `tags`, so a row of it is told
 * from an example by what it is and not by a mark, and whoever writes it writes it as a person's own entry.
 */
const STARTERS: Readonly<Record<string, readonly Readonly<Body>[]>> = { [CATEGORIES_REGISTER.id]: STARTER_CATEGORIES };

const saidAs = (name: unknown): string => String(name ?? '').trim().toLowerCase();

/**
 * Whether a row is one of its list's starter set as it ships: by its name, and carrying no `example` tag. An example
 * that happens to share a starter's name stays an example.
 */
export function isStarter(register: string, fields: Readonly<Body>): boolean {
  const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : [];
  return !tags.includes(EXAMPLE_TAG) && (STARTERS[register] ?? []).some((row) => saidAs(row.name) === saidAs(fields.name));
}

const startersIn = (lists: Iterable<string>): { register: string; fields: Body }[] =>
  [...lists].flatMap((register) => (STARTERS[register] ?? []).map((row) => ({ register, fields: { ...row } })));

/**
 * THE STARTER ROWS A MODULE BRINGS, for whoever writes them once the module is in: each a list and its fields, with no
 * tag on it. `[]` for a module that brings none and for an id that is not a module. An install plants every one of a
 * document's `seeds` as an example, so a path that installs through one writes these itself, as it writes a person's
 * own entries, and only into a list that holds nothing yet.
 */
export function starterRows(id: string): { register: string; fields: Body }[] {
  const declared = ((firstPartyDocument(id, { seeds: [] })?.declarations ?? []) as Body[]).flatMap((d) => (typeof d.register === 'string' && d.rule === undefined ? [d.register] : []));
  return startersIn(declared);
}

/**
 * The targets each use case gives the modules' figures, by metric. A figure not listed keeps the module's own. IN NO
 * CURRENCY: a bound here is a count or a number of days, because a use case cannot know the currency of the record it
 * lands on, and a sum of money a person means is a setting they type.
 */
const MODULE_TARGETS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = { personal: PERSONAL_TARGETS };

/** One use case's words for the modules: by module id, then by the module's own words or a figure's metric id. */
type ModuleWords = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * THE PLAIN WORDS, which every use case but a business's starts from. Money and a
 * project's page speak a business's money as they ship: "Receivables", "Late payables", "Nothing owed either way".
 * Nobody but a founder or a small business is owed money by a client on an invoice, so a person, a student, a team or
 * somebody starting a project reads what is due to them and what they have to pay. A project's money on its way is
 * Still to come in for everyone since batch 74 (owed-words-74), so no plain word is laid over it.
 */
const PLAIN_NAMES: ModuleWords = {
  'money-core': {
    'Receivables, 30 days': 'Due to you, 30 days',
    'Payables, 30 days': 'To pay, 30 days',
    'Receivables': 'Due to you',
    'Payables': 'Still to pay',
    'Most payables due in 30 days': 'Most to pay in 30 days',
    'Most receivables at once': 'Most due to you at once',
    'Most payables at once': 'Most to pay at once',
    'Late payables': 'Late to pay',
  },
  portfolio: {
    'Nothing owed either way on {{name}}.': 'No money is due either way on {{name}}.',
  },
};

/** A use case's own words laid over the plain words, module by module. */
const over = (plain: ModuleWords, own: ModuleWords): ModuleWords =>
  Object.fromEntries([...new Set([...Object.keys(plain), ...Object.keys(own)])].map((m) => [m, { ...plain[m], ...own[m] }]));

/**
 * WHAT EACH USE CASE CALLS WHAT THE MODULES SAY, by module. A key is a figure's metric id, which names the figure (the
 * words a tile and the forecast's late knob say), or a sentence the module says, which is replaced whole wherever that
 * module says it: a page's title and its place on the rail, a block's heading, empty line or note, a tile's or a
 * series' label, a rule's question and a setting's label (`spoken`). A sentence is matched whole, so a module that
 * rewords one is read in its own new words rather than half in each. A rule's answers are never relabelled, because
 * what an answer starts is found by its words (`MONEY_AUTOMATIONS` in `modules/money.ts`).
 *
 * A USE CASE NOT LISTED SPEAKS THE PLAIN WORDS, and with no use case at all a module is its own document
 * (`firstPartyDocument`), since that is what an install with none writes.
 */
const MODULE_NAMES: Readonly<Record<string, ModuleWords>> = {
  personal: over(PLAIN_NAMES, PERSONAL_NAMES),
  student: over(PLAIN_NAMES, STUDENT_NAMES),
  team: over(PLAIN_NAMES, TEAM_NAMES),
  guide: over(PLAIN_NAMES, GUIDE_NAMES),
  founder: FOUNDER_NAMES,
  business: BUSINESS_NAMES,
};

/** What a use case calls what one module says. */
const wordsFor = (u: UseCase, id: string): Readonly<Record<string, string>> => (MODULE_NAMES[u.usecase] ?? PLAIN_NAMES)[id] ?? {};

const isBody = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A value as the use case says it: a sentence it has a word for, else the value as the module wrote it. */
const say = (words: Readonly<Record<string, string>>, v: unknown): unknown => (typeof v === 'string' && Object.hasOwn(words, v) ? words[v] : v);

/** A block in the use case's words: its heading, empty line and note, and each tile's and series' label. */
function spokenBlock(b: Body, words: Readonly<Record<string, string>>): Body {
  const out: Body = { ...b };
  for (const k of ['heading', 'empty', 'body'] as const) if (k in b) out[k] = say(words, b[k]);
  for (const k of ['cells', 'series'] as const)
    if (Array.isArray(b[k])) out[k] = (b[k] as unknown[]).map((c) => (isBody(c) && 'label' in c ? { ...c, label: say(words, c.label) } : c));
  return out;
}

/**
 * A module's document in the use case's words: each figure's name, each page's title, section and blocks, each rule's
 * question, and each setting's label. Nothing else moves, so a figure, a page or a rule is the same declaration by id.
 */
function spoken(doc: Body, words: Readonly<Record<string, string>>): Body {
  if (Object.keys(words).length === 0) return doc;
  const out: Body = { ...doc };
  if (Array.isArray(doc.declarations))
    out.declarations = (doc.declarations as Body[]).map((d) => {
      const s: Body = { ...d };
      if (typeof d.metric === 'string') {
        const name = Object.hasOwn(words, d.metric) ? words[d.metric] : say(words, d.name);
        if (name !== undefined) s.name = name;
      }
      if (typeof d.page === 'string') {
        if ('title' in d) s.title = say(words, d.title);
        if (isBody(d.nav) && 'section' in d.nav) s.nav = { ...d.nav, section: say(words, d.nav.section) };
        if (Array.isArray(d.blocks)) s.blocks = (d.blocks as unknown[]).map((b) => (isBody(b) ? spokenBlock(b, words) : b));
      }
      if (typeof d.rule === 'string' && Array.isArray(d.then))
        s.then = (d.then as unknown[]).map((step) =>
          isBody(step) && isBody(step.suggest) && 'question' in step.suggest ? { ...step, suggest: { ...step.suggest, question: say(words, step.suggest.question) } } : step,
        );
      return s;
    });
  if (isBody(doc.config))
    out.config = Object.fromEntries(Object.entries(doc.config).map(([k, v]) => [k, isBody(v) && 'label' in v ? { ...v, label: say(words, v.label) } : v]));
  return out;
}

/** The page a use case's Home is, by the id of the pack it carries or the use case's own id. */
export const homePageOf = (id: string): string => `home-${id.replace(/^usecase-/u, '')}`;

export { dayOf };

export type ModuleOptions = {
  /** The day the record is made, `YYYY-MM-DD`. */
  today: string;
  /** The lists the record will hold once this module is in, so a link to a list it will not hold is left out. */
  holds?: Iterable<string>;
  /**
   * `true` for a document that carries example rows: the use case's for the module, or the module's own with no use
   * case. Left out, the module carries none, and the first run never passes it.
   */
  examples?: boolean;
  /**
   * `true` for a document that carries the module's starter rows (`starterRows`) in its `seeds`, asked for examples or
   * not. FOR AN INSTALL THAT PLANTS THEM UNTAGGED: the record's own plants every seed tagged `example`, which would
   * count a person's categories as examples and offer to clear them, so nothing passes this until its host tells a
   * starter from an example (`isStarter`). Left out, the document carries none and `starterRows` is how they go in.
   */
  starters?: boolean;
};

/**
 * A first-party module as this use case installs it, with no rows in it. `null` for an id that is not one.
 *
 * NOTHING IS WRITTEN AS AN EXAMPLE. A module used to carry the
 * use case's example rows, and with no use case the sample studio's (Kiln, Halden), so the first run's "Start from a
 * list" planted a type foundry's clients in a student's record. A document asked for with `examples: true` still
 * carries them, for a preview to draw or a test to hold a page against; nothing that writes to a record asks for one.
 */
export function moduleDocument(u: UseCase | null, id: string, options: ModuleOptions): Body | null {
  /* THE AGENTS PACK IS A MODULE TOO, so a sentence that mentions agents adds it rather than saying it is not here. It
     carries no example rows of anybody's. */
  if (id === AGENTS_PACK.manifest.id) return agentsPackDocument(options.holds === undefined ? {} : { holds: options.holds });
  const bare = firstPartyDocument(id);
  if (!bare) return null;
  const mine = new Set(((bare.declarations ?? []) as Body[]).flatMap((d) => (typeof d.register === 'string' ? [d.register] : [])));
  /* `undefined` IS THE MODULE'S OWN ROWS to `firstPartyDocument`, so it is asked for only when examples are. */
  const examples =
    options.examples !== true ? [] : u === null ? undefined : (MODULE_EXAMPLES[u.usecase] ?? []).filter((s) => mine.has(String(s.register)));
  /* THE STARTER SET GOES WITH THEM WHEN IT IS ASKED FOR, and never beside examples of the same list: the module's own
     rows already hold it, and a use case's examples for that list with eight more would pass what a pack may seed one
     list with. A preview that draws a use case's categories draws those. */
  const seeds =
    examples === undefined || options.starters !== true ? examples : [...examples, ...startersIn(mine).filter((s) => !examples.some((e) => e.register === s.register))];
  const doc = firstPartyDocument(id, { ...(options.holds === undefined ? {} : { holds: options.holds }), ...(seeds === undefined ? {} : { seeds }) });
  if (!doc) return null;
  const targets = u === null ? {} : (MODULE_TARGETS[u.usecase] ?? {});
  const config = (doc.config ?? {}) as Record<string, Body>;
  if (Array.isArray(doc.declarations))
    doc.declarations = (doc.declarations as Body[]).map((d) => {
      if (typeof d.metric !== 'string') return d;
      const target = targets[d.metric] as Record<string, unknown> | undefined;
      /* A TARGET THAT IS A SETTING KEEPS NAMING IT, and the setting starts at the use case's sum. A SUM OF MONEY WITH NO
         CURRENCY STARTS EMPTY, as money-core 3.0.0's own does (`targetConfigOf` in `modules/money.ts`): a money setting
         takes `{ amount, currency }`, a use case's figure is in no currency, and a bare number there was refused at
         install (`VALUE_MALFORMED`). Its bound goes with it, so the declaration names the setting and no figure. */
      const setting = (d.target as { setting?: unknown } | undefined)?.setting;
      const held = typeof setting === 'string' ? config[setting] : undefined;
      let empty = false;
      if (target && held) {
        const bound = typeof target.lte === 'number' ? target.lte : (target.gte as number);
        const was = held.default as { currency?: string } | number | undefined;
        if (typeof was === 'object' && was !== null) held.default = { amount: bound, currency: was.currency };
        else if (held.type !== 'money') held.default = bound;
        else empty = true;
      }
      return {
        ...d,
        ...(target === undefined || empty ? {} : { target: { ...target, ...(held ? { setting } : {}) } }),
      };
    });
  /* THE USE CASE'S WORDS LAST, over the targets, so a setting's label is said in them once its default is set. */
  const out = dated(u === null ? doc : spoken(doc, wordsFor(u, id)), options.today);
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
 * (`guide-kinds.ts`). A use case not listed, or a sentence that names nothing it knows, forms nothing.
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
 * Whether the pack a use case carries owns a list of its own, not only a page. A student or a guide declares its own
 * registers (courses, milestones) and claims its signals; small business's pack is one page and no list since it took
 * its own Home, so a pack alone no longer says a use case carries something.
 */
const ownsList = (pack: Record<string, unknown> | null): boolean => {
  const declarations = pack?.declarations;
  return Array.isArray(declarations) && (declarations as Body[]).some((d) => typeof d.register === 'string');
};

/**
 * WHAT A USE CASE ALREADY HOLDS OF A SENTENCE: whether a phrase heard at `at` lies inside one of its own signals, or one of
 * the words it forms a plan from. "An Etsy shop" said to the guide is the project the guide is for, not a request for
 * Projects, so onboarding does not install a module for a phrase the use case claims (`apps/web/src/lib/shape.ts` `heardFor`).
 */
export function claimedBy(u: UseCase, said: string): (span: { at: number; text: string }) => boolean {
  /* A USE CASE THAT CARRIES NOTHING CLAIMS NOTHING. Small business is whichever modules the sentence names, so "I send
     invoices" said to it is Money, and claiming the word left a bakery with People alone. */
  if (!ownsList(u.pack) && u.modules.length === 0) return () => false;
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
 * The pack a use case carries, with its voice as settings, or `null`. Its only rows are the plan formed from what the
 * person said (`formedFor`), each tagged `formed`, with its days counted from today.
 *
 * THE USE CASE'S OWN EXAMPLES ARE NOT CARRIED: a Personal record arrived holding 56 rows,
 * every one in pounds, which its owner then had to find and clear (counted from
 * `personal.ts`). `examples: true` carries them for a preview or a test,
 * and a formed plan still wins over them, because it is what the person asked for.
 */
export function carriedDocument(
  u: UseCase,
  today: string,
  said?: string | null,
  options: { examples?: boolean; starters?: boolean; holds?: ReadonlySet<string> } = {},
): Body | null {
  const doc = carriedWhole(u, today, said, options);
  /* CUT TO WHAT THE RECORD WILL HOLD WHEN IT IS SAID (`fitted`), so a use case that goes in with only what it stands on
     opens on pages it can draw. Not said, the document is the whole one, as it always was. */
  return doc === null || options.holds === undefined ? doc : fitted(doc, options.holds);
}

function carriedWhole(u: UseCase, today: string, said: string | null | undefined, options: { examples?: boolean; starters?: boolean }): Body | null {
  const formed = formedFor(u, said);
  if (!formed) {
    const doc = useCaseDocument(u.usecase, today);
    return doc && options.examples !== true ? withoutRows(doc, options) : doc;
  }
  const doc = useCaseDocument(u.usecase, '1970-01-01');
  if (!doc) return null;
  /* A STARTER SET THE PACK CARRIES STAYS BESIDE THE PLAN, as it ships and never tagged `formed`: it is no part of what
     the sentence asked for, and it is nobody's example either. */
  const starters = options.starters === true ? starterSeedsOf(doc) : [];
  return dated({ ...doc, seeds: [...formedSeeds(formed.seeds), ...starters] }, today);
}

/**
 * THE SAME PLAN, AS ROWS TO WRITE ONCE THE PACK IS IN: the rows formed from what the person said, with the links to make
 * once they are in. A sentence that forms nothing plants nothing, because the use case's own examples are never written
 * (`carriedDocument`).
 *
 * A FORMED ROW CARRIES `formed` AND NEVER `example`: what somebody's own words asked for is theirs, so "Clear
 * the examples" can never take it, and no fresh record holds a row tagged `example`. A row that is not formed, which the
 * plan carries none of today, is still tagged as the install tags it.
 */
export function plantedRows(u: UseCase, today: string, said?: string | null): { rows: { register: string; fields: Body }[]; links: ExampleLink[] | undefined } {
  const doc = carriedDocument(u, today, said);
  const rows = ((doc?.seeds ?? []) as Body[]).map((s) => {
    const fields = (s.fields ?? {}) as Body;
    const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : [];
    const mine = tags.includes(FORMED_TAG);
    return { register: String(s.register), fields: { ...fields, tags: mine ? tags.filter((t) => t !== EXAMPLE_TAG) : tags.includes(EXAMPLE_TAG) ? tags : [...tags, EXAMPLE_TAG] } };
  });
  return { rows, links: formedFor(u, said)?.links };
}

/** The rows among a document's `seeds` that are a starter set's (`isStarter`), as the document carries them. */
const starterSeedsOf = (doc: Body): Body[] =>
  (Array.isArray(doc.seeds) ? (doc.seeds as Body[]) : []).filter((s) => typeof s.register === 'string' && isStarter(s.register, (s.fields ?? {}) as Body));

/**
 * A use case's pack with no rows of its own, for a record that asks a model for its plan first. `starters: true` keeps
 * the starter rows it carries and drops every example, for an install that plants them untagged (`ModuleOptions`).
 */
export function withoutRows(doc: Body, options: { starters?: boolean } = {}): Body {
  const { seeds: _seeds, ...rest } = doc;
  const kept = options.starters === true ? starterSeedsOf(doc) : [];
  return kept.length > 0 ? { ...rest, seeds: kept } : rest;
}

/* ── a document cut to the lists a record holds ─────────────────────────── */

/** The lists the kernel seats in every record, which no pack declares and so no `holds` names. */
const KERNEL_LISTS = ['session'];

/** What a figure reads: the lists it is counted over, and the lists of the document that declares it. */
type Figure = { lists: readonly string[]; owners: readonly string[] };

const listIn = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('register.') ? v.slice('register.'.length) : null);

/** Every list a `where:` written as a tree points through (`pointed: { register }`), at any depth. */
function pointedIn(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) pointedIn(x, out);
  else if (isBody(v)) for (const [k, x] of Object.entries(v)) k === 'pointed' && isBody(x) && typeof x.register === 'string' ? (out.push(x.register), pointedIn(x, out)) : pointedIn(x, out);
  return out;
}

/** The lists a figure is counted over: its source and every list its `where:` points through. Its legs are cut apart. */
const figureLists = (d: Body): string[] => [...(listIn(d.source) === null ? [] : [listIn(d.source)!]), ...pointedIn(d.where)];

/** The lists a document declares that wait on nothing (`when: { holds }` is the plan's to settle). */
const ownLists = (decls: readonly Body[]): string[] => decls.flatMap((d) => (typeof d.register === 'string' && holdsIn(d.when) === null ? [d.register] : []));

/**
 * THE FIGURES AND PAGES EVERY DOCUMENT THE SEED SHIPS DECLARES, read once from the documents themselves and never listed
 * by name: a use case's block that tests another add-on's figure, or a block it adds to another add-on's page, is there
 * only while the record holds what that add-on is. A figure or page nobody here declares is the kernel's own, always held.
 */
let shipped: { figures: Map<string, Figure>; pages: Map<string, readonly string[]> } | null = null;
function catalogue(): NonNullable<typeof shipped> {
  if (shipped) return shipped;
  const figures = new Map<string, Figure>();
  const pages = new Map<string, readonly string[]>();
  const docs = [{ declarations: crossPack() }, ...FIRST_PARTY.map((id) => firstPartyDocument(id)), agentsPackDocument()];
  for (const doc of docs) {
    const decls = (Array.isArray(doc?.declarations) ? doc.declarations : []).filter(isBody);
    const owners = ownLists(decls);
    for (const d of decls) {
      if (typeof d.metric === 'string') figures.set(d.metric, { lists: figureLists(d), owners });
      if (typeof d.page === 'string' && owners.length > 0) pages.set(d.page, owners);
    }
  }
  shipped = { figures, pages };
  return shipped;
}

/** The figure ids a block's `when:` tests, at any depth (`{ all: [{ metric }] }`), each without its argument. */
function figuresIn(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) figuresIn(x, out);
  else if (isBody(v)) for (const [k, x] of Object.entries(v)) typeof x === 'string' && k === 'metric' ? out.push(x.split(':')[0]!) : figuresIn(x, out);
  return out;
}

/** The ids a sentence fills in (`{{cash-now}}`, `{{orders-owed.first_who}}`), each as far as its first `.` or `:`. */
const filledIn = (v: unknown): string[] => (typeof v === 'string' ? [...v.matchAll(/\{\{\s*([a-z0-9][a-z0-9_-]*)/gu)].map((m) => m[1]!) : []);

/** Whether a `where:`, as words or as a tree, names one of these fields. */
const whereNames = (where: unknown, fields: ReadonlySet<string>): boolean =>
  fields.size > 0 &&
  (typeof where === 'string'
    ? [...fields].some((f) => new RegExp(`(?:^|,\\s*)${escapeWord(f)}\\s`, 'u').test(where))
    : [...fields].some((f) => JSON.stringify(where ?? null).includes(`"field":${JSON.stringify(f)}`)));

/** A block's kinds that only frame the others: a page left with these alone is a heading over a hole. */
const FRAMES = new Set(['note', 'section']);

/**
 * A DOCUMENT CUT TO THE LISTS A RECORD HOLDS, for any pack, so a use case can go in with what it stands on and
 * grow into the rest. `holds` is every list the record will hold once the document is in; the document's own lists and
 * the kernel's are held whatever it says. Out go: a list's link field to a list not held (with the columns, filters,
 * roles and seed values over it); a figure counted over a list not held, or asked of a field so taken out; a rule about,
 * or writing to, a list not held; a feed writing to one; a block reading one, testing a figure that went, or saying one in
 * its words; a page per row of a list not held, and a page left with nothing but a heading; a list not held from each
 * page's `requires`, from what the document extends and from what it adds to other pages. A PART THAT SAYS
 * `when: { holds }` IS LEFT TO THAT RULE (`@braindog/declare` `when.ts`), which the plan settles. Nothing is named here:
 * what each figure and page reads is read off the documents themselves (`catalogue`).
 */
export function fitted(doc: Body, holds: ReadonlySet<string>): Body {
  const decls = (Array.isArray(doc.declarations) ? (doc.declarations as unknown[]) : []).filter(isBody);
  const held = new Set([...holds, ...ownLists(decls), ...KERNEL_LISTS]);
  const has = (list: string | null): boolean => list === null || held.has(list);
  const waits = (part: Body): boolean => holdsIn(part.when) !== null;
  const isLink = (f: Body): boolean => (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && typeof f.to === 'string';
  /* A LINK FIELD TO A LIST NOT HELD, BY ITS OWN LIST, since two lists may share a field id and point it at different lists. */
  const goneIn = new Map<string, Set<string>>();
  for (const d of decls)
    if (typeof d.register === 'string' && !waits(d))
      for (const f of (Array.isArray(d.fields) ? (d.fields as unknown[]) : []).filter(isBody))
        if (isLink(f) && !waits(f) && !has(String(f.to))) goneIn.set(d.register, (goneIn.get(d.register) ?? new Set<string>()).add(String(f.id)));
  /* AND A LINK THIS DOCUMENT LAYS ON ANOTHER PACK'S LIST (`extends`) TO A LIST NOT HELD, SINCE founder 3.0.0, with what
     reads it, as one of its own lists' would go: the founder lays a reading's organisation and service on Portfolio's
     Numbers, and its figure over `about_service` goes with the field on a record with no services. */
  const lays = isBody(doc.extends) ? doc.extends : {};
  for (const [id, ext] of Object.entries(lays)) {
    const onto = listIn(id);
    if (onto === null || !isBody(ext) || !Array.isArray(ext.fields)) continue;
    for (const f of (ext.fields as unknown[]).filter(isBody))
      if (isLink(f) && !waits(f) && !has(String(f.to))) goneIn.set(onto, (goneIn.get(onto) ?? new Set<string>()).add(String(f.id)));
  }
  const goneOf = (list: string | null): ReadonlySet<string> => (list === null ? new Set<string>() : (goneIn.get(list) ?? new Set<string>()));
  const gone = new Set([...goneIn.values()].flatMap((s) => [...s]));
  const fieldGone = (list: string | null, field: unknown): boolean => goneOf(list).has(String(field));
  /* THE DOCUMENT'S OWN FIGURES FIRST, each with its legs over lists not held taken off, since a block tests them by id. */
  const legsKept = (legs: unknown): Body[] => (Array.isArray(legs) ? (legs as unknown[]).filter(isBody).filter((l) => typeof l.register !== 'string' || has(l.register)) : []);
  const figures = new Map<string, Body | null>();
  for (const d of decls) {
    if (typeof d.metric !== 'string' || waits(d)) continue;
    const legs = Array.isArray(d.legs) ? legsKept(d.legs) : null;
    const reads = figureLists(d).every(has) && !whereNames(d.where, goneOf(listIn(d.source))) && (legs === null || legs.length > 0);
    figures.set(d.metric, reads ? (legs === null ? d : { ...d, legs }) : null);
  }
  const figureHeld = (id: string): boolean => {
    if (figures.has(id)) return figures.get(id) !== null;
    const f = catalogue().figures.get(id);
    return f === undefined || (f.lists.every(has) && (f.owners.length === 0 || f.owners.some(has)));
  };
  const knownFigure = (id: string): boolean => figures.has(id) || catalogue().figures.has(id);
  const sourceHeld = (source: unknown): boolean =>
    typeof source !== 'string' ? true : source.startsWith('metric.') ? figureHeld(source.slice('metric.'.length)) : has(listIn(source));
  /** A block as it stands on this record, or `null` when it reads what the record will not hold. */
  const block = (b: Body): Body | null => {
    if (waits(b)) return b;
    const list = listIn(b.source);
    if (!sourceHeld(b.source) || (typeof b.register === 'string' && !has(b.register))) return null;
    if (!figuresIn(b.when).every(figureHeld)) return null;
    if ((['body', 'heading', 'empty'] as const).some((k) => filledIn(b[k]).some((id) => knownFigure(id) && !figureHeld(id)))) return null;
    if (whereNames(b.where, goneOf(list))) return null;
    if (GROUPED_BY_FIRST.has(String(b.kind)) && Array.isArray(b.columns) && fieldGone(list, (b.columns as Body[])[0]?.field)) return null;
    const out: Body = { ...b };
    if (Array.isArray(b.columns))
      out.columns = (b.columns as unknown[]).filter((c) => !isBody(c) || (!fieldGone(list, c.field) && (typeof c.metric !== 'string' || figureHeld(c.metric.split(':')[0]!))));
    for (const k of ['cells', 'series'] as const) {
      if (!Array.isArray(b[k])) continue;
      const kept = (b[k] as unknown[]).filter((c) => !isBody(c) || typeof c.metric !== 'string' || figureHeld(c.metric.split(':')[0]!));
      if (kept.length === 0) return null;
      out[k] = kept;
    }
    if (Array.isArray(b.from)) out.from = legsKept(b.from);
    return JSON.stringify(out) === JSON.stringify(b) ? b : out;
  };
  const page = (d: Body): Body | null => {
    if (waits(d)) return d;
    if (isBody(d.for) && typeof d.for.register === 'string' && !has(d.for.register)) return null;
    const out: Body = { ...d };
    /* A PAGE THAT KEEPS NO LIST SAYS NONE, since the kernel reads `requires: []` as malformed and no key as nothing wanted. */
    if (Array.isArray(d.requires)) {
      const kept = (d.requires as unknown[]).filter((r) => has(listIn(r)));
      if (kept.length > 0) out.requires = kept;
      else delete out.requires;
    }
    if (Array.isArray(d.filters)) {
      const kept = (d.filters as unknown[]).filter((f) => !isBody(f) || !gone.has(String(f.field)));
      if (kept.length > 0) out.filters = kept;
      else delete out.filters;
    }
    if (Array.isArray(d.blocks)) {
      const blocks = (d.blocks as unknown[]).flatMap((b) => (isBody(b) ? (block(b) ?? []) : [b]));
      if (blocks.length < d.blocks.length && blocks.every((b) => isBody(b) && FRAMES.has(String(b.kind)))) return null;
      out.blocks = blocks;
    }
    return out;
  };
  const rule = (d: Body): boolean => {
    const on = isBody(d.on) && isBody(d.on.written) ? d.on.written.register : undefined;
    const creates = (['then', 'steps'] as const).flatMap((k) => (Array.isArray(d[k]) ? (d[k] as unknown[]) : []).flatMap((a) => (isBody(a) && isBody(a.create) ? [a.create.register] : [])));
    return [d.register, on, ...creates].every((l) => typeof l !== 'string' || has(l));
  };
  const feed = (d: Body): boolean => {
    const target = isBody(d.writes) ? d.writes.register : undefined;
    const lists = isBody(target) ? (Array.isArray(target.to) ? (target.to as unknown[]) : []).map((r) => (isBody(r) ? r.register : undefined)) : [target];
    return lists.every((l) => typeof l !== 'string' || has(l));
  };
  const list = (d: Body): Body => {
    const cut = goneOf(d.register as string);
    if (cut.size === 0) return d;
    const out: Body = { ...d, fields: (d.fields as unknown[]).filter((f) => !isBody(f) || !cut.has(String(f.id))) };
    if (Array.isArray(d.mobile)) out.mobile = (d.mobile as unknown[]).filter((f) => !cut.has(String(f)));
    for (const key of ROLE_KEYS) {
      const role = d[key];
      if (!isBody(role) || waits(role)) continue;
      const kept = Object.fromEntries(Object.entries(role).filter(([, field]) => !cut.has(String(field))));
      if (Object.keys(kept).length > 0) out[key] = kept;
      else delete out[key];
    }
    /* A LIST WHOSE ROWS ARE STEPS OF ANOTHER'S says which link names that row (`steps: { of }`); with the link gone its
       rows are a list of their own, and the kernel refuses a `steps:` naming a field the list does not have. */
    if (isBody(d.steps) && cut.has(String(d.steps.of))) delete out.steps;
    if (Array.isArray(d.search)) out.search = (d.search as unknown[]).filter((f) => !cut.has(String(f)));
    if (isBody(d.same)) {
      const same: Body = { ...d.same };
      if (Array.isArray(same.fields)) same.fields = (same.fields as unknown[]).filter((f) => !cut.has(String(f)));
      if (cut.has(String(same.within))) delete same.within;
      out.same = same;
    }
    return out;
  };
  const declarations = decls.flatMap((d): Body[] => {
    if (waits(d)) return [d];
    if (typeof d.register === 'string') return [list(d)];
    if (typeof d.metric === 'string') return figures.get(d.metric) ? [figures.get(d.metric)!] : [];
    if (typeof d.page === 'string') {
      const p = page(d);
      return p ? [p] : [];
    }
    if (typeof d.rule === 'string') return rule(d) ? [d] : [];
    if (typeof d.ingest === 'string') return feed(d) ? [d] : [];
    return [d];
  });
  const out: Body = { ...doc, ...(Array.isArray(doc.declarations) ? { declarations } : {}) };
  if (Array.isArray(doc.seeds))
    out.seeds = (doc.seeds as unknown[]).filter(isBody).flatMap((s) =>
      typeof s.register === 'string' && !has(s.register)
        ? []
        : [goneOf(String(s.register)).size === 0 || !isBody(s.fields) ? s : { ...s, fields: Object.fromEntries(Object.entries(s.fields).filter(([k]) => !fieldGone(String(s.register), k))) }],
    );
  if (isBody(doc.extends)) {
    /* EACH LIST'S LAID FIELDS LESS THE LINKS THAT WENT, and a list left with nothing laid on it goes. */
    const laid = (id: string, ext: unknown): unknown => {
      const cut = goneOf(listIn(id));
      if (cut.size === 0 || !isBody(ext) || !Array.isArray(ext.fields)) return ext;
      const fields = (ext.fields as unknown[]).filter((f) => !isBody(f) || !cut.has(String(f.id)));
      const out: Body = { ...ext, fields };
      if (fields.length === 0) delete out.fields;
      return Object.keys(out).length > 0 ? out : null;
    };
    const kept = Object.fromEntries(
      Object.entries(doc.extends)
        .filter(([id]) => has(listIn(id)))
        .map(([id, ext]) => [id, laid(id, ext)] as const)
        .filter(([, ext]) => ext !== null),
    );
    if (Object.keys(kept).length > 0) out.extends = kept;
    else delete out.extends;
  }
  if (Array.isArray(doc.adds)) {
    const onto = (p: unknown): boolean => {
      const owners = typeof p === 'string' ? catalogue().pages.get(p.replace(/^page\./u, '')) : undefined;
      return owners === undefined || owners.some(has);
    };
    const kept = (doc.adds as unknown[]).flatMap((a) => {
      if (!isBody(a) || !isBody(a.block)) return [a];
      const b = onto(a.page) ? block(a.block) : null;
      return b === null ? [] : [b === a.block ? a : { ...a, block: b }];
    });
    if (kept.length > 0) out.adds = kept;
    else delete out.adds;
  }
  return JSON.stringify(out) === JSON.stringify(doc) ? doc : out;
}

/** The block kinds whose first column is what they group by, so they say nothing once it is gone. */
const GROUPED_BY_FIRST = new Set(['bar', 'split']);

/** The keys a list declares a role with, each part naming the field that plays it (`packages/kernel/src/roles.ts`). */
const ROLE_KEYS = ['meets', 'rates', 'hand', 'org'] as const;

/** The tag the install path puts on every row a pack seeds. */
const EXAMPLE_TAG = 'example';

/** The tag a row formed around what the person said carries, so Clear the examples never offers their plan. */
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
 * Whether a use case gives a module words or targets of its own: a figure the module declares that the use case holds to
 * its own sum, or anything the module says that the use case says otherwise (`spoken`). A module installed before the use
 * case keeps the words it went in with, and this is what says the use case has something to offer it (`/packs`, the
 * plan's "Update for").
 */
export function relabels(u: UseCase, id: string): boolean {
  const doc = firstPartyDocument(id);
  if (!doc) return false;
  const targets = MODULE_TARGETS[u.usecase] ?? {};
  if (((doc.declarations ?? []) as Body[]).some((d) => typeof d.metric === 'string' && Object.hasOwn(targets, d.metric))) return true;
  return JSON.stringify(spoken(doc, wordsFor(u, id))) !== JSON.stringify(doc);
}
