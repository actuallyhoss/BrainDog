/**
 * THE ENGINE'S LOOK FOR A PAGE: what a page leads with, the order its blocks come in, what it hides and
 * the one next action, laid over the page's declaration as it is read and never written into it.
 *
 * A LOOK IS A DECLARATION, `look.<page>` (`declare.ts` checks it), and it is one of three things by `by`:
 * - `owner`: the person's own. It always wins, and what it pins is never hidden or moved by anything else.
 * - `slash`: the model's, written overnight by the record under the headline budget.
 * - `rule`: what `composeLook` below answers when none is stored, from the page as read and nothing else.
 *
 * THE RULES ARE THE FALLBACK AND THEY ARE CALM. A page where nothing happened reads as declared: only a block holding
 * something late, something waiting on the reader or something changed since they last looked moves, and it moves
 * inside its own group, under its own heading. Late beats needs-you beats changed beats figures. A block that drew
 * nothing is hidden, and the page's single most pressing row becomes its next action.
 *
 * WHAT A LOOK MAY DO IS SMALL ON PURPOSE (`applyLook`): it reorders blocks the page already has, hides some, and moves
 * one to the top. It never adds a block, never hides a pinned one, one that was refused (the person needs to see what
 * broke) or the lead, and never names a row the page did not hand it. New blocks come only through a page's own
 * declaration, which the model writes as a proposal and the person accepts.
 *
 * AND THE PERSON'S OWN LOOK SAYS HOW WIDE A BLOCK IS AND WHICH COLUMN IT SITS IN (`span`, `area`), so a page he resized
 * stays the page an add-on wrote and keeps taking its updates. Only his: a rule's or Slash's look places nothing.
 *
 * PURE. Nothing here reads the record: `readPage` hands in the page as read, today, the reader's mark and the lists'
 * declarations, so the same page reads the same look on every host.
 *
 * AND THE PAGE IS THE ONE ITS READER IS SHOWN. A host that says who is reading (`PageDeps.reader`) has each block held
 * before the look is composed, so a block a member may not see weighs nothing here: it never leads, never moves, is
 * never hidden and names no next step, and the order, the hide and the basis she is sent are the ones a page with that
 * block empty would answer. Nothing she reads off the look says whether it holds anything.
 */

import { BLOCK_KEY, blockKeyOf, shortHash } from './block-keys.ts';
import type { Refusal } from '@braindog/ports';

import type { Json } from './coerce.ts';
import { exponentOf } from './ingest.ts';
import type { BlockResult, ListShape, PageRow } from './pages.ts';

/** Who arranged a look. */
export const LOOK_BY = ['rule', 'slash', 'owner'] as const;
export type LookBy = (typeof LOOK_BY)[number];

/** The page's one next action: a row of the page by its handle, and what it says, in words a person reads. */
export type LookNext = { row: string; text: string };

/** A `look.<page>` declaration's body, and what a read answers as the page's `look`. */
export type LookBody = {
  /** The page's declaration id without `page.`, which a template's pages share. */
  look: string;
  /** What it was composed from, so a writer knows when the facts under it moved. */
  basis: string;
  lead?: string;
  order?: string[];
  hide?: string[];
  headline?: string;
  next?: LookNext;
  pinned?: string[];
  /**
   * Which long lists are drawn in groups, each under its own heading: a block's key, and the field of its list the
   * groups are the values of. Laid only on a block whose kind draws groups and that names none itself (`applyLook`).
   */
  group?: Record<string, string>;
  /** How wide each block is drawn, by its key, in twelfths: one of `LOOK_SPANS`. Only on a look by `owner`. */
  span?: Record<string, number>;
  /** Which of the page's two columns each block sits in, by its key. Only on a look by `owner`. */
  area?: Record<string, 'main' | 'rail'>;
  by: LookBy;
};

/** The keys a look may carry. */
export const LOOK_KEYS: ReadonlySet<string> = new Set(['look', 'basis', 'lead', 'order', 'hide', 'headline', 'next', 'pinned', 'group', 'span', 'area', 'by']);

/**
 * The widths a look may give a block, in twelfths: the board's five (`apps/web` `arrange.ts` `STEPS`), so a width a
 * person picked is one the board draws and never one it snaps to a neighbour.
 */
export const LOOK_SPANS: readonly number[] = [12, 8, 6, 4, 3];
const SPANS: ReadonlySet<number> = new Set(LOOK_SPANS);

/** The columns a look may put a block in. */
export const LOOK_AREAS: readonly ('main' | 'rail')[] = ['main', 'rail'];
const isArea = (v: unknown): v is 'main' | 'rail' => v === 'main' || v === 'rail';

/**
 * The kinds whose `group` is a field of the list they are over, so a look may name one for them. A kind is added here
 * when `pages.ts` reads that key for it the way it does for cards, which is also where it reads it (`rowGrouping`): a
 * link, a choice or the list's state. Lanes are drawn by their own field and are not grouped again.
 */
export const GROUPED_BY_FIELD: ReadonlySet<string> = new Set(['cards', 'table']);

/** The most blocks one look groups. */
export const LOOK_GROUPS_MOST = 12;

/** The rules group a list only when it shows more of its rows than this. */
export const GROUP_ROWS_OVER = 12;

/**
 * How many values of a field the rows shown may hold for it to group them. One is a heading over everything, and past
 * eight most headings stand over a single row.
 */
export const GROUP_VALUES_LEAST = 2;
export const GROUP_VALUES_MOST = 8;

/** The most keys one of its lists names: a page's own 24 blocks and the 64 other packs may add. */
export const LOOK_KEYS_MOST = 88;

/** How long a look's headline, its next action's words and its basis may be, in bytes. */
export const LOOK_HEADLINE_BYTES = 200;
export const LOOK_NEXT_BYTES = 120;
export const LOOK_BASIS_BYTES = 128;

/** How pressing a block is. Late beats needs-you beats changed since the reader looked beats figures. */
export const RANK = { late: 4, needs: 3, changed: 2, figures: 1, none: 0 } as const;

/** The kinds that are a figure or a chart, which lead a group over a plain list once something in it moves. */
const FIGURE_KINDS: ReadonlySet<string> = new Set(['stat', 'lines', 'series', 'forecast', 'ring', 'gauge', 'bar', 'split', 'progress', 'heat', 'chips']);

/** The kinds that read no rows, so having none says nothing: words, the line a row is typed into, a form, a heading. */
const ROWLESS: ReadonlySet<string> = new Set(['note', 'capture', 'inputs', 'section', 'forecast']);

