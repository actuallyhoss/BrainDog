/**
 * What a page, a list, a figure, a rule and an arrangement may contain, each as one compact read.
 *
 * THE LINT WAS THE ONLY TEACHER. An agent learned a page's grammar one refusal at a time, and each try was a
 * turn. This is the same grammar said once: every key, its bounds, and one declaration that installs. It is a
 * reference and not a validator: the install's own lint still decides. `test/arrange.test.ts` holds the block kinds here
 * to the list that lint refuses against, and `test/slash-grammars.test.ts` holds the other key lists the same way and
 * installs each example.
 *
 * EVERY DESCRIPTION HANDS SLASH THE GRAMMARS OF WHAT IT MAY BUILD (`describedGrammar`). Its instructions named
 * `grammar/register`, `grammar/metric` and `grammar/rule` while the record served only the page grammar and put none of
 * them in what the model was sent, so a model learned a list's keys from the refusals Decide then showed the owner. The
 * rule grammar here is what a rule may do INSIDE the record, because a description never builds one that reaches out
 * (`REACHES_OUT` in `slash.ts`); an agent reads `braindog:grammar/automations`, which is the MCP package's own text,
 * for every step.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { KINDS, KIND_LINES, REACH_FOR, isKind, kindLine, kindsFor, type Kind } from 'braindog-render';
import { VOICE_KEYS } from '@braindog/declare';
import { AGGREGATIONS, CAPABILITIES, FIELD_TYPES } from '@braindog/kernel';
import * as kernel from '@braindog/kernel';
import * as render from 'braindog-render';
import { designBook, LOOK_B } from 'braindog-render';
import { LOOK_B_CSS } from '@braindog/theme/look-b.ts';
import { SCALE_CSS } from '@braindog/theme/scale.ts';

import { REACHES_OUT } from './slash.ts';
import { starterAddon } from './methods/addons.ts';

/**
 * A registry a package exports, or `undefined` while it does not. THE SOURCES AND THE GLYPH GROUPS ARE READ FROM THE
 * PACKAGES THAT HOLD THEM: the kernel's `SOURCE_MODULES` (`sources/index.ts`) and the renderer's `markGroups`
 * (`glyphs/groups.ts`). Asked by name on the module, so this file builds the day either package says nothing of it
 * and reads the registry itself, with no edit here, from the day it does.
 */
const exported = (ns: object, name: string): unknown => (Object.hasOwn(ns, name) ? (ns as Record<string, unknown>)[name] : undefined);

/** One source as the page grammar says it: the word a block's `source:` writes, and what it reads when that is said. */
export type SourceSaid = { readonly name: string; readonly says?: string };

/**
 * What each registered source reads, in words, by its name, in the registry's order (`SOURCE_MODULES`). A source with
 * nothing to say past its name is `null`. A module that carries its own `says` is read before this table, and a source
 * the registry gains with neither is said by its name alone, so it still reaches every agent the day it is registered.
 */
const SOURCE_SAYS: Readonly<Record<string, string | null>> = {
  'forecast.runway': null,
  activity: null,
  'sessions.live': null,
  'sessions.working': 'the runs working now, a helper folded under the run that started it, most recently heard from first; columns and limit only, no where or order',
  actions: null,
  'governance.open': null,
  'governance.later': 'questions put off, soonest back first, on a queue',
  'governance.decided': 'what was answered, latest first, as rows: question, answer, answer_label, reason, who, at, kind, about, list',
  runs_on: 'the keys, tools, skills and scheduled actions of the project about: names, then those that apply everywhere; on a table or cards, with no order',
  deadlines: 'what falls due across the lists; horizon: days ahead, 14 when it says nothing; where: list is tasks',
  'figures.home': 'the figures pinned to Home, on a stat with no cells',
  signs: "BrainDog's vital signs as rows: sign, name, state, value, said; in the list's order, no order:",
  'handoffs.open': 'the next steps runs left and nobody has taken, newest first, as rows: run, agent, next, left_at, mark; about: one project; no order:',
  'actions.blocking': "one project's scheduled actions that are paused, failing or late, as rows: name, why, since, status, said; about: the project, required; no order:",
  exceptions: 'what went quiet here, the longest quiet first, as rows: subject, since, was, and kind, which is list, door, schedule or stale; no order:',
};

/** Each name with what it reads: the module's own `says` first, then this file's line, then nothing. */
export function sourcesSaid(names: readonly string[], modules?: Readonly<Record<string, unknown>>): SourceSaid[] {
  return names.map((name) => {
    const module = modules !== undefined && Object.hasOwn(modules, name) ? modules[name] : undefined;
    const own = typeof module === 'object' && module !== null ? (module as { says?: unknown }).says : undefined;
    const says = typeof own === 'string' && own.trim() !== '' ? own : Object.hasOwn(SOURCE_SAYS, name) ? SOURCE_SAYS[name] : null;
    return says ? { name, says } : { name };
  });
}

/** The page grammar's `source:` line: the three forms a page writes itself, then every registered source in order. */
export function sourcesLine(sources: readonly SourceSaid[]): string {
  const named = [
    'register.<id>',
    'metric.<id> (or metric.<id>:<parameter> on a bar or a split, such as metric.project-cost:{{name}} on a project page)',
    'block.<n>',
    ...sources.map((s) => (s.says ? `${s.name} (${s.says})` : s.name)),
  ];
  return `${named.slice(0, -1).join(', ')} or ${named.at(-1)!}`;
}

const REGISTERED = exported(kernel, 'SOURCE_MODULES') as Readonly<Record<string, unknown>> | undefined;

/** The sources this build registers, said: the kernel's registry when it is exported, this file's table until then. */
export const SOURCES: readonly SourceSaid[] = sourcesSaid(REGISTERED ? Object.keys(REGISTERED) : Object.keys(SOURCE_SAYS), REGISTERED);

