/**
 * What a use case installs, made for one record on one day (`loop/research-spark.md` S10 and S13).
 *
 * NOTHING IS INSTALLED AS AN EXAMPLE (`loop/finish/modules.md` C11). A document built here carries no example
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

import { AGENTS_PACK, agentsPackDocument } from '../packs/agents.ts';
import { FIRST_PARTY, firstPartyDocument, firstPartyManifest, type FirstPartyId } from '../packs/first-party.ts';
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
 * The example rows each use case gives the first-party modules it names, drawn only by a preview or a test (C11). A use
 * case not listed gives none. PERSONAL IS NOT LISTED SINCE ITS 2.0.0: a person's month in pounds was the wrong picture
 * of anybody's record, and a person's Home is drawn from what they write.
 */
const MODULE_EXAMPLES: Readonly<Record<string, readonly Body[]>> = { business: BUSINESS_EXAMPLES, founder: FOUNDER_EXAMPLES, team: TEAM_EXAMPLES };

/**
 * The targets each use case gives the modules' figures, by metric. A figure not listed keeps the module's own. IN NO
 * CURRENCY: a bound here is a count or a number of days, because a use case cannot know the currency of the record it
 * lands on (`loop/finish/modules.md` C1), and a sum of money a person means is a setting they type.
 */
const MODULE_TARGETS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = { personal: PERSONAL_TARGETS };

/** One use case's words for the modules: by module id, then by the module's own words or a figure's metric id. */
type ModuleWords = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * THE PLAIN WORDS, which every use case but a business's starts from (`loop/finish/modules.md` MOD-23). Money and a
 * project's page speak a business's money as they ship: "Owed to you", "Late to you", "Most owed by you". Nobody but
 * a founder or a small business is owed money by a client on an invoice, so a person, a student, a team or somebody
 * starting a project reads what is due to them and what they have to pay.
 */
const PLAIN_NAMES: ModuleWords = {
  'money-core': {
    'Owed to you, 30 days': 'Due to you, 30 days',
    'Owed by you, 30 days': 'To pay, 30 days',
    'Owed to you': 'Due to you',
    'Owed by you': 'Still to pay',
    'Late to you': 'Late coming in',
    'Money you are owed has gone past its date: {{late-in}} in all.': 'Money due to you has gone past its date: {{late-in}} in all.',
    'Most owed by you in 30 days': 'Most to pay in 30 days',
    'Most owed to you at once': 'Most due to you at once',
    'Most owed by you at once': 'Most to pay at once',
  },
  portfolio: {
    'Owed to you': 'Due to you',
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
   * case. Left out, the module carries none (`loop/finish/modules.md` C11), and the first run never passes it.
   */
  examples?: boolean;
};

/**
 * A first-party module as this use case installs it, with no rows in it. `null` for an id that is not one.
 *
 * NOTHING IS WRITTEN AS AN EXAMPLE (`loop/DIRECTION.md` §26, `loop/finish/modules.md` C11). A module used to carry the
 * use case's example rows, and with no use case the sample studio's (Kiln, Halden), so the first run's "Start from a
 * list" planted a type foundry's clients in a student's record. A document asked for with `examples: true` still
 * carries them, for a preview to draw or a test to hold a page against; nothing that writes to a record asks for one.
 */
export function moduleDocument(u: UseCase | null, id: string, options: ModuleOptions): Body | null {
  /* THE AGENTS PACK IS A MODULE TOO, so a sentence that mentions agents adds it rather than saying it is not here. It
     carries no example rows of anybody's. */
  if (id === AGENTS_PACK.manifest.id) return agentsPackDocument();
  const bare = firstPartyDocument(id);
  if (!bare) return null;
  const mine = new Set(((bare.declarations ?? []) as Body[]).flatMap((d) => (typeof d.register === 'string' ? [d.register] : [])));
  /* `undefined` IS THE MODULE'S OWN ROWS to `firstPartyDocument`, so it is asked for only when examples are. */
  const seeds =
    options.examples !== true ? [] : u === null ? undefined : (MODULE_EXAMPLES[u.usecase] ?? []).filter((s) => mine.has(String(s.register)));
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
 * The pack a use case carries, with its voice as settings, or `null`. Its only rows are the plan formed from what the
 * person said (`formedFor`), each tagged `formed`, with its days counted from today.
 *
 * THE USE CASE'S OWN EXAMPLES ARE NOT CARRIED (`loop/finish/modules.md` C11): a Personal record arrived holding 56 rows,
 * every one in pounds, which its owner then had to find and clear (`loop/finish/modules.md` §2.5, counted from
 * `personal.ts`). `examples: true` carries them for a preview or a test,
 * and a formed plan still wins over them, because it is what the person asked for.
 */
export function carriedDocument(u: UseCase, today: string, said?: string | null, options: { examples?: boolean } = {}): Body | null {
  const formed = formedFor(u, said);
  if (!formed) {
    const doc = useCaseDocument(u.usecase, today);
    return doc && options.examples !== true ? withoutRows(doc) : doc;
  }
  const doc = useCaseDocument(u.usecase, '1970-01-01');
  if (!doc) return null;
  return dated({ ...doc, seeds: formedSeeds(formed.seeds) }, today);
}

/**
 * THE SAME PLAN, AS ROWS TO WRITE ONCE THE PACK IS IN: the rows formed from what the person said, tagged as the install
 * tags them, with the links to make once they are in. A sentence that forms nothing plants nothing, because the use
 * case's own examples are never written (`carriedDocument`).
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