/** The kinds a rule never moves: they are where the author put them because of what is around them. */
const STAYS: ReadonlySet<string> = new Set(['note', 'capture', 'inputs', 'section']);

/** The computed sources whose rows are a list the reader could be shown, so none read is a block with nothing in it. */
const LISTED: ReadonlySet<string> = new Set([
  'deadlines', 'activity', 'governance.open', 'governance.later', 'governance.decided', 'sessions.live', 'sessions.working', 'actions', 'runs_on', 'signs', 'handoffs.open',
]);

const DAY_MS = 86_400_000;

/**
 * THE PAGES THAT MAY LEAD WITH THE QUESTIONS: Today, which is a record's Home (`home`, or `home-<use case>` as
 * `homePageOf` in `@braindog/seed` names it), and Decide. Every page is read by the same rule whichever record it is on.
 *
 * BY NAME, BECAUSE A PAGE'S DECLARATION SAYS NOTHING ELSE ABOUT IT. Its body carries `page`, `title`, `nav`, `icon`,
 * `requires`, `blocks`, `for`, `layout`, `tone`, `filters` and where it came from (`PAGE_KEYS`), and none of them says
 * "this is the Home": a use case's Home is known as one only by being named `home-<use case>`, which is how the record
 * picks the page Home draws too. So a page somebody named `home-repairs` reads as a Home here, as it would there. What
 * the name does settle is held to: only `home` takes a use case after it, since nothing names a `today-` or a `decide-`.
 */
const ASKS_FIRST = /^(?:home(?:-[a-z0-9-]+)?|today|decide)$/u;

/** Whether a block is the questions waiting on the reader, which every pack draws as a queue over `governance.open`. */
const isQueue = (b: BlockResult): boolean => b.kind === 'queue' || b.source === 'governance.open';

/**
 * WHETHER THE QUESTIONS MAY LEAD THIS PAGE. On Today and Decide they are what the page is for. Everywhere else the page
 * is about something of its own (Money's cash ahead, a project's work), and a queue the engine moved to the top put
 * "Waiting on you" over the figures the person opened the page to read: so there the engine never leads with a queue
 * nor moves one, and it stays where the page's author put it. A page drawn of nothing but questions is Decide whatever it
 * is called. Only the engine is held to this: the person's own look leads with whatever he picked.
 */
export function questionsLead(page: string, blocks: readonly BlockResult[]): boolean {
  if (ASKS_FIRST.test(page)) return true;
  const read = blocks.filter((b) => areaOf(b) === 'main' && !STAYS.has(b.kind) && b.drawn !== false);
  return read.length > 0 && read.every(isQueue);
}

type Area = 'main' | 'rail';
const areaOf = (b: { area?: unknown }): Area => (b.area === 'rail' ? 'rail' : 'main');
const keyOf = (b: BlockResult): string => b.key ?? blockKeyOf(b);

/**
 * THE QUEUES THE ENGINE LEAVES WHERE THEY ARE ON THIS PAGE, by key: every one, on a page where `questionsLead` says no,
 * and none where it says yes. One answer for the three that are held to it: the rules above, a stored look as it is
 * laid (`applyLook`), and Slash's overnight writer (`packages/record` `compose-look.ts`), so the look it stores is the
 * one a read draws. Two blocks of one key are the first of them, as a look names them.
 */
export function queuesKept(page: string, blocks: readonly BlockResult[]): Set<string> {
  const kept = new Set<string>();
  if (questionsLead(page, blocks)) return kept;
  const met = new Set<string>();
  for (const b of blocks) {
    const key = keyOf(b);
    if (met.has(key)) continue;
    met.add(key);
    if (isQueue(b)) kept.add(key);
  }
  return kept;
}

const isLeadNote = (b: BlockResult): boolean => b.kind === 'note' && b.lead === true;
const unique = (keys: readonly string[]): string[] => [...new Set(keys)];

/**
 * Where a lead goes: the first block of the main column after the page's opening, the run of notes, the line a row is
 * typed into and forms the page starts with (and what is not drawn among them). An author who put the capture line
 * first keeps it first; a heading ends the opening.
 */
const topOf = (blocks: readonly BlockResult[]): number =>
  blocks.findIndex((b) => areaOf(b) === 'main' && (b.kind === 'section' || (!STAYS.has(b.kind) && b.drawn !== false)));

/**
 * Which group each block is in: the blocks between two headings in one column, numbered in page order. A heading opens
 * the group it heads, and the blocks before a column's first heading are a group of their own.
 */
function groupsOf(blocks: readonly BlockResult[]): number[] {
  const open = new Map<Area, number>();
  let made = 0;
  return blocks.map((b) => {
    const area = areaOf(b);
    if (b.kind === 'section' || !open.has(area)) open.set(area, made++);
    return open.get(area)!;
  });
}

/* ── reading a stored look ───────────────────────────────────────────────── */

const keyList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? unique(v.filter((k): k is string => typeof k === 'string' && BLOCK_KEY.test(k))).slice(0, LOOK_KEYS_MOST) : undefined;

/** A field's id, as a list declares one (`declare.ts`). */
const FIELD_ID = /^[a-z][a-z0-9_]{0,63}$/u;

/**
 * A look's `group` as written, or `undefined` for one that is not a map of block keys to field ids, holds none, or
 * holds more than a look may. ALL OR NOTHING, so a map half read never groups a page by half of what was meant.
 */
function groupMap(v: unknown): Record<string, string> | undefined {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0 || entries.length > LOOK_GROUPS_MOST) return undefined;
  if (!entries.every(([k, f]) => BLOCK_KEY.test(k) && typeof f === 'string' && FIELD_ID.test(f))) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Whether a value is a width, or a column, a look may give a block. */
const placeFits = { span: (v: unknown): v is number => typeof v === 'number' && SPANS.has(v), area: isArea } as const;

/**
 * A look's `span` or `area` as a read takes it: the entries that name a block's key and a width or column a look may
 * give, the first `LOOK_KEYS_MOST` of them, or `undefined` when none do. FORGIVING ENTRY BY ENTRY, as a read is: one
 * width a later board no longer draws leaves the others standing, since each says one block's place and no other's.
 */