/** The glyph names by group, one line a group: what the group is, then its names, in the registry's order. */
export function glyphLines(groups: Readonly<Record<string, readonly string[]>>, says: Readonly<Record<string, string>> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(groups)
      .filter(([, names]) => names.length > 0)
      .map(([group, names]) => [group, `${says[group] ?? group}: ${names.join(', ')}`]),
  );
}

const MARK_GROUPS = exported(render, 'markGroups') as (() => Readonly<Record<string, readonly string[]>>) | undefined;
const GROUP_SAYS = exported(render, 'GROUP_SAYS') as Readonly<Record<string, string>> | undefined;

/** The names a mark may use, by group, or `undefined` while the renderer does not export them. */
export const GLYPHS: Readonly<Record<string, string>> | undefined =
  typeof MARK_GROUPS === 'function'
    ? {
        use: "a glyph name for a page's icon, a card's mark or {{icon:<glyph>}} in any text; a control, such as x, pencil or a chevron, is never a mark",
        ...glyphLines(MARK_GROUPS(), GROUP_SAYS),
      }
    : undefined;

/**
 * The grammars `arrangement({ grammar })` answers, in the order a refusal names them.
 *
 * `rule` IS HERE BESIDE `register` AND `metric`, because Slash is never told to read a grammar nothing serves, and
 * Slash drafts rules against this one. MCP serves `register` and `metric` as resources and not `rule`, because its own
 * `grammar/automations` already says a rule in full.
 *
 * `ingest` COMES AFTER `proposals`, because a door and a scheduled action were learned from the lint alone, one
 * refusal at a time, and the web's new-action sheet builds the same declaration this says.
 *
 * `kinds` IS LAST, and it is the kinds of block a page draws, each with its line (`KINDS_SHORT`). One kind whole is
 * `kind/<name>`, which is asked by name and so is no entry here: the refusal names it in words.
 */
export const GRAMMARS = ['page', 'register', 'metric', 'rule', 'proposals', 'ingest', 'kinds', 'pack'] as const;

