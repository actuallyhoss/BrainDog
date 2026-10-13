/**
 * Editing one block in place: what the editor sheet reads, the words it says, and the patch it hands the arrangement write.
 *
 * PURE, AND THEREFORE NODE-LOADABLE, for the reason `arrange.ts` is split from `arrange.svelte.ts`: the sheet
 * (`lib/page/BlockEditor.svelte`) is runes and markup, and the part a bug would live in, which keys changed and what the
 * record is sent for them, is here where a test can hold it.
 *
 * A PATCH, NOT A BLOCK. The editor reads the block the record STORES (`sourceOf`), never the answer drawn on screen: the
 * answer carries its rows, its verdict on `when:` and, on a page made for each row of a list, that row's name filled into
 * every filter. Sending back a block rebuilt from any of those would declare one moment's reading. So the sheet says only
 * which keys it changed, and `withPatch` (`page-write.ts`) lays them over the stored block inside the one arrangement
 * write, where an edit and a move are one thing to put back.
 *
 * THE FORM WORDS ARE THE KERNEL'S TABLE (`packages/kernel/src/block-keys.ts` `KEY_KINDS`), copied for the kinds the
 * editor offers a control for: a key offered on a kind that does not read it would install as a refusal.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import type { Counted, QueryField } from '../query/tree.ts';
import { installedKinds, type InstalledKind } from './kinds.ts';
import type { Patch } from './page-write.ts';
import type { BlockBody } from './pages-live.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * The editor's words. Kept here rather than in `copy/pages.ts`, as `page-write.ts` keeps its
 * receipts (a module's own `words` object).
 */
export const blockWords = {
  edit: 'Edit',
  editLabel: (kind: string) => `Edit this block: ${kind}`,
  title: (name: string) => `Edit ${name}`,
  everyPage: (list: string) => `This arranges every ${list} page`,
  everyPageEdit: (list: string) => `Saving changes this block on every ${list} page.`,
  arrangedEvery: (list: string) => `Every ${list} page rearranged.`,
  heading: 'Heading',
  headingHelp: 'The name drawn above the block. Empty draws none.',
  shows: 'What it shows',
  showsHelp: 'A list this page reads, or a figure.',
  figure: 'A figure',
  shownList: (list: string) => `Rows of ${list}`,
  filter: 'Which rows',
  filterKept: 'This filter names the row each page is made for, so it is kept as written. Change it in How this is built.',
  filterLoading: 'Reading the fields of this list.',
  filterNone: 'This list could not be read, so its filter is kept as it is.',
  columns: 'Columns',
  columnsHelp: 'What each row shows, left to right.',
  field: 'Field',
  label: 'Label',
  role: 'On the card',
  rolePlain: 'Not placed',
  addColumn: 'Add a column',
  removeColumn: (n: number) => `Remove column ${n}`,
  form: 'How it is drawn',
  first: 'How many to show first',
  firstHelp: 'A whole number from 1 to 50. Empty shows them all.',
  firstBad: 'Write a whole number from 1 to 50, or leave it empty.',
  short: 'A shorter view',
  shortWhere: 'The rows it keeps, as a sentence',
  shortLabel: 'What its switch says',
  shortHelp: 'Both, or neither.',
  when: 'Show it only when',
  whenHelp:
    'A sentence about a figure, such as owed > 0, or owed has nothing while it has no value yet. Say lasts beyond for money that never runs out, and join two with and. Leave it blank to show it always.',
  whenKept: 'This block is shown by a rule the editor cannot draw, so it is kept as written.',
  whenNothing: 'Only when it has nothing',
  whenBad: 'Name a figure, then > 0, < 10, = 3, has nothing or lasts beyond. Join two with and. Leave it blank to show it always.',
  sort: 'Sort by',
  sortNone: 'None',
  sortUp: 'Lowest first',
  sortDown: 'Highest first',
  sortDir: 'Which way',
  sortHelp: 'Lowest first starts from the earliest date, the smallest figure and A.',
  sortKept: 'This block sorts in a way the editor cannot draw, so it is kept as written. Change it in How this is built.',
  sortUnread: 'This list could not be read, so its sort is kept as it is.',
  sortThen: ', then ',
  sortSaidAs: (field: string, up: boolean) => `${field}, ${up ? 'lowest' : 'highest'} first`,
  empty: 'When nothing matches',
  emptyHelp: 'The sentence drawn when the filter admits no row.',
  width: 'Width',
  area: 'Column',
  areaMain: 'Main',
  areaRail: 'Side rail',
  save: 'Save the block',
  cancel: 'Cancel',
  reading: 'Reading this block.',
  saved: (name: string) => `${name} changed.`,
  added: 'Added blocks are kept with the arrangement and saved with it.',
  /* THE FOUR KINDS `copy.kindNames` DOES NOT NAME YET, so the picker and the bar say a name rather than an id. The shared
     table wins wherever it names one. */
  kindNames: {
    calendar: 'Calendar',
    link: 'Links',
    gallery: 'Gallery',
    embed: 'Video or map',
  } as Record<string, string>,
  kinds: {
    calendar: 'the days things fall on, a month at a time',
    link: 'places to go, each with a note',
    gallery: 'pictures and files, each with a caption',
    embed: 'one video, design or map, played on the page',
  } as Record<string, string>,
  flags: {
    lead: { stat: 'Draw the first figure large', cards: 'Draw the first card larger', note: 'Open with the first sentence larger' },
    range: { progress: 'Draw each row as a band from low to high' },
    tiles: { queue: 'Draw the questions as tiles' },
    who: { heat: 'Draw a line for each person, a dot a week' },
    box: { section: 'Put the blocks after it on one surface' },
    fold: { section: 'Start folded shut' },
  } as Record<Flag, Record<string, string>>,
  roles: {
    title: 'Title',
    figure: 'Figure',
    fact: 'Fact',
    trend: 'Trend',
    ring: 'Ring',
    who: 'Who',
    when: 'When',
    mark: 'Mark',
    next: 'Next step',
    reply: 'Second line',
    hue: 'Colour',
    picture: 'Picture',
    scope: 'Where it applies',
  } as Record<string, string>,
} as const;