function placeMap<K extends keyof typeof placeFits>(v: unknown, name: K): Record<string, K extends 'span' ? number : 'main' | 'rail'> | undefined {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const fits = placeFits[name] as (x: unknown) => boolean;
  const kept = Object.entries(v as Record<string, unknown>).filter(([k, x]) => BLOCK_KEY.test(k) && fits(x)).slice(0, LOOK_KEYS_MOST);
  return kept.length === 0 ? undefined : (Object.fromEntries(kept) as Record<string, K extends 'span' ? number : 'main' | 'rail'>);
}

/**
 * WHY A LOOK MAY NOT PLACE ITS BLOCKS AS WRITTEN, or `null` when it may (the install's check, `declare.ts` `lookBody`).
 * `span` and `area` are each a map of at most `LOOK_KEYS_MOST` block keys: a span to one of the board's five widths, an
 * area to `main` or `rail`. Only the person's own look places anything: the rules and Slash arrange a page, and how wide
 * a block is and where it sits are the page's author's or his. Whether the page has the key, or a rail to put a block
 * in, is the read's to say (`applyLook`), since a look outlives the page it was written over.
 */
export function lookPlacesFault(body: Readonly<Record<string, unknown>>, id: string): Refusal | null {
  const no = (fix: string, at: string, allowed?: readonly string[]): Refusal => ({ code: 'DECLARATION_INVALID', fix, at, ...(allowed ? { allowed } : {}) });
  for (const name of ['span', 'area'] as const) {
    const v = body[name];
    if (v === undefined) continue;
    const what = name === 'span' ? 'how wide a block is' : 'which column a block sits in';
    if (body.by !== 'owner') return no(`${id} is arranged by ${String(body.by)} and says ${what}. Only your own look says that; take ${name} out.`, name);
    if (v === null || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > LOOK_KEYS_MOST)
      return no(`${id}'s ${name} is a map of at most ${LOOK_KEYS_MOST} block keys, each to ${name === 'span' ? 'a width' : 'a column'}.`, name);
    for (const [key, x] of Object.entries(v as Record<string, unknown>)) {
      if (!BLOCK_KEY.test(key)) return no(`${id}'s ${name} names ${JSON.stringify(key)}, which is not a block's key.`, name);
      if (name === 'span' && !placeFits.span(x))
        return no(`${id} gives ${key} a width of ${JSON.stringify(x)}. A block is ${LOOK_SPANS.join(', ')} twelfths wide.`, `span.${key}`, LOOK_SPANS.map(String));
      if (name === 'area' && !isArea(x))
        return no(`${id} puts ${key} in ${JSON.stringify(x)}. A block sits in the main column or the rail.`, `area.${key}`, [...LOOK_AREAS]);
    }
  }
  return null;
}

/** The list a block is over, by its id, or `null` for a block over anything else. */
const listOf = (b: BlockResult): string | null => (typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null);

/**
 * WHETHER A BLOCK MAY BE DRAWN IN GROUPS BY A LOOK: its kind draws groups by a field of its list, it is over a list, it
 * is drawn and refused nothing, and it names no group of its own. What a page says of itself stands over any look.
 *
 * `GROUPED_BY_FIELD` AND NOT EVERY KIND THAT READS A KEY CALLED `group` (`block-keys.ts`): a feed's `group` is one word
 * for the heading its lines are gathered under, and a field's id written there would be read as that word.
 */
const groupable = (b: BlockResult): boolean =>
  GROUPED_BY_FIELD.has(b.kind) && listOf(b) !== null && b.group === undefined && b.drawn !== false && b.refusals.length === 0;

/**
 * How many values of `field` the rows a block shows hold. A row that holds none is not counted: it is drawn under no
 * heading, or under the one that says so, and is no reason to group. A link to several rows is one value as a whole.
 */
export function valuesShown(b: BlockResult, field: string): number {
  const met = new Set<string>();
  for (const r of b.rows) {
    const v = Object.hasOwn(r.fields, field) ? r.fields[field] : undefined;
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    met.add(typeof v === 'string' ? v : JSON.stringify(v));
  }
  return met.size;
}

/** Whether the rows a block shows hold enough values of `field` to be grouped by it, and not too many. */
export const groupsWell = (b: BlockResult, field: string): boolean => {
  const n = valuesShown(b, field);
  return n >= GROUP_VALUES_LEAST && n <= GROUP_VALUES_MOST;
};

/**
 * A stored look as a read takes it, or `null` when it is not one. FORGIVING WHERE THE INSTALL IS STRICT: the install
 * refuses a malformed look (`declare.ts`), and one stored under an earlier build keeps what still reads and drops the
 * rest, so a page never fails to draw over its look.
 */
export function lookOf(raw: unknown): LookBody | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.look !== 'string' || !(LOOK_BY as readonly unknown[]).includes(r.by)) return null;
  const next = r.next as { row?: unknown; text?: unknown } | undefined;
  const order = keyList(r.order);
  const hide = keyList(r.hide);
  const pinned = keyList(r.pinned);
  const group = groupMap(r.group);
  /* A WIDTH AND A COLUMN ARE READ ONLY OFF THE PERSON'S OWN LOOK, whatever the install let through. */
  const span = r.by === 'owner' ? placeMap(r.span, 'span') : undefined;
  const area = r.by === 'owner' ? placeMap(r.area, 'area') : undefined;
  return {
    look: r.look,
    basis: typeof r.basis === 'string' ? r.basis : '',
    by: r.by as LookBy,
    ...(typeof r.lead === 'string' && BLOCK_KEY.test(r.lead) ? { lead: r.lead } : {}),
    ...(order ? { order } : {}),
    ...(hide ? { hide } : {}),
    ...(typeof r.headline === 'string' && r.headline.trim() !== '' ? { headline: r.headline } : {}),
    ...(next && typeof next === 'object' && typeof next.row === 'string' && typeof next.text === 'string' && next.text.trim() !== ''
      ? { next: { row: next.row, text: next.text } }
      : {}),
    ...(pinned ? { pinned } : {}),
    ...(group ? { group } : {}),
    ...(span ? { span } : {}),
    ...(area ? { area } : {}),
  };
}

/* ── a headline's holes ──────────────────────────────────────────────────── */

/**
 * A HEADLINE SAYS A NUMBER AS A HOLE, `{{figure id}}`, AND THE READ FILLS IT (decision 3 of the engine's part B).
 *
 * A number a model typed was checked against the figures it was handed, which let a right number sit in a wrong
 * sentence, and it was right only for the night it was written. A hole is filled each time the page is read, from the
 * figures the page shows then and in the form it prints them, so the line can never say a count the page does not.
 */
const HOLE = /\{\{\s*([^{}\s]+)\s*\}\}/gu;