const PAGE = {
  declaration: { id: 'page.<slug>', kind: 'page', body: 'the page body below' },
  body: {
    page: 'the slug, lower-case letters, digits and dashes (required)',
    title: 'text (required)',
    nav: '{section: text of at most 40 bytes, order: 0 to 9999, tabs?: true}; leave it off and the page has no place on the rail. tabs: true draws every page of that section as a strip of tabs over each of them, in nav order',
    layout: '{rail: 3, 4 or 5, sticky?: true}: a main column and a side rail, the rail in twelfths; sticky keeps the rail in view. Leave it off for one column',
    for: "{register: <id>, where?}: one page per row of that list, in the list's steps order or else the order the rows were written; {{field}} in any text is that row's field, and {{spoken}} is its id, such as parts#2",
    icon: GLYPHS ? 'a glyph name, such as board; glyphs below names every one a mark may use, by group' : 'a glyph name, such as board',
    tone: 'good, warn, bad or info',
    requires: '["register.<id>"], 1 to 16: every register a block reads',
    filters: '[{field, control: chips or segmented}], at most 4, each a field of the lists the blocks read: the reader narrows every block over a list with that field to one value',
    blocks: '1 to 24 blocks, drawn in order',
  },
  block: {
    kind: Object.keys(KINDS),
    span: 'width in twelfths, 1 to 12, inside its area',
    area: "main or rail; rail needs the page's layout. Main is where a block sits when it says nothing",
    heading: 'the words over it; on a section, the section itself',
    empty: 'the sentence drawn when it has no rows',
    body: "a note's own prose",
    source: sourcesLine(SOURCES),
    where: 'a filter, such as state is open, or a predicate tree. On a capture, what the new row is preset with: about is parts#2 presets a link',
    register: 'the list a capture adds to, or the list whose one row inputs edits',
    row: "on inputs, the row it edits by its id, such as checks#1; the list's first row when it says nothing",
    about: 'required over runs_on and read nowhere else: the project it reads, by its row, such as things#1, or {{spoken}} on a page with for:',
    columns: '[{field, label?}], 1 to 16; on cards, as: title, figure, fact, trend, ring, who, when, mark, next (the first open step under the card, from the list whose steps: {of, done, order?} names it), reply (a quieter line under the title, such as a second opinion), hue (a whole-number field from 0 to 359, drawn only on the card\'s mark) or picture (a file field the card leads with). A card\'s fact, trend or when may name a figure in place of a field, with {{field}} after a colon filled from the card\'s own row: { metric: project-open:{{name}}, as: fact, label: Open } says that figure on each card, up to three facts with the fields. On a stat or lines over readings, [when, value, name, unit, amount]: the fifth is the reading as money',
    stale: '{field, after, figure?} on cards: a card whose day in field is older than after (such as 7d) reads as out of date; figure: a rolled figure with read: as_of and group_by gives each card its own day',
    over_a_list: {
      calendar: 'columns [title field, day or instant field]; back and ahead are whole months either side of this one, 0 to 12, defaults 2 and 0; at most 500 entries, and no limit',
      link: 'columns [title field, url field, note field?]; a url is https, mailto or a path of this BrainDog',
      gallery: 'columns [caption field, file field]; limit at most 24',
      embed: 'authored entries only, one: cells [url, title?, aspect?]; the url a YouTube, Vimeo, Loom, Figma or Google Maps address, the aspect 16:9 (the default), 4:3, 1:1 or 9:16',
    },
    back: 'on a calendar, whole months before this one; series, stat and lines read it too',
    ahead: 'on a calendar, whole months after this one; a series reads it too',
    panel: "one of actions, reporting, run, seen, job (about the page's row, on a section of a page with for:), or look-editor, slash-model, trust, slash-reads, my-keys, new-action (needs: none, so it stands on any page): the host draws that part under the section's heading",
    short: '{where, label}: on steps, the short view: the rows the sentence keeps, named by a label of at most 24 bytes',
    order: '[{field, dir: asc or desc}], 1 to 3',
    limit: 'rows, 0 to 500',
    cells: '[{metric, label?, note?}], 1 to 6, the figures a stat draws',
    authored: '[{cells: [text], tone?}], rows written out, never beside source',
    target: 'the number a gauge draws against, 0 or more',
    fold: 'true when a section starts shut',
    box: 'true on a section: the blocks after it, up to the next section, drawn on one surface',
    lead: "true on cards: the first card two tracks wide. True on a note: the page's one opening sentence, its {{metric}} figures said in words. True on a queue: its first question drawn whole, with what accepting it does",
    says: 'A lead note may say: [{ when, body, tone }], the first that holds; the last has no when.',
    first: 'on steps, the first 1 to 50 open rows, with the rest behind a count: the short view of a path',
    range: 'true on progress: each row a band from low to high with what was spent marked on it, columns [label, spent, low, high]',
    tiles: "true on a queue: one tile per question, with its recommended option's shows ({swatch: [#rrggbb]}, {figure: text} or {file: {row, field}}). A question's body.about names what it is about, and where: about is <name> reads it",
    who: 'true on heat: a line a person, a dot in each of the twelve weeks they were in touch, columns [day, who]',
    when: "{metric, gt|gte|lt|lte|is|not: <n>}: drawn only while that figure meets the test. {metric, empty: true}: drawn only while the figure has no value, in no currency, and nothing else holds then; empty: false once it has one. Empty is the leaf's whole test. {all: [...]} or {any: [...]} of two or more tests: all or any, two levels deep. Or {holds: [people]}: the block is there only while this BrainDog holds those lists; the add-on's plan decides.",
  },
  paths: '{{<metric>}} in any text is that figure, {{<metric>.first}} the first row it counts and {{<metric>.first_<field>}} a field of that row, {{<list>.count}} how many rows the list has, {{<list>.<value>}} how many are in that value of its state, {{<list>#<n>.<field>}} a field of one row, {{<list>#<n>.<field>.<part>}} one step into that field (a field of the row a link points at, a money\'s amount or currency, or a list field\'s count, and no further), {{<module>.<figure>}} a figure an installed module or add-on declares, read over all of this BrainDog on any page (by its id, its id after <module>-, or its one total of a field of that name), and {{icon:<glyph>}} a glyph. Two words are read in one order: a list and count or a state it holds, then a figure and change, first, names, more or since, then a module and its figure, then on a page about a row a field of it and a part, then a measure and a period; anything else answers nothing. On a page about a row, {{<field>}} is that row\'s field when its list declares one, {{<field>.count}} how many a list field holds and {{<field>.<part>}} one step into it, and {{<measure>.<period>}} is the newest reading about that row named the period and the measure (revenue.monthly reads Monthly revenue), money in the currency it was written in, with {{<measure>.<period>.since}} the day it was read; a document is never read',
  ...(GLYPHS ? { glyphs: GLYPHS } : {}),
  example: {
    id: 'page.reading',
    kind: 'page',
    body: {
      page: 'reading',
      title: 'Reading',
      nav: { section: 'Library', order: 20 },
      requires: ['register.tasks'],
      blocks: [
        { kind: 'note', span: 12, body: 'What is left to read this week.' },
        {
          kind: 'table',
          span: 12,
          heading: 'Open',
          source: 'register.tasks',
          where: 'state is open',
          columns: [{ field: 'what' }],
          limit: 20,
          empty: 'Nothing is left to read.',
        },
      ],
    },
  },
  to_change_one: 'Read arrangement with page for its declaration, change the body, and propose body_kind change with {"to": that declaration}.',
  earlier_versions: 'Read pageVersions with page for what a page was before: each version newest first, with its declaration, when it was applied and by whom.',
  which_kind: 'grammar kinds says what each kind is for, its cells and its forms, and what to reach for; grammar kind/<name> says one kind whole',
};

/**
 * A list's grammar. `body` and `rare` together are every key the lint reads on a register, and `field` every key it reads
 * on a field: the test installs a list with a key that is not one and holds both halves to the `allowed` its refusal
 * names, so a key the kernel learns is a red test here until it is said.
 */