/* ── which form words a kind reads ───────────────────────────────────────── */

/** The yes-or-no form words (`declare.ts` refuses any value but a boolean for these). */
export type Flag = 'lead' | 'range' | 'tiles' | 'who' | 'box' | 'fold';

/** `KEY_KINDS`' rows for the words the editor draws a control for. */
const READS: Readonly<Record<Flag | 'first' | 'short', readonly string[]>> = {
  lead: ['stat', 'cards', 'note'],
  range: ['progress'],
  tiles: ['queue'],
  who: ['heat'],
  box: ['section'],
  fold: ['section'],
  first: ['feed', 'agents', 'steps'],
  short: ['steps'],
};

const FLAGS: readonly Flag[] = ['lead', 'range', 'tiles', 'who', 'box', 'fold'];

/** The form words `kind` reads, which are the only ones its sheet offers. */
export function formOf(kind: string): { flags: Flag[]; first: boolean; short: boolean } {
  return {
    flags: FLAGS.filter((f) => READS[f].includes(kind)),
    first: READS.first.includes(kind),
    short: READS.short.includes(kind),
  };
}

/**
 * The roles a column may take. ON A CARD, EACH PART OF THE CARD (`declare.ts` `CARD_ROLES`); on any other kind only
 * `scope`, which draws where the row applies. A role offered where the kind has none would install as a refusal.
 */
const CARD_ROLES = ['title', 'figure', 'fact', 'trend', 'ring', 'who', 'when', 'mark', 'next', 'reply', 'hue', 'picture'] as const;
export const rolesFor = (kind: string): readonly string[] => (kind === 'cards' ? [...CARD_ROLES, 'scope'] : ['scope']);

/* ── the draft the sheet edits ───────────────────────────────────────────── */

/** One column as the sheet holds it. `rest` is every key the sheet draws no control for, kept as it was. */
export type DraftColumn = { field: string; label: string; as: string; rest: Record<string, unknown> };

/**
 * The block as the sheet edits it: text where a person types, and the stored value where the sheet only carries it.
 *
 * `when` IS `null` WHEN THE STORED ONE IS NOT A SENTENCE, and the sheet then shows it as kept rather than offering a box
 * that would replace a rule it cannot draw.
 */