/** Every figure a headline names in a hole, in order and once each. */
export const holesIn = (headline: string): string[] => [...new Set([...headline.matchAll(HOLE)].map((m) => m[1]!))];

/** A headline with its holes taken out: what is left is the words, and a brace left in them is no hole. */
export const withoutHoles = (headline: string): string => headline.replace(HOLE, '');

/** A money in minor units as a person reads it, in the currency's own decimals: `GBP 33,850.00`, `JPY 129,900`. */
const moneySaid = (amount: number, currency: string): string => {
  const exp = exponentOf(currency);
  const body = (Math.abs(amount) / 10 ** exp).toLocaleString('en-u-nu-latn', { minimumFractionDigits: exp, maximumFractionDigits: exp });
  return `${currency.toUpperCase()} ${amount < 0 ? '−' : ''}${body}`;
};

/**
 * A figure as the page prints it, or `null` for one with nothing to say. A figure in several currencies is each of its
 * amounts, never their sum: two currencies are not added. The same writing the rules' line is filled with.
 */
export function figureSaid(v: Json | undefined): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  /* `v || 0`: a nought that came out of a subtraction as -0 is said as 0, never "-0". */
  if (typeof v === 'number') return Number.isFinite(v) ? (v || 0).toLocaleString('en-u-nu-latn', { maximumFractionDigits: 2 }) : null;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const isMoney = (p: unknown): p is { amount: number; currency: string } =>
    p !== null && typeof p === 'object' && Number.isFinite((p as { amount?: unknown }).amount) && typeof (p as { currency?: unknown }).currency === 'string' && (p as { currency: string }).currency.trim() !== '';
  if (Array.isArray(v)) return v.length > 0 && v.every(isMoney) ? v.map((p) => moneySaid(p.amount, p.currency)).join(' · ') : null;
  return isMoney(v) ? moneySaid(v.amount, v.currency) : null;
}

/**
 * The page's own figures as it reads now: every `{{path}}` its blocks hold a value for, by the path as written. Only a
 * block that is drawn and refused nothing says one, and the first block to say a figure is the one that is heard, so
 * the lead note's reading stands over a later block's.
 */
export function figuresOf(blocks: readonly BlockResult[]): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const b of blocks) {
    if (b.drawn === false || b.refusals.length > 0) continue;
    const values = (b as { values?: unknown }).values;
    if (values === null || typeof values !== 'object' || Array.isArray(values)) continue;
    /* `__proto__` written as a key would set what `out` inherits from, and be no figure of its own. */
    for (const [path, value] of Object.entries(values as Record<string, Json>)) if (path !== '__proto__' && !Object.hasOwn(out, path)) out[path] = value;
  }
  return out;
}

/**
 * A headline with every hole filled from `figures`, or `null` when it cannot be said: a hole names no figure handed,
 * or one with no value; a brace is left that is no hole; or the line as filled is not one plain line within the
 * headline's ceiling. One without a hole comes back as it was written.
 */
export function fillHoles(headline: string, figures: Readonly<Record<string, Json>>): string | null {
  if (/[{}]/u.test(withoutHoles(headline))) return null;
  let whole = true;
  const filled = headline.replace(HOLE, (_, id: string) => {
    const said = Object.hasOwn(figures, id) ? figureSaid(figures[id]) : null;
    /* A FIGURE'S OWN TEXT IS WORDS, NEVER A HOLE OR A BREAK: a value holding either would be drawn as written. */
    if (said === null || /[\n\r{}]/u.test(said)) whole = false;
    return said ?? '';
  });
  if (!whole) return null;
  return new TextEncoder().encode(filled).length > LOOK_HEADLINE_BYTES ? null : filled;
}

/* ── the rules ───────────────────────────────────────────────────────────── */

/** What `composeLook` reads: the page as read, today and the reader's mark in the record's own terms, and the lists. */
export type ComposeInput = {
  /** The page's declaration id without `page.`. */
  page: string;
  /** The page's blocks as read, each with its key, in the declared order with the adds laid in. */
  blocks: readonly BlockResult[];
  /** Today in the record's own zone, `2026-10-06`. */
  today: string;
  /** The reader's read mark, an instant, or `null` when they have none: then nothing counts as changed. */
  seen: string | null;
  /** Every list's declaration, for which fields fall due and which states finish a row. Absent, only `deadlines` is late. */
  lists?: readonly ListShape[];
  /** The field that names a row of a list, for the next action's words. */
  titleOf?: (register: string) => string | null;
  /** The field a list keeps its state in, or `null` for a list with none. Absent, the rules group nothing. */
  stateOf?: (register: string) => string | null;
  /** The owner's pinned keys, which the rules never hide, move or lead past. */
  pinned?: readonly string[];
};

/** A row that fell due and is not done: its handle, its name and the day. */
type Late = { row: string; name: string; day: string };

/** How pressing one block is, and its most pressing row when it has one. */
type Weighed = { rank: number; late?: Late; asks?: LookNext };

/** The words a row is named by: its list's title field, else the first of the block's columns that holds words. */
function nameOf(b: BlockResult, row: PageRow, register: string, input: ComposeInput): string {
  const title = input.titleOf?.(register) ?? null;
  const said = title !== null && Object.hasOwn(row.fields, title) ? row.fields[title] : undefined;
  if (typeof said === 'string' && said.trim() !== '') return said.trim();
  for (const c of b.columns ?? []) {
    const v = Object.hasOwn(row.fields, c.field) ? row.fields[c.field] : undefined;
    if (typeof v === 'string' && v.trim() !== '' && !/^\d{4}-\d{2}-\d{2}/u.test(v)) return v.trim();
  }
  return '';
}

/**
 * The oldest row of a block that fell due before today and is not done, or `undefined`. One the page can name wins over
 * an older one it cannot, so the next action has words; a row with no name still makes its block late (`name` is `''`).
 */