const REGISTER = {
  declaration: { id: 'register.<id>', kind: 'register', body: 'the list body below' },
  body: {
    id: 'the list id: lower-case letters, digits and single underscores, starting with a letter, at most 32 (required). register is another spelling of it',
    register: 'the same id as id; write one of the two',
    name: 'what a person calls the list, such as Parts',
    one: 'one row of it in words, such as part',
    title: 'the field that names a row (required)',
    fields: '1 to 64 fields, each as field below (required)',
    search: 'the fields search reads: text, document, enum, url, email or a list of text',
    state: 'the enum field that says where a row is, such as open or done',
    done: 'the state values that mean finished, drawn ticked',
    finished: 'a day field filled when a row enters a done state; needs state',
    steps: '{of: <ref field>, done: <bool field>, order?: <number, day or text field>}: each row is a step of the row its of field points at, done when its done field is true',
    icon: 'a glyph name for the rail',
    holds: 'one line saying what the list holds',
    seq_prefix: "# or a capital letter and up to three capitals or digits: the start of a row's spoken id, such as P for P12. D, SG and S are BrainDog's own",
    mobile: 'the few fields the phone view keeps, such as [what, amount, due]',
    table: 'the columns its table opens on, in order, 1 to 9: a field, or {field, or?, label?} where or is the field, or up to three in turn, read when the first holds nothing, such as [on, {field: payee, or: [counterparty_text, what], label: Payee}, amount]. Left out, the table is worked out from the title, mobile and state',
    delete: 'refuse_while_referenced: a row another row points at is not deleted',
    owner_only: 'true: somebody who may add to all of this BrainDog does not add here unless the list is named to them',
    personal: 'true: only the owner reads or changes it. No grant, share, link, child key or See as reaches it, even one that names it',
  },
  rare: {
    pack: 'the pack that ships the list; a list Slash builds leaves it off',
    identity: '{mark: <enum field>, accent: <int field>}: each row carries a mark and one accent hue',
    series: 'true for a list of dated facts, such as a rate each day, rather than of things with names',
    scopes: "{repos?, folders?}: on the one list whose rows are projects, the list-of-text fields naming each one's places",
    rates: 'on the one list holding the rates a money figure converts by, the field that plays each part',
    meets: 'on the one list meet writes people into, the field that plays each part',
    org: 'on the one list meet writes organisations into, the field that plays each part: name, keys, kind, domain, merged_into',
    pairs: 'transfer detection: the fields BrainDog matches two legs of one move by',
    hand: '{person?: <ref field>, agent?: <text field>, taken?: <state value>}: who holds a row, a person by a ref field and an agent by the text field it signs with, and the state a row moves to when an agent takes it. Either may be left out, but not both',
    once: 'the fields an add-on plants and never changes after, by id: [name]. Its own update leaves each as the row holds it; a person still edits them',
    order: '{field, dir?: asc|desc}: the order a read with none of its own comes back in, by a number, day, time or text field of this list',
    same: "{fields: [<text field>], within?: <scope or ref field>, fold: text|exact, keep?: oldest|latest|sealed}: what makes two rows one thing, such as two skills of one name in one project. text reads 'Ponytail (copy)' and 'ponytail.md' as 'ponytail'; exact reads them as written",
    role: "one of skills, tools, learnings, keys-index, profiles, carry: the part the list plays for this BrainDog's agents, so a list under any id is read as that part. A list playing profiles or carry is personal",
    fade: '{field: <day field>, after: <days, such as 90d>}: the day a row fades by and how long after it, as learnings fade unconfirmed',
    kept_by: "automations: BrainDog's own automations write its rows, as the nightly money snapshots, so it is offered no page of its own",
  },
  field: {
    id: 'lower-case letters, digits and single underscores; never id, seq, register, created_at, updated_at, deleted_at, version, spoken or title, and never starting with _ (required)',
    type: `one of ${FIELD_TYPES.join(', ')} (required)`,
    of: 'on a list, the type of each item, such as text',
    values: 'on an enum, its values',
    labels: 'on an enum, the words a person reads for some of its values: {owed_to_me: Money in}',
    to: 'on a ref, the list it points at',
    required: 'true: a row must have it',
    required_when: '{field, is}: required while another field of the row holds that value',
    default: 'the value a new row starts with',
    unique: 'true: no two live rows hold the same value',
    immutable: 'true: set once, when the row is made',
    index: 'true: kept in an index, for a list filtered by it often',
    min: 'the least: UTF-8 bytes on text and documents, the value on numbers',
    max: 'the most, the same way; it lowers the type\'s own ceiling and never raises it',
    label: 'what a person reads for the field, when it is not the id with _ as a space',
    search: 'true: the search box reads it',
    deadline: 'true on a day field: the day the row is due',
    remind: 'on a day or instant field, offsets to be told before it, such as ["-1d"]; hours only on an instant',
    repeat: '{freq, interval?, count?, until?, workday?: previous|next|none, bymonthday?: [15, -1], byday?: [TU, TH]} on a day or instant field: the day comes again',
    transitions: "on the state field, for each value the values it may move to: {open: {to: [done], requires?: [<fields filled first>], by?: decide}}",
    by: 'decide: once the row is made, only an accepted proposal changes it',
    redact: 'true: the audit log keeps no value of it',
    retired: 'true: kept and no longer drawn or written',
    scope: '{} on the one ref to the project list: the project a row belongs to',
    currency_from: "on a money field, '<ref field>.<money field>': an amount sent with no currency takes the one the linked row holds there",
    currency_fixed: "true on a money field: once a row holds a currency it keeps it, and only the amount changes",
    qualifies: 'the field that makes an amount readable',
    unit: 'on a duration, how it is said',
    derive: '{sum: [a, b, ...]}, {diff: [a, b]}, {product: [a, b]}, {ratio: [a, b]}, {band: {of, steps: [{upto, is}], else?}}, {via: {ref, field}} or {normalise: {of, how: lower, trim or digits}}: worked out from other fields of the row at read and never stored or written; a field it reads may be worked out too, never in a ring',
    derived: "BrainDog's own; never write it",
    hidden_from_agents: "true: the field's own bookkeeping, such as a mark or a hue; an agent's short answers leave it out and format full keeps it",
    parts_of: "on a json field, a money field of the same list: the row split into parts ({category, amount, note}) adding up to it",
    when: '{holds: [people]}: the field is there only while this BrainDog holds those lists or roles (rates, meets, org). Never on a required field',
  },
  example: {
    id: 'register.parts',
    kind: 'register',
    body: {
      id: 'parts',
      name: 'Parts',
      one: 'part',
      title: 'what',
      search: ['what'],
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'state', type: 'enum', values: ['open', 'done'] },
        { id: 'due', type: 'day', deadline: true },
      ],
      state: 'state',
      done: ['done'],
    },
  },
};

/**
 * A figure's grammar. The kernel has no unknown-key check on a metric body, so there is no `allowed` to hold these keys
 * to; what the test holds is the aggregations, read from the kernel's own `AGGREGATIONS`, and the example, which installs
 * over the register example above.
 */