export type Draft = {
  heading: string;
  source: string | null;
  columns: DraftColumn[];
  flags: Partial<Record<Flag, boolean>>;
  first: string;
  shortWhere: string;
  shortLabel: string;
  when: string | null;
  empty: string;
  /** The field the rows are sorted by, or `''` for the order the list keeps. */
  sortField: string;
  sortDir: SortDir;
  /** The stored order is one the sheet cannot draw (several fields, or not a list of terms), so it goes back untouched. */
  sortKept: boolean;
};

/** Which way a block's rows are sorted: the kernel's own words (`declare.ts` refuses any other). */
export type SortDir = 'asc' | 'desc';

/**
 * The one sort the sheet draws, from a stored `order`: `[{ field, dir }]` with one term, or `null` for anything else.
 * A TERM WITH NO `dir` RUNS HIGHEST FIRST, as the kernel and the sample both read it (`o.dir === 'asc' ? 'ASC' : 'DESC'`
 * in `@braindog/kernel`, `sortRows` in `api.ts`), so the sheet shows the way the block is really sorted.
 */
function oneSort(order: unknown): { field: string; dir: SortDir } | null {
  if (!Array.isArray(order) || order.length !== 1) return null;
  const term: unknown = order[0];
  if (!isObject(term) || typeof term.field !== 'string' || term.field === '') return null;
  if (term.dir !== undefined && term.dir !== 'asc' && term.dir !== 'desc') return null;
  return { field: term.field, dir: term.dir === 'asc' ? 'asc' : 'desc' };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The columns a stored block declares, in the sheet's shape. */
function columnsOf(block: BlockBody): DraftColumn[] {
  const listed = Array.isArray(block.columns) ? (block.columns as unknown[]) : [];
  return listed.filter(isObject).map((c) => {
    const { field, label, as, ...rest } = c;
    return { field: text(field), label: text(label), as: text(as), rest };
  });
}

/** A stored order the sheet keeps as written, said in words: each field in turn and which way, no `dir` running down. */
export function sortSaid(order: unknown): string {
  const terms = Array.isArray(order) ? (order as unknown[]).filter(isObject) : [];
  return terms.map((t) => blockWords.sortSaidAs(text(t.field).replace(/_/g, ' '), t.dir === 'asc')).join(blockWords.sortThen);
}

export function draftOf(block: BlockBody): Draft {
  const short = isObject(block.short) ? block.short : null;
  const sort = oneSort(block.order);
  return {
    heading: text(block.heading),
    source: typeof block.source === 'string' ? block.source : null,
    columns: columnsOf(block),
    flags: Object.fromEntries(FLAGS.map((f) => [f, block[f] === true])),
    first: typeof block.first === 'number' ? String(block.first) : '',
    shortWhere: text(short?.where),
    shortLabel: text(short?.label),
    when: whenSaid(block.when),
    empty: text(block.empty),
    sortField: sort?.field ?? '',
    sortDir: sort?.dir ?? 'asc',
    sortKept: block.order !== undefined && sort === null,
  };
}

/* ── when: a sentence in the sheet, a leaf in the record ─────────────────── */

/**
 * The kernel's comparisons and the signs the sheet writes them in. `drawnWhen` (`packages/kernel/src/pages.ts`) reads
 * these six, and `empty` beside none of them (`declare.ts` refuses the two together).
 */
const SIGNS: readonly (readonly [string, string])[] = [
  ['gte', '>='],
  ['lte', '<='],
  ['not', '!='],
  ['gt', '>'],
  ['lt', '<'],
  ['is', '='],
];
const FIGURE = /^[a-z][a-z0-9_-]{0,31}(?::.+?)?$/u;
const NUMBER = /^-?\d+(?:\.\d+)?$/u;
/* THE WORDS FOR A FIGURE WITH NO VALUE, the first of each the one the sheet prints. */
const NOTHING = ['has nothing', 'is empty', 'has no value'];
const SOMETHING = ['has a value', 'is not empty', 'is set'];
/* THE WORDS FOR A WALK THAT NEVER WENT UNDER (`beyond:`, `pages.ts` `leafHolds`), the first of each the one printed.
   "Does not last beyond" is every other reading, a figure that is no walk among them, so it is not said as "runs out". */
const BEYOND = ['lasts beyond', 'never runs out', 'is beyond'];
const WITHIN = ['does not last beyond', 'is not beyond'];
/** The tests that are a leaf's whole test, each with its key, its value and its words. */
const WHOLE = [
  ['empty', true, NOTHING],
  ['empty', false, SOMETHING],
  ['beyond', true, BEYOND],
  ['beyond', false, WITHIN],
] as const;
/* WHAT JOINS THE TESTS OF AN `all:`, every one of which must hold. */
const AND = / and /giu;

/**
 * One typed test as the kernel's leaf: `owed > 0` is `{ metric: 'owed', gt: 0 }`, `cash-now has nothing` is
 * `{ metric: 'cash-now', empty: true }`, `cash-runway lasts beyond` is `{ metric: 'cash-runway', beyond: true }`.
 * `null` for words it cannot read. `t` is trimmed, with single spaces.
 */
function leafOf(t: string): Record<string, unknown> | null {
  const lower = t.toLowerCase();
  for (const [key, value, words] of WHOLE)
    for (const w of words)
      if (lower.endsWith(` ${w}`)) {
        const metric = t.slice(0, -w.length - 1).trim();
        return FIGURE.test(metric) ? { metric, [key]: value } : null;
      }
  for (const [op, sign] of SIGNS) {
    const at = t.indexOf(sign);
    if (at <= 0) continue;
    const metric = t.slice(0, at).trim();
    const n = t.slice(at + sign.length).trim();
    if (!FIGURE.test(metric) || !NUMBER.test(n)) return null;
    return { metric, [op]: Number(n) };
  }
  return null;
}

/**
 * Several typed tests joined by `and`, as the leaves of the kernel's `all:`, or `null` unless every one of them reads.
 *
 * A NAME MAY HOLD THE WORD ITSELF (`project-owed:Salt and Pepper > 0`), so each `and` is tried as the join in turn and
 * the first that leaves a whole test on its left and whole tests on its right is the one meant.
 */
function leavesOf(t: string): Record<string, unknown>[] | null {
  for (const join of t.matchAll(AND)) {
    const head = leafOf(t.slice(0, join.index));
    if (head === null) continue;
    const rest = t.slice(join.index + join[0].length);
    const tail = leavesOf(rest) ?? (leafOf(rest) === null ? null : [leafOf(rest)!]);
    if (tail !== null) return [head, ...tail];
  }
  return null;
}

/**
 * A typed `when` as the kernel writes it: one test is its leaf, and two or more joined by `and` are
 * `{ all: [leaf, leaf] }`, which draws only while every one holds (`pages.ts` `drawnWhen`). `undefined` for an empty box
 * (no condition) and `null` for words it cannot read.
 */
export function whenOf(said: string): Record<string, unknown> | null | undefined {
  const t = said.trim().replace(/\s+/gu, ' ');
  if (t === '') return undefined;
  const all = leavesOf(t);
  return all !== null ? { all } : leafOf(t);
}

/** Whether the typed `when` is one the record would take: empty, or a sentence `whenOf` reads. */
export const whenFits = (said: string): boolean => whenOf(said) !== null;

/**
 * A stored `when` as the sheet's sentence, `''` for none, or `null` when the sheet cannot say it and so keeps it.
 *
 * KEPT UNLESS IT READS BACK AS ITSELF: a leaf the sentence would turn into another leaf (a second comparison, a key the
 * sheet has no words for) is shown as kept, never offered in a box that would change it on save.
 */
export function whenSaid(when: unknown): string | null {
  if (when === undefined) return '';
  if (typeof when === 'string') return when;
  if (!isObject(when)) return null;
  const tests = Array.isArray(when.all) ? when.all.map(leafSaid) : [leafSaid(when)];
  if (tests.includes(null)) return null;
  const said = tests.join(' and ');
  return same(whenOf(said), when) ? said : null;
}

/** One stored leaf in the sheet's words, by the first test it holds, or `null` when it holds none the sheet can say. */
function leafSaid(leaf: unknown): string | null {
  if (!isObject(leaf) || typeof leaf.metric !== 'string') return null;
  for (const [key, value, words] of WHOLE) if (leaf[key] === value) return `${leaf.metric} ${words[0]}`;
  for (const [op, sign] of SIGNS) if (typeof leaf[op] === 'number') return `${leaf.metric} ${sign} ${String(leaf[op])}`;
  return null;
}

/**
 * The sentence "only when it has nothing" makes of what is typed: the figure kept, its test made `has nothing`.
 * `null` when no figure is named yet, or several tests are, so the choice has no one figure to say it about.
 */
export function whenNothing(said: string): string | null {
  const leaf = whenOf(said);
  if (isObject(leaf) && Array.isArray(leaf.all)) return null;
  const metric = isObject(leaf) && typeof leaf.metric === 'string' ? leaf.metric : FIGURE.test(said.trim()) ? said.trim() : null;
  return metric === null ? null : `${metric} ${NOTHING[0]}`;
}

/** A typed count, read as decimal digits only (`Number('0x10')` is 16). `null` for anything else. */
export function countOf(said: string): number | null {
  const t = said.trim();
  if (!/^\d{1,3}$/u.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return n >= 1 && n <= 50 ? n : null;
}

/** Whether the typed `first` is one the record would take: empty, or a count it allows. */
export const firstFits = (said: string): boolean => said.trim() === '' || countOf(said) !== null;

/** The column list the record is sent: field, then the label and role only when they say something. */
function declaredColumns(columns: readonly DraftColumn[]): Record<string, unknown>[] {
  return columns
    .filter((c) => c.field !== '')
    .map((c) => ({ ...c.rest, field: c.field, ...(c.label.trim() ? { label: c.label.trim() } : {}), ...(c.as ? { as: c.as } : {}) }));
}

/**
 * Whether two stored values say the same thing, whatever order their keys were written in. A column rebuilt by the sheet
 * puts its keys in the sheet's order, and a block whose columns were never touched must not be patched for that.
 */
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : isObject(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));

/**
 * What changed between the stored block and the draft, as a patch: each key set, and `null` for each taken off.
 *
 * `where` IS PASSED IN ONLY WHEN THE FILTER WAS TOUCHED. The builder hands back a tree, and a stored sentence read into
 * the builder and never changed must go back as the sentence it was, not as the same filter respelled.
 */
export function patchOf(before: BlockBody, draft: Draft, where?: { value: unknown }): Patch {
  const out: Record<string, unknown> = {};
  const put = (key: string, next: unknown) => {
    const had = before[key];
    if (next === undefined) {
      if (had !== undefined) out[key] = null;
      return;
    }
    if (!same(had, next)) out[key] = next;
  };

  put('heading', draft.heading.trim() || undefined);
  put('source', draft.source ?? undefined);
  if (where) put('where', where.value);

  const columns = declaredColumns(draft.columns);
  put('columns', columns.length ? columns : undefined);

  const form = formOf(before.kind);
  for (const flag of form.flags) put(flag, draft.flags[flag] === true ? true : undefined);
  if (form.first) put('first', countOf(draft.first) ?? undefined);
  if (form.short) {
    const w = draft.shortWhere.trim();
    const l = draft.shortLabel.trim();
    put('short', w && l ? { where: w, label: l } : undefined);
  }

  /* THE SENTENCE GOES BACK AS THE KERNEL'S LEAF, which is the only `when:` it installs (`declare.ts`). One it cannot
     read goes as typed, so the record's refusal names it rather than the sheet dropping it without a word. */
  if (draft.when !== null) {
    const leaf = whenOf(draft.when);
    put('when', leaf === null ? draft.when.trim() : leaf);
  }
  /* THE SORT IS WRITTEN AS THE KERNEL'S `order`, one term, and only when it says something new: a stored term with no
     `dir` already runs highest first, so the same field the same way goes back as it was written. */
  if (!draft.sortKept) {
    const had = oneSort(before.order);
    const unmoved = had !== null && had.field === draft.sortField && had.dir === draft.sortDir;
    put('order', draft.sortField === '' ? undefined : unmoved ? before.order : [{ field: draft.sortField, dir: draft.sortDir }]);
  }
  /* A BLOCK OVER A LIST KEEPS ITS EMPTY SENTENCE (06 §1.1 makes it mandatory there), so a cleared box leaves the stored
     one in place rather than taking off a key the record would then refuse the page without. */
  const empty = draft.empty.trim();
  if (empty || draft.source === null) put('empty', empty || undefined);
  return out;
}

/* ── what the sheet reads from the record ────────────────────────────────── */

/** A list's fields in the builder's shape (`QueryField`), from its `schema` answer, leaving out any not shaped like one. */
export function fieldsOf(answer: unknown): QueryField[] {
  const listed = isObject(answer) && Array.isArray(answer.fields) ? (answer.fields as unknown[]) : [];
  const out: QueryField[] = [];
  for (const f of listed) {
    if (!isObject(f) || typeof f.id !== 'string' || typeof f.type !== 'string') continue;
    const values = Array.isArray(f.values) ? f.values.filter((v): v is string => typeof v === 'string') : undefined;
    const labels = isObject(f.labels)
      ? Object.fromEntries(Object.entries(f.labels).filter((e): e is [string, string] => typeof e[1] === 'string'))
      : undefined;
    out.push({
      id: f.id,
      type: f.type,
      ...(typeof f.label === 'string' ? { label: f.label } : {}),
      ...(typeof f.of === 'string' ? { of: f.of } : {}),
      ...(typeof f.to === 'string' ? { to: f.to } : {}),
      ...(values ? { values } : {}),
      ...(labels ? { labels } : {}),
      ...(f.retired === true ? { retired: true } : {}),
    });
  }
  return out;
}

/** One list as the sheet needs it: its fields, and the block kinds the record's packs declare, both from one `schema`. */
export type ListRead = { fields: QueryField[]; kinds: Record<string, InstalledKind> };

/**
 * A list's `schema`, read once per tab and list, or `null` when the record will not say.
 *
 * THE KINDS COME WITH IT because the record answers its installed block kinds on the same call
 * (`schema`), and the add-block picker, which already names the list it binds to, lists them beside its own.
 */
const read = new Map<string, Promise<ListRead | null>>();
export function readList(base: string, register: string, io?: Fetch): Promise<ListRead | null> {
  const key = `${base} ${register}`;
  let held = read.get(key);
  if (!held) {
    held = createClient({ base, ...(io ? { fetch: io } : {}) })
      .schema(register)
      .then((out) => (out.ok ? { fields: fieldsOf(out.value), kinds: installedKinds(isObject(out.value) ? out.value : null) } : null))
      .catch(() => null);
    /* A REFUSAL IS NOT KEPT, so a record that could not answer once is asked again the next time the sheet opens. */
    void held.then((got) => got === null && read.delete(key));
    read.set(key, held);
  }
  return held;
}

/**
 * The record's count for a filter over a list: how many rows it admits, of how many the list holds.
 *
 * ASKED THROUGH `previewPage`, which draws a body nobody installed and writes nothing, as the page itself would draw it:
 * two one-row tables over the list, one filtered and one not, so both numbers are the record's `matched` and neither is
 * counted here. A filter the record cannot read comes back with a refusal on its block, and the count is then `null`,
 * which the builder draws as no count rather than as a wrong one.
 */
export async function countRows(base: string, register: string, where: unknown, io?: Fetch): Promise<Counted | null> {
  const source = `register.${register}`;
  const body = {
    page: 'count',
    title: 'Count',
    requires: [source],
    blocks: [
      { kind: 'table', source, ...(where === undefined ? {} : { where }), limit: 1 },
      { kind: 'table', source, limit: 1 },
    ],
  };
  try {
    const out = await createClient({ base, ...(io ? { fetch: io } : {}) }).call<{ blocks?: unknown }>('previewPage', { body });
    if (!out.ok) return null;
    const blocks = Array.isArray(out.value.blocks) ? (out.value.blocks as unknown[]) : [];
    const [some, all] = blocks;
    if (!isObject(some) || !isObject(all)) return null;
    if (Array.isArray(some.refusals) && some.refusals.length > 0) return null;
    const n = some.matched;
    const of = all.matched;
    return typeof n === 'number' && typeof of === 'number' ? { n, of } : null;
  } catch {
    return null;
  }
}