function lateIn(b: BlockResult, input: ComposeInput): Late | undefined {
  let oldest: Late | undefined;
  const take = (one: Late): void => {
    const named = one.name !== '';
    if (oldest === undefined || (named && oldest.name === '') || (named === (oldest.name !== '') && one.day < oldest.day)) oldest = one;
  };
  if (b.source === 'deadlines') {
    for (const row of b.rows) {
      const day = row.fields.day;
      const handle = row.fields.row;
      const title = row.fields.title;
      if (typeof day === 'string' && day.slice(0, 10) < input.today && typeof handle === 'string')
        take({ row: handle, name: typeof title === 'string' ? title.trim() : '', day: day.slice(0, 10) });
    }
    return oldest;
  }
  const register = typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;
  const shape = register === null ? undefined : input.lists?.find((l) => l.id === register);
  if (register === null || !shape) return undefined;
  const due = shape.fields.filter((f) => f.deadline === true && f.type === 'day' && f.retired !== true).map((f) => f.id);
  if (due.length === 0) return undefined;
  const done = shape.done ?? [];
  b.rows.forEach((row, i) => {
    if (b.done_now?.[i] === true || (row.state !== null && done.includes(row.state)) || row.seq === null) return;
    for (const field of due) {
      const v = Object.hasOwn(row.fields, field) ? row.fields[field] : undefined;
      if (typeof v === 'string' && v.slice(0, 10) < input.today) take({ row: `${register}#${row.seq}`, name: nameOf(b, row, register, input), day: v.slice(0, 10) });
    }
  });
  return oldest;
}

/** Whether something in the block changed after the reader's mark. */
function changedIn(b: BlockResult, seen: string | null): boolean {
  if (seen === null) return false;
  if (b.feed?.some((f) => f.at > seen)) return true;
  return b.source !== 'activity' && b.rows.some((r) => typeof r.updated_at === 'string' && r.updated_at > seen);
}

function weigh(b: BlockResult, input: ComposeInput): Weighed {
  if (b.drawn === false || b.refusals.length > 0) return { rank: RANK.none };
  const late = lateIn(b, input);
  if (late) return { rank: RANK.late, late };
  const first = b.source === 'governance.open' ? b.queue?.[0] : undefined;
  if (first) return { rank: RANK.needs, ...(first.question.trim() !== '' ? { asks: { row: first.id, text: first.question.trim() } } : {}) };
  if (changedIn(b, input.seen)) return { rank: RANK.changed };
  if (FIGURE_KINDS.has(b.kind) || (b.readings?.length ?? 0) > 0) return { rank: RANK.figures };
  return { rank: RANK.none };
}

/**
 * WHETHER A BLOCK DREW NOTHING, and so is not drawn, as no empty or unused part is. A list that read no
 * row, a figure that read no value; a figure in several currencies, one amount a currency, is a value. A note, a heading, the line a row is typed into and a written block are never
 * empty: what they show is what their author wrote.
 */
export function drewNothing(b: BlockResult): boolean {
  if (ROWLESS.has(b.kind) || b.drawn === false || b.refusals.length > 0) return false;
  if (b.readings !== undefined) return b.readings.length > 0 && b.readings.every((r) => !r.refusal && (r.reading === null || (r.reading.value === null && !r.reading.parts?.length && (r.reading.beyond === undefined || b.readings!.length > 1))));
  if (typeof b.source !== 'string') return false;
  if (!b.source.startsWith('register.') && !LISTED.has(b.source)) return false;
  return b.rows.length === 0 && b.matched === 0 && (b.feed?.length ?? 0) === 0 && (b.queue?.length ?? 0) === 0 && (b.measures?.length ?? 0) === 0;
}