const METRIC = {
  declaration: { id: 'metric.<id>', kind: 'metric', body: 'the figure body below' },
  body: {
    metric: 'the id: a lower-case letter, then lower-case letters, digits, - and _, at most 32 (required)',
    name: 'what a person calls it',
    source: 'register.<id> (required)',
    where: 'the rows it reads, as a list filter says it, such as state is open',
    value: `one aggregation, {<aggregation>: <field>}, the aggregation one of ${AGGREGATIONS.join(', ')}; count counts id. Or {ratio: {of: {...}, per: {...}}} or {diff: {of, per}}, both halves over the same rows (required)`,
    format: 'money, int, decimal, pct, days, duration or day (required)',
    target: "{gte: n} or {lte: n}, in the figure's own units, minor units for money: a number with no target is decoration (required)",
    window: 'how far back it compares, such as 30d, 4w or 3m (required)',
    compare: 'previous, year_ago or none',
    group_by: 'one field; created_at or updated_at groups by when rows were written',
    bucket: 'with a day group_by: day, week, month, quarter or year',
    lookups: '{<table>: {<value>: <factor>}}: at most 8 tables a value may multiply by',
    home: 'its place among the Home figures, 1 to 9',
    sellable: 'true: a forecast may offer it',
  },
  never: 'within, which the reader works out from where',
  example: {
    id: 'metric.parts-open',
    kind: 'metric',
    body: {
      metric: 'parts-open',
      name: 'Parts still open',
      source: 'register.parts',
      where: 'state is open',
      value: { count: 'id' },
      format: 'int',
      target: { lte: 5 },
      window: '30d',
      compare: 'previous',
    },
  },
};

/**
 * What a trigger and a step of a rule do, by the name `CAPABILITIES` (`kernel/src/capabilities.ts`) keeps them under.
 *
 * THE NAMES ARE THE TABLE'S AND THE WORDS ARE HERE. `RULE` below lists only the rows the table holds, so a name it drops
 * leaves the grammar with it, and a name it gains is a red test (`slash-grammars.test.ts`) until it is said here.
 */
const TRIGGER_SAYS: Readonly<Record<string, string>> = {
  written: '{"written":{"register":"<id>","op":["create","update","delete"],"fields":["<field>"]}}: a row was written; op and fields are optional',
  arrival: '{"arrival":{"ingest":"<id>"}}: something arrived at a door this BrainDog already has',
  every: '{"every":"1d","at":"08:00"}, {"every":"1w","at":"08:00","day":"mon"} or {"every":"1mo","day":"last","at":"09:00"}; never more often than every 15m',
  metric: '{"metric":{"id":"<metric>","crosses":{"lte":0}}}: a figure moved to the other side of a line; crosses is target, {"lte":n} or {"gte":n}',
  decided: '{"decided":{"about":"rule.<name>","option":"<answer>"}}: a question on Decide was decided',
  manual: '{"manual":true}: a person presses Run now',
};

const STEP_SAYS: Readonly<Record<string, string>> = {
  if: '{"if":"<condition>","then":[...],"else":[...]}',
  set_var: '{"set_var":{"name":"<answer>","to":"<text>"}}',
  wait: '{"wait":"2h"}: m, h, d or w',
  ask_person: '{"ask_person":{"question":"<text>","options":["yes","no"],"as":"<answer>","wait":"2d","to":"<member id>"}}: opens on Decide; to is optional',
  meet: '{"meet":{"name":"<text>","email":"<text>","where":"<text>"}}: meets one person into People; one of name, email or handle, and where',
  tag: '{"tag":"x"}',
  untag: '{"untag":"x"}',
  set: '{"set":{"field":"f","to":"v"}}',
  move: '{"move":"<state>"}',
  link: '{"link":{"field":"f","to":{"register":"r","by":"f","value":"v"}}}',
  note: '{"note":"text"}',
  notify: '{"notify":{"say":"text"}}',
  schedule: '{"schedule":{"in":"14d","note":"text"}}',
  create: '{"create":{"register":"r","bound":10,"fields":{}}}',
  suggest: '{"suggest":{"question":"q","options":["a","b"]}}',
  stop: '{"stop":true}',
};

/** Every step the table holds that a description may build: none that reaches out, and no one key of a step. */
const inside = (name: string): boolean => !name.includes('.') && !Object.hasOwn(REACHES_OUT, name);

const RULE = {
  declaration: { id: 'rule.<name>', kind: 'rule', body: 'the keys below' },
  body: {
    rule: 'the name, as in the id: lower-case letters, digits, - and _ (required)',
    name: 'the words its card shows',
    on: 'exactly one trigger, below. Leave it off for a rule that runs inside a write to register',
    register: 'with no on:, the list whose writes run it, inside the write, with then:',
    when: 'a condition as a list filter says it, read on the row the trigger names',
    steps: 'the steps below, in order (required, or then:)',
    then: 'the older flat list of steps, run inside the write; never beside steps',
    once_per: '["entry"] or field ids: what makes one firing. Required when a write trigger notifies, creates or suggests',
    enabled: 'false stops it starting',
    project: 'a project id: only rows of that project start it',
    limits: '{"runs_per_day","steps_per_run"}, whole numbers that only lower BrainDog’s ceilings',
    priority: 'a number; lower runs first among rules inside one write',
  },
  triggers: Object.fromEntries(CAPABILITIES.filter((c) => c.of === 'trigger').map((c) => [c.name, TRIGGER_SAYS[c.name] ?? c.name])),
  steps: Object.fromEntries(CAPABILITIES.filter((c) => c.of === 'step' && inside(c.name)).map((c) => [c.name, STEP_SAYS[c.name] ?? c.name])),
  on_the_row: 'tag, untag, set, move, link, note and schedule act on a row, so a rule started by a clock, a figure or a button cannot use them',
  context: 'any text in a step may read {{trigger.row.<field>}}, {{trigger.kind}} and {{vars.<answer>}}',
  from_a_description: `never ${Object.keys(REACHES_OUT).join(', ')}: each reaches beyond BrainDog, and is asked for on its own`,
  example: {
    id: 'rule.monday-look',
    kind: 'rule',
    body: {
      rule: 'monday-look',
      name: 'Monday look at what is open',
      on: { every: '1w', at: '08:00', day: 'mon' },
      steps: [{ notify: { say: 'Look at what is still open before the week starts.' } }],
    },
  },
};