/** A late row said as a next action: "Legal review is 3 days late". No figure is said that the row does not hold. */
function lateSaid(late: Late, today: string): string {
  const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${late.day}T00:00:00Z`)) / DAY_MS));
  return `${late.name} is ${days === 1 ? '1 day' : `${days} days`} late`;
}

/**
 * WHETHER A BLOCK STANDS UNDER A FOLDED HEADING: the nearest heading above it in its own column says `fold`. SINCE the
 * audit of 22 October (U12, U-A10): the rules' look on an owner's Agents page led with the folded Earlier runs, six
 * cards of runs from yesterday, and hid the Earlier heading over them, so the page opened on old runs as its lead. What
 * a page folds away is never what the rules lead with, and a heading the page folds is never one the rules hide.
 */
function underFold(blocks: readonly BlockResult[], i: number): boolean {
  for (let j = i - 1; j >= 0; j -= 1) {
    const b = blocks[j]!;
    if (areaOf(b) !== areaOf(blocks[i]!) || b.kind !== 'section') continue;
    return b.fold === true;
  }
  return false;
}

/**
 * THE RULES' LOOK FOR A PAGE, from the page as read and nothing else.
 *
 * - THE LEAD is the most pressing block of the main column, when something in it is late, waiting or changed. It goes
 *   to the top, under the page's opening line. Not when a pinned block stands between it and the top.
 * - THE ORDER moves pressing blocks up within their own group (the blocks between two headings in one column), most
 *   pressing first, and leaves a group where nothing moved as it was declared.
 * - HIDE is every block that drew nothing, and a heading whose blocks this look hid, or a `when:` hid beside them. Never a pinned, refused or lead
 *   block, and never the last block of the main column: a page with nothing in it still says what its quiet is.
 * - NEXT is the single most pressing row: the one late longest, else the first question waiting on the reader.
 * - GROUP is a long list drawn by its state: a block that draws groups, over a list, showing more than
 *   `GROUP_ROWS_OVER` rows that hold two to eight states among them. A short list reads faster flat.
 */
export function composeLook(input: ComposeInput): LookBody {
  const blocks = input.blocks;
  const pinned = new Set(input.pinned ?? []);
  const keys = blocks.map(keyOf);
  const weighed = blocks.map((b) => weigh(b, input));
  const fixedByKind = (i: number): boolean => pinned.has(keys[i]!) || isLeadNote(blocks[i]!) || blocks[i]!.refusals.length > 0;
  /* A QUEUE ON A PAGE ABOUT SOMETHING ELSE stays where the author put it: it neither leads nor moves up its group. */
  const asksFirst = questionsLead(input.page, blocks);
  const keptInPlace = (i: number): boolean => !asksFirst && isQueue(blocks[i]!);

  /* THE LEAD. */
  let leadAt = -1;
  blocks.forEach((b, i) => {
    if (areaOf(b) !== 'main' || STAYS.has(b.kind) || pinned.has(keys[i]!) || keptInPlace(i) || underFold(blocks, i) || weighed[i]!.rank < RANK.changed) return;
    if (leadAt === -1 || weighed[i]!.rank > weighed[leadAt]!.rank) leadAt = i;
  });
  if (leadAt !== -1) {
    const top = topOf(blocks);
    /* NOR PAST A WALK OF THE MONEY AHEAD. A page that opens on its cash and how long it lasts answers that first
       ("Money leads with cash and runway"), and a late instalment led his Money above both: what is late
       is said in the page's next line, and its tile moves up only within its own group, under the walk. Today and Decide
       are the reader's desk, where what waits on him comes first (`questionsLead`). */
    if (blocks.slice(top, leadAt).some((b, n) => pinned.has(keys[top + n]!) || (!asksFirst && b.kind === 'forecast' && areaOf(b) === 'main' && b.drawn !== false))) leadAt = -1;
  }
  const lead = leadAt === -1 ? undefined : keys[leadAt]!;

  /* HIDE. */
  const hidden = new Set<string>();
  blocks.forEach((b, i) => {
    if (i !== leadAt && !fixedByKind(i) && drewNothing(b)) hidden.add(keys[i]!);
  });
  const drawnMain = (): boolean => blocks.some((b, i) => areaOf(b) === 'main' && b.kind !== 'section' && !isLeadNote(b) && b.drawn !== false && !hidden.has(keys[i]!));
  if (!drawnMain()) {
    const keep = blocks.findIndex((b, i) => areaOf(b) === 'main' && hidden.has(keys[i]!) && typeof b.empty === 'string');
    if (keep !== -1) hidden.delete(keys[keep]!);
  }
  blocks.forEach((b, i) => {
    if (b.kind !== 'section' || fixedByKind(i) || typeof b.panel === 'string' || b.drawn === false) return;
    const held: number[] = [];
    for (let n = i + 1; n < blocks.length; n += 1) {
      if (areaOf(blocks[n]!) !== areaOf(b)) continue;
      if (blocks[n]!.kind === 'section') break;
      held.push(n);
    }
    /* ONLY A HEADING THE LOOK EMPTIED: one whose blocks a `when:` hid is the page's own to draw, as `applyLook` keeps it. */
    if (held.some((n) => hidden.has(keys[n]!)) && held.every((n) => hidden.has(keys[n]!) || blocks[n]!.drawn === false)) hidden.add(keys[i]!);
  });

  /* THE ORDER, a group at a time. */
  const order: string[] = [];
  const groupOf = groupsOf(blocks);
  const groups: number[][] = [...new Set(groupOf)].map((g) =>
    blocks.flatMap((b, i) => {
      /* THE WALK OF THE MONEY AHEAD KEEPS ITS PLACE in its group as well, so nothing pressing is sorted over it (above). */
      const walk = !asksFirst && b.kind === 'forecast' && areaOf(b) === 'main';
      const movable = !STAYS.has(b.kind) && !walk && !pinned.has(keys[i]!) && !keptInPlace(i) && i !== leadAt && !hidden.has(keys[i]!) && b.drawn !== false;
      return groupOf[i] === g && movable ? [i] : [];
    }),
  );
  for (const group of groups) {
    if (!group.some((i) => weighed[i]!.rank >= RANK.changed)) continue;
    const sorted = [...group].sort((a, b) => weighed[b]!.rank - weighed[a]!.rank || a - b);
    if (sorted.some((i, n) => i !== group[n])) order.push(...sorted.map((i) => keys[i]!));
  }

  /* NEXT. */
  let late: Late | undefined;
  for (const w of weighed) if (w.late && w.late.name !== '' && (late === undefined || w.late.day < late.day)) late = w.late;
  const asks = weighed.find((w) => w.asks)?.asks;
  const next: LookNext | undefined = late ? { row: late.row, text: lateSaid(late, input.today) } : asks;

  /* GROUP. Two blocks of one key are the first of them, as a look names them. */
  const group: Record<string, string> = {};
  blocks.forEach((b, i) => {
    const key = keys[i]!;
    if (keys.indexOf(key) !== i || Object.keys(group).length >= LOOK_GROUPS_MOST) return;
    if (!groupable(b) || b.rows.length <= GROUP_ROWS_OVER) return;
    const list = listOf(b)!;
    const field = input.stateOf?.(list) ?? null;
    if (field === null || !FIELD_ID.test(field)) return;
    /* THE LIST'S OWN DECLARATION, where the rules hold it: a state it retired is no field to draw by. */
    const shape = input.lists?.find((l) => l.id === list);
    if (shape && !shape.fields.some((f) => f.id === field && f.retired !== true)) return;
    if (groupsWell(b, field)) group[key] = field;
  });
  const grouped = Object.keys(group).length > 0;

  const hide = keys.filter((k) => hidden.has(k));
  /* A PAGE THAT GROUPS NOTHING KEEPS THE BASIS IT HAD before a look could group. */
  const facts = { lead: lead ?? null, order, hide, next: next ?? null, ...(grouped ? { group } : {}) };
  return {
    look: input.page,
    basis: `r${shortHash(JSON.stringify(facts))}`,
    by: 'rule',
    ...(lead ? { lead } : {}),
    ...(order.length ? { order } : {}),
    ...(hide.length ? { hide } : {}),
    ...(next ? { next } : {}),
    ...(grouped ? { group } : {}),
  };
}

/**
 * AN OWNER'S LOOK WITH THE ENGINE'S FILLING WHAT HE LEFT. What the owner set wins field by field: his lead, his order,
 * his headline, his next action. What he left unset is the engine's, and what he pinned is never hidden or moved by it
 * (the engine's look was composed knowing his pins, and they are taken out again here in case it was not). A list he
 * grouped his way is grouped his way, and the engine groups the ones he said nothing of, while a look has room. His
 * widths and columns are his whole, and the engine's look never carries any.
 */
export function mergeLook(owner: LookBody, engine: LookBody): LookBody {
  const pinned = new Set(owner.pinned ?? []);
  const lead = owner.lead ?? (engine.lead !== undefined && !pinned.has(engine.lead) ? engine.lead : undefined);
  const order = owner.order ?? engine.order?.filter((k) => !pinned.has(k));
  const hide = unique([...(owner.hide ?? []), ...(engine.hide ?? [])]).filter((k) => !pinned.has(k) && k !== lead);
  const headline = owner.headline ?? engine.headline;
  const next = owner.next ?? engine.next;
  const his = owner.group ?? {};
  const group = Object.fromEntries([...Object.entries(his), ...Object.entries(engine.group ?? {}).filter(([k]) => !Object.hasOwn(his, k))].slice(0, LOOK_GROUPS_MOST));
  return {
    look: owner.look,
    basis: owner.basis,
    by: 'owner',
    ...(lead !== undefined ? { lead } : {}),
    ...(order?.length ? { order } : {}),
    ...(hide.length ? { hide } : {}),
    ...(headline !== undefined ? { headline } : {}),
    ...(next !== undefined ? { next } : {}),
    ...(owner.pinned?.length ? { pinned: owner.pinned } : {}),
    ...(Object.keys(group).length ? { group } : {}),
    ...(owner.span && Object.keys(owner.span).length ? { span: owner.span } : {}),
    ...(owner.area && Object.keys(owner.area).length ? { area: owner.area } : {}),
  };
}

/** Every handle a page's rows answer to: a list row's spoken id and id, a deadline's row, a question's id. */
function handlesOf(blocks: readonly BlockResult[]): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) {
    for (const r of b.rows) {
      out.add(r.id);
      if (r.seq !== null) out.add(`${r.register}#${r.seq}`);
      if (typeof r.fields.row === 'string') out.add(r.fields.row);
    }
    for (const q of b.queue ?? []) out.add(q.id);
  }
  return out;
}

/**
 * THE PAGE WITH ITS LOOK LAID OVER IT, and the look as it applied.
 *
 * - ORDER is a reordering of blocks the page has. The blocks it names fill the places those blocks held, in its order,
 *   one group at a time (the blocks between two headings in one column), so a block never changes column or heading
 *   and a block it does not name never moves. A key the page does not have is dropped, a heading is never one it
 *   moves, and an engine's look never moves a pinned block.
 * - LEAD goes first in the main column, under the page's opening line. Not when a pinned block stands between it and
 *   there: moving it up would push the pinned block down, so it stays where it is and is not answered as the lead.
 * - HIDE says `drawn: false`, as a `when:` that says no does. A pinned, refused or lead block is never hidden, nor, by
 *   a look that is not the person's own, the questions while any are waiting. A heading that is hidden hides the blocks
 *   under it, and is not hidden while one of them may not be.
 * - NEXT is kept only when a block still drawn after the hide holds the row it names.
 * - HEADLINE has its holes filled from the page's own figures as they read now (`fillHoles`). One that cannot be
 *   filled is left out, so the rules' line stands.
 * - GROUP says `group` on a block whose kind draws groups, over a list, that names none of its own, while the rows it
 *   shows hold two to eight values of the field. Anything else is left as the page declared it, whoever's look it is:
 *   a stored look is laid over the page as it reads later, when all but one of the values may have gone.
 * - SPAN AND AREA, on the person's own look only, say a block's width and column over the page's. A key the page lacks,
 *   a heading, a value `lookPlacesFault` would refuse, and a rail on a page with no layout are passed over: the install
 *   is not the only door a look comes in by, so the read holds by itself. `page.layout` says whether the page has a
 *   rail; a host that does not say is read as having one only when one of its blocks already sits there.
 *
 * Nothing is added and nothing is taken out of the list, so a host keyed by `key` sees the same blocks, moved.
 */