const PROPOSALS = {
  change: '{"to":{"id":"page.<slug>","kind":"page","body":{...}}}: one declaration, new or changed, such as a page, a list, a figure or a rule; or {"to":{"declarations":[...]}} for several that belong together',
  pack: '{"install":"<id from offer or updates>"}, {"enable":"<id>"} or {"disable":"<id>"}; install may carry "doc", a pack document the catalogue lacks, and never one for a pack it offers; {"file":<a .usecase.json document>} installs a shared use case and the modules it names. A pack on at an older version is updated',
  settings: '{"pack":"<id>","values":{"<setting>":<value or null for its default>}}, or {"voice":{"<key>":"<line>"}} for the use case on',
  arrange: {
    shape: '{"why":[...],"usecase"?,"alongside"?:[<usecase>],"packs"?:{"install"?,"enable"?,"disable"?},"pages"?:[<page>],"settings"?:[<settings>],"voice"?:{...},"rows"?:[<entry or patch>],"declarations"?:[<declaration>],"choices"?:[<choice>]}',
    why: 'one to 12 reasons, each a sentence or {"text","at":"tasks#4"} citing an entry',
    usecase: 'a use case id from offer, installed with the modules it builds on',
    alongside: 'use case ids from offer installed beside the one speaking, which keeps its voice and Home whichever way the ids sort',
    settings: 'settings sent for an add-on this installs fill that install; a later change to a setting a declaration reads plans that add-on again on the same yes; a value may be a list of text',
    rows: 'new entries {"register","fields","links"?:{"<field>":<place of an earlier entry>}} or patches {"register","at":"<list>#<n>","version","patch"}, checked as a rowset is; one whose version moved refuses the whole question',
    declarations: '{"id":"<kind>.<name>","kind","body"} each, checked as a change is; a page goes under pages; each call out is listed on the question by host and how often',
    choices: '{"id","question","suggested":"<option id>","options":[{"id","label","does"}]} each, two to six options, left to the owner',
    parts: 'BrainDog files each install, add-on turned on or off, add-on settings, entries by list, page, declaration and choice as a part with an id; the owner may accept some parts and the rest stay open as the same question; needs and calls are worked out by the record, each naming its parts, and anything sent under needs, calls, approve or parts is not read',
    cause: 'one open arrangement per cause: a second proposal with the same cause adds its parts to the open one',
    limits: 'at most 12 of each and 60 entries; at most 3 arrangements wait at once',
  },
  voice_keys: VOICE_KEYS,
  answered_by: 'the owner, in Decide. Nothing changes until they accept, and a pack is planned again then.',
};

/**
 * A door and a scheduled action: an ingest declaration, which is how anything reaches the record from outside it.
 *
 * WHAT THE KERNEL'S LINT HOLDS, SAID ONCE (`kernel/src/declare.ts`, `ingestBody` and `actionFault`). It is a reference,
 * like the rest of this file, and the install still decides. A call and a poll take four ways to send the key: header,
 * query, basic or, absent, a bearer.
 */
const INGEST = {
  declaration: { id: 'ingest.<name>', kind: 'ingest', body: 'the keys below' },
  body: {
    ingest: 'the name, as in the id: a lower-case letter, then lower-case letters, digits and _ (required)',
    description: 'what a person calls it; the doors list shows it',
    channel:
      'webhook (a door: an address others post to), call (sends to an address on a clock), poll (reads one address on a clock), pull (reads a service a page at a time); email, paste and api arrive with no address of their own (required)',
    writes: '{register: <id>}: the list a row lands in; with none, what arrives waits in the inbox. Required on a poll',
    map: '{<field>: {path, type}, {value} or {arrived: true}}: one entry per field. path reads the JSON that arrived, such as data.total or items[0].id; type is the field type it is read as. A poll may give a list of maps, one row each',
    match: 'on a pattern, which arrivals it takes, as a list filter says it over what arrived',
    dedupe: '1 to 4 field ids that make an arrival the same as a row already written',
    on_conflict: 'skip, update, new or review; never review on a pull',
    skip: '[{when, reason}]: arrivals left out, each with the reason somebody will come looking for',
    project: 'the project it runs for, by its id; absent for all of this BrainDog',
  },
  door: {
    channel: 'webhook',
    verify: "{kind: path}: the address carries a secret the owner makes on the Ingest settings screen and is shown once. It is never written in a declaration",
    door: 'on a second webhook pattern: the name of the door whose address it also reads. That door has verify and a match',
  },
  action: {
    url: 'call and poll: the whole https:// address, its host written out with nothing computed; {since} and {until} may stand in the path or query',
    grant: 'the label of the keychain key it sends. Required on a call; a poll of a public address names none',
    every: '15m or longer, or the provider floor; not on a call only a rule runs',
    trigger: 'call only: schedule (the default), rule or both',
    sends: 'call only, with trigger rule or both: the fields of the rule row it sends, each register.field, never a secret or a file',
    body: 'call only: one JSON object, at most 8 KB; {since}, {until} and, from a rule, {row.<field>} for a field it sends',
    auth: 'call and poll: {kind: header, name: <header>}, {kind: query, name: <parameter>} or {kind: basic}; absent is a bearer. The key is still named by grant, never here',
    at: 'HH:MM, the time of day each run belongs to, with every in whole days (1d, 2d, 1w)',
    tz: 'the zone at is read in, such as Africa/Cairo; absent is this BrainDog’s zone',
    fetch:
      'pull only: {base: an https:// host alone, path, auth: {kind: bearer, basic, header or query_param, grant, name?}, schedule: {every} (the same interval as every, or left out), read: {rows: <path>}}; the map reads each row',
  },
  never: 'a token, a key or a password: a key is named by its keychain label and nothing else',
  examples: [
    {
      id: 'ingest.orders_in',
      kind: 'ingest',
      body: {
        ingest: 'orders_in',
        description: 'Orders from the shop',
        channel: 'webhook',
        verify: { kind: 'path' },
      },
    },
    {
      id: 'ingest.watch_visitors',
      kind: 'ingest',
      body: {
        ingest: 'watch_visitors',
        description: 'Visitors today',
        channel: 'poll',
        url: 'https://example.com/stats.json',
        every: '1h',
        map: { name: { value: 'Visitors today' }, value: { path: 'visitors', type: 'decimal' }, at: { arrived: true } },
        writes: { register: 'datapoints' },
      },
    },
  ],
};

/**
 * The kinds of block a page draws, the short form: every kind with its one line, and the ten lines of what to reach for.
 *
 * GENERATED FROM THE RENDERER'S TABLE, never written twice: a kind is a key of `KINDS` and its line is `kindLine`'s
 * (`braindog-render`'s `kind-lines.ts`). An agent reads it in a turn, so it is held at or under 8 KB
 * (`test/grammar-kinds.test.ts`), and whatever does not fit a line is in the long form, `kind/<name>`.
 */
export const KINDS_SHORT = {
  reach_for: REACH_FOR,
  kinds: Object.fromEntries((Object.keys(KINDS) as Kind[]).map((kind) => [kind, kindLine(kind)])) as Readonly<Record<Kind, string>>,
  one_kind: 'grammar kind/<name> says one kind whole, such as kind/spec',
};

const WRITTEN: Readonly<Partial<Record<'verbatim' | 'header' | 'checkbox' | 'ordered' | 'indented' | 'prose' | 'hole', string>>> = {
  verbatim: 'each line is kept exactly as written, never split on |',
  header: 'the first line names the columns, and every line after it has as many',
  checkbox: 'an entry may start [ ] or [x], to show it open or done',
  ordered: 'drawn in order, numbered',
  indented: 'two spaces a level',
  prose: 'written as prose in body, not as cells',
  hole: 'a last cell of hole marks an entry whose amount is not known yet: it keeps its words and stays out of the scale',
};

/** One kind whole, the long form: everything the short line says, and how it is written, how many it takes and how narrow it may be. */
export function kindWhole(kind: Kind): Record<string, unknown> {
  const spec = KINDS[kind];
  const line = KIND_LINES[kind];
  const onAList = (PAGE.block.over_a_list as Readonly<Record<string, string>>)[kind];
  const written = (Object.keys(WRITTEN) as (keyof typeof WRITTEN)[]).filter((flag) => spec[flag] === true).map((flag) => WRITTEN[flag]!);
  return {
    kind,
    line: kindLine(kind),
    for: line.for,
    cells: line.cells,
    ...(spec.optional ? { optional: `the last ${spec.optional === 1 ? 'cell' : `${spec.optional} cells`} may be left off` } : {}),
    forms: spec.forms ?? [],
    ...(line.reads ? { reads: line.reads } : {}),
    on_a_page_only: spec.pageOnly === true,
    ...(onAList ? { over_a_list: onAList } : {}),
    ...(written.length > 0 ? { written } : {}),
    tone: spec.tone ? 'a last cell of good, warn, bad or info marks the entry with a glyph and a word' : 'takes no tone',
    ...(spec.rows !== undefined ? { at_most: `${spec.rows} ${spec.rows === 1 ? 'entry' : 'entries'}` } : {}),
    narrowest: `${spec.minSpan} twelfths; the size control refuses narrower`,
    group: spec.purpose,
  };
}

/**
 * An add-on file whole: the SDK an agent reads before it writes one for a feature this BrainDog lacks.
 *
 * THE OTHER GRAMMARS SAY ONE DECLARATION EACH, AND NOTHING SAID THE FILE AROUND THEM. An agent could read how a list or
 * a page is written and still not know that an add-on is a manifest and a list of declarations, that it must name every
 * place of the person's it reads, that a Today card is a `widgets` entry and never a placement, or that the way in is a
 * question the person answers. This says the file, what each part asks the person to approve, the loop through `act`,
 * and one that installs, which `addonNew` answers too. Held to what `normalise` and the Kennel take
 * (`MANIFEST_KEYS`), and a reference like the rest: the record's check decides.
 */