export function applyLook(read: readonly BlockResult[], look: LookBody, page: { layout?: boolean } = {}): { blocks: BlockResult[]; look: LookBody } {
  const keys = read.map(keyOf);
  const at = new Map<string, number>();
  keys.forEach((k, i) => {
    if (!at.has(k)) at.set(k, i);
  });
  /* PLACES FIRST, on the block each key names (the first of two alike), so the order and the hide read the page in the
     columns he put it in. A block he moved to the rail takes its place among the rail's. */
  const owns = look.by === 'owner';
  const railed = page.layout ?? read.some((b) => b.area === 'rail');
  const placeable = (key: string): boolean => at.has(key) && read[at.get(key)!]!.kind !== 'section';
  const span: Record<string, number> = {};
  const area: Record<string, 'main' | 'rail'> = {};
  if (owns) {
    for (const [key, w] of Object.entries(look.span ?? {}).slice(0, LOOK_KEYS_MOST)) if (placeable(key) && placeFits.span(w)) span[key] = w;
    for (const [key, a] of Object.entries(look.area ?? {}).slice(0, LOOK_KEYS_MOST)) if (placeable(key) && isArea(a) && (a === 'main' || railed)) area[key] = a;
  }
  const placed = (b: BlockResult, i: number): BlockResult => {
    const key = keys[i]!;
    if (at.get(key) !== i || (!Object.hasOwn(span, key) && !Object.hasOwn(area, key))) return b;
    const out: BlockResult = { ...b };
    if (Object.hasOwn(span, key)) out.span = span[key]!;
    /* `main` IS SAID AS NO AREA, the way a page that names none says it. */
    if (area[key] === 'rail') out.area = 'rail';
    else if (area[key] === 'main') delete out.area;
    return out;
  };
  const sited: readonly BlockResult[] = Object.keys(span).length + Object.keys(area).length === 0 ? read : read.map(placed);
  /* GROUP NEXT: it moves and hides nothing, so the rest reads the page with its groups said, and the blocks handed in
     are not written on. */
  const group: Record<string, string> = {};
  for (const [key, field] of Object.entries(look.group ?? {}).slice(0, LOOK_GROUPS_MOST)) {
    const block = at.has(key) ? sited[at.get(key)!]! : undefined;
    if (block && FIELD_ID.test(field) && groupable(block) && groupsWell(block, field)) group[key] = field;
  }
  const blocks: readonly BlockResult[] = Object.keys(group).length === 0 ? sited : sited.map((b, i) => (at.get(keys[i]!) === i && Object.hasOwn(group, keys[i]!) ? { ...b, group: group[keys[i]!]! } : b));
  const pinned = (look.pinned ?? []).filter((k) => at.has(k));
  const pins = new Set(pinned);
  /* THE ENGINE'S LOOK NEVER LEADS WITH A QUEUE, NOR MOVES ONE, on a page that is about something else (`questionsLead`):
     a look Slash wrote is held to it here, as the rules hold themselves. The person's own look is his. */
  const queues = look.by === 'owner' ? new Set<string>() : queuesKept(look.look, blocks);
  const kept = (k: string): boolean => queues.has(k);
  /* NOR, UNLESS IT IS HIS OWN, WITH WHAT THE PAGE FOLDS AWAY (`underFold`): a look stored before that rule still names it. */
  const asked = look.lead !== undefined && at.has(look.lead) && !kept(look.lead) && (owns || !underFold(blocks, at.get(look.lead)!)) ? look.lead : undefined;

  /* ORDER, A GROUP AT A TIME: the blocks between two headings in one column, as the rules order them. Named across two
     groups, each block keeps its own heading and takes its place among the others named under it, so a look can never
     carry a block out from under "Bills" into "Today". A heading is no block a look moves. */
  const groupOf = groupsOf(blocks);
  const order = unique(look.order ?? []).filter((k) => at.has(k) && blocks[at.get(k)!]!.kind !== 'section' && (look.by === 'owner' || !pins.has(k)) && !kept(k));
  const named = new Set(order);
  let out = [...blocks];
  for (const group of new Set(groupOf)) {
    const slots = blocks.flatMap((_, i) => (groupOf[i] === group && named.has(keys[i]!) ? [i] : []));
    const placed = order.filter((k) => groupOf[at.get(k)!] === group).map((k) => blocks[at.get(k)!]!);
    slots.forEach((slot, n) => {
      out[slot] = placed[n]!;
    });
  }

  /* LEAD. */
  let lead = asked;
  if (lead !== undefined) {
    const from = out.findIndex((b) => keyOf(b) === lead);
    const block = out[from]!;
    const top = topOf(out);
    /* A BLOCK THAT ALREADY LEADS STAYS UNDER ITS HEADING: when only headings, words and hidden blocks stand above it, it is
       the first thing the page shows, and moving it over its own heading would only leave the heading standing over
       nothing ("Waiting on you" hidden above the question it introduced). */
    const leads = top !== -1 && out.slice(top, from).every((b) => areaOf(b) !== 'main' || STAYS.has(b.kind) || b.drawn === false);
    /* AND A PINNED BLOCK KEEPS ITS PLACE. Moved to the top, the lead pushed every block between down one, the pinned one
       among them, which `composeLook` already refused to do and this did for any look that named a lead: so the lead
       stays where it is, and the look does not say it leads. */
    const moves = areaOf(block) === 'main' && block.drawn !== false && top !== -1 && top < from && !leads;
    /* NOR PAST THE WALK OF THE MONEY AHEAD, as `composeLook` leads none past it, unless it is the person's own look:
       a look stored overnight before that rule still named a late tile over the cash. */
    const walkAbove = !owns && !questionsLead(look.look, read) && out.slice(top, from).some((b) => areaOf(b) === 'main' && b.kind === 'forecast' && b.drawn !== false);
    if (moves && (walkAbove || out.slice(top, from).some((b) => areaOf(b) === 'main' && pins.has(keyOf(b))))) lead = undefined;
    else if (moves) {
      out.splice(from, 1);
      out.splice(top, 0, block);
    }
  }

  /* HIDE. QUESTIONS THAT ARE WAITING ARE NEVER HIDDEN BY THE ENGINE. A look Slash stored is laid over the page as it reads
     later, when a queue it saw empty may hold something for the reader: hidden, nobody is asked. So a queue that drew
     anything stays, and so does the heading over it. An empty one may go, as the rules hide it. The person's own look
     is his. */
  const waiting = (b: BlockResult): boolean => look.by !== 'owner' && isQueue(b) && b.drawn !== false && !drewNothing(b);
  const fixed = (b: BlockResult): boolean => pins.has(keyOf(b)) || b.refusals.length > 0 || b.lead === true || keyOf(b) === lead || waiting(b);
  /* A FOLDED HEADING IS THE PAGE'S OWN WAY OF KEEPING ITS BLOCKS OUT OF THE WAY, and only his own look hides it. */
  const foldKept = (b: BlockResult): boolean => !owns && b.kind === 'section' && b.fold === true;
  const hide = new Set(unique(look.hide ?? []).filter((k) => at.has(k) && !fixed(blocks[at.get(k)!]!) && !foldKept(blocks[at.get(k)!]!)));
  out.forEach((b, i) => {
    if (b.kind !== 'section' || !hide.has(keyOf(b))) return;
    const held: BlockResult[] = [];
    for (const next of out.slice(i + 1)) {
      if (areaOf(next) !== areaOf(b)) continue;
      if (next.kind === 'section') break;
      held.push(next);
    }
    if (held.some(fixed)) hide.delete(keyOf(b));
    else for (const h of held) hide.add(keyOf(h));
  });
  out = out.map((b) => (hide.has(keyOf(b)) && b.drawn !== false ? { ...b, drawn: false } : b));

  /* A HEADING THE LOOK LEFT HOLDING NOTHING IS HIDDEN TOO. The lead moved out from under it, or the look hid or moved
     away every block it held, so it would stand over nothing. Only one that held a drawn block before the look: a
     heading the page declared empty, or emptied by a `when:`, is the page's own to draw. */
  const heldAt = (list: readonly BlockResult[], i: number): BlockResult[] => {
    const held: BlockResult[] = [];
    for (const next of list.slice(i + 1)) {
      if (areaOf(next) !== areaOf(list[i]!)) continue;
      if (next.kind === 'section') break;
      held.push(next);
    }
    return held;
  };
  const heldBefore = new Set(blocks.flatMap((b, i) => (b.kind === 'section' && heldAt(blocks, i).some((h) => h.drawn !== false) ? [keys[i]!] : [])));
  out = out.map((b, i) => {
    if (b.kind !== 'section' || b.drawn === false || typeof b.panel === 'string' || fixed(b) || !heldBefore.has(keyOf(b))) return b;
    if (heldAt(out, i).some((h) => h.drawn !== false)) return b;
    hide.add(keyOf(b));
    return { ...b, drawn: false };
  });

  /* NEXT IS A ROW THE READER IS SHOWN: one in a block the look just hid, or one refused, is no step anybody can take. */
  const next = look.next !== undefined && handlesOf(out.filter((b) => b.drawn !== false && b.refusals.length === 0)).has(look.next.row) ? look.next : undefined;
  const hidden = keys.filter((k) => hide.has(k));
  /* THE HEADLINE'S HOLES ARE FILLED FROM THE PAGE AS IT READS NOW, before the look hid anything: a figure of a block the
     look hides is still the page's. A hole that cannot be filled drops the line, so the rules' line stands, and the
     rest of the look is kept. */
  const headline = look.headline === undefined ? null : fillHoles(look.headline, figuresOf(blocks));
  return {
    blocks: out,
    look: {
      look: look.look,
      basis: look.basis,
      by: look.by,
      ...(lead !== undefined ? { lead } : {}),
      ...(order.length ? { order } : {}),
      ...(hidden.length ? { hide: hidden } : {}),
      ...(headline !== null ? { headline } : {}),
      ...(next !== undefined ? { next } : {}),
      ...(pinned.length ? { pinned } : {}),
      ...(Object.keys(group).length ? { group } : {}),
      ...(Object.keys(span).length ? { span } : {}),
      ...(Object.keys(area).length ? { area } : {}),
    },
  };
}