const PACK = {
  what: 'An add-on is one JSON file: a manifest, then declarations. It is data the record checks and the person approves, never code BrainDog runs as itself.',
  loop: [
    'act addons {"q":"<words>"}: is there one already? act addon {"id"} reads it, with what it asks of yours.',
    'act addonNew {"id","title","fields"?}: a file that installs, to change.',
    'act addonCheck {"doc"}: every refusal with its fix, or what installing it adds and asks the person to approve. Repeat until ready.',
    'act installPack {"doc"}: asks the person on Decide. Nothing installs until they say yes, unless they let agents act without asking.',
    'To change it later: act addon {"id","file":true}, edit, raise version, check, installPack again. The person approves the update the same way.',
    'From GitHub: act installPack {"source":{"kind":"git","ref":"owner/repo@v1.0.0:x.pack.json"}}. It is pinned to the commit the tag points at, and a newer semver tag on that repo is asked about by itself.',
  ],
  manifest: {
    pack: 'the id, lower-case letters, digits and dashes; not one the store already holds',
    version: 'three numbers. A change is a new version: major when a list, page or field type goes; minor when something is added; patch otherwise',
    title: 'what the person calls it',
    summary: 'one line on what it does for them',
    changes: 'what this version changed, at most 500 characters',
    author: 'who made it',
    license: 'an SPDX id such as MIT',
    icon: 'one icon name from the app set, optional',
    requires: '{format: 1, primitives: 1, packs: {"<add-on>": ">=1.0.0 <2.0.0"}}: the add-ons it needs first',
    uses: '["register.<id>", "metric.<id>", "page.<slug>"]: every place of the person\'s it reads or changes that it does not declare itself. It reaches nothing it does not name, and the person sees each one before saying yes',
    config: '{<key>: {type: text|enum|bool|money|day|duration|number|list|secret, label, default?, values?}}: settings on its page; {{config:<key>}} reads one, a script reads ctx.config. A secret is a key label, never a value',
    seeds: '[{register, fields}]: example rows, at most 8 a list',
    extends: '{"register.<theirs>": {fields: [optional fields], values: {<enum field>: [new values]}}}: lays on another list without taking anything',
    adds: 'blocks laid on another add-on\'s page',
    widgets: 'Today cards: [{id, title, says, group, for, block, sizes, size, needs: {lists}, example}]. Installing adds them to the card sheet; the person, or an agent through propose body_kind widget, puts one on Today',
    skills: '[{name, trigger, what?, body}]: steps the person\'s agents follow, at most 8',
    migrate: '{from: <major>, says, reads: [lists], writes: [lists], source}: on a major version, a script that moves the entries the older major kept into this shape. It is tried first in the sandbox, then its writes land in the update; one refused write and the update does not happen. Own lists only, no egress, no keys. The plan shows says as "Moves your entries"',
    declarations: 'the parts it adds, each written with its kind as its first key',
  },
  declarations: {
    register: 'a list: grammar register',
    page: 'a page with blocks: grammar page, and grammar kinds for every block. A drawn block is your own HTML and script in a sandboxed frame that reads the rows it is given and reaches no network',
    metric: 'a figure: grammar metric',
    rule: 'an automation, with triggers and steps: braindog:grammar/automations',
    script: 'JavaScript run in a sandbox on a clock, at a door or from a rule, with egress hosts and keys named: braindog:grammar/script',
    ingest: 'a door others post to, or a call or poll out on a clock: grammar ingest',
    digest: 'a message on a schedule, in the app, by mail or push',
    theme: 'colours, the only kind a colour may be written in',
  },
  asks: {
    'its own lists and pages': 'shown as what it adds',
    uses: 'each place of yours it reads or changes, by name',
    'a host it calls': 'a CALLS OUT line the person approves on its own; a key goes only to the host its keychain entry opens',
    'a script or automation': 'what runs while nobody is looking, with the script source shown whole',
    'a door': 'an address others can post to',
    skills: 'what it teaches the person\'s agents',
  },
  never: [
    'a key, token or password in the file: name a keychain label',
    'a colour outside a theme',
    'a host computed at run time, or plain http',
    'anything of the person\'s it does not name in uses',
    'reading another BrainDog, the keychain\'s values, or giving the BrainDog away',
  ],
  example: starterAddon({ id: 'watch-list', title: 'Watch list', summary: 'Films and shows to watch, and a card on Today with what is next.', fields: [{ id: 'kind', type: 'enum', values: ['film', 'show'] }] }),
};

const SERVED: Readonly<Record<(typeof GRAMMARS)[number], unknown>> = {
  page: PAGE,
  register: REGISTER,
  metric: METRIC,
  rule: RULE,
  proposals: PROPOSALS,
  ingest: INGEST,
  kinds: KINDS_SHORT,
  pack: PACK,
};

export function grammarOf(name: string): Result<unknown> {
  /* THE DESIGN BOOK (`braindog:design`) is read through here as the other grammars are, but is no grammar to install by. */
  if (name === 'design') return ok(designBook({ look: LOOK_B_CSS, scale: SCALE_CSS }));
  if ((GRAMMARS as readonly string[]).includes(name)) return ok(SERVED[name as (typeof GRAMMARS)[number]]);
  if (name.startsWith('kind/')) {
    const kind = name.slice('kind/'.length);
    if (isKind(kind)) return ok({ ...(kindWhole(kind) as object), becomes: kindsFor(kind, []) });
    return no('ENUM_VALUE_UNKNOWN', `There is no kind of block called ${kind}. Read grammar kinds for every kind and its line.`, {
      at: 'grammar',
      allowed: Object.keys(KINDS).map((k) => `kind/${k}`),
    });
  }
  return no(
    'ENUM_VALUE_UNKNOWN',
    `There is no grammar called ${name}. Ask for ${GRAMMARS.slice(0, -1).join(', ')} or ${GRAMMARS.at(-1)!}, or kind/<name> for one kind whole.`,
    { at: 'grammar', allowed: GRAMMARS },
  );
}

/**
 * The grammars a description is drafted in, handed to Slash's model beside what the owner typed (`SlashModelInput.grammar`).
 *
 * THE KINDS A DESCRIPTION MAY BUILD (`DESCRIBED_BUILDS` in `slash.ts`), and not `proposals`, because from a
 * description only a `change` is filed. They are the same objects `arrangement({ grammar })` answers, so the model and an
 * agent read one text.
 */
export const describedGrammar = (): { page: unknown; register: unknown; metric: unknown; rule: unknown; ingest: unknown; design: readonly string[] } => ({
  /* LOOK B (`loop/DESIGN-SYSTEM.md`): how a page it builds should look, the same lines `braindog:design` opens on. */
  design: LOOK_B,
  page: PAGE,
  register: REGISTER,
  metric: METRIC,
  rule: RULE,
  ingest: INGEST,
});
