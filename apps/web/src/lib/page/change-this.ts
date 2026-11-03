/**
 * "CHANGE THIS" ON A BLOCK ("BrainDog designs itself"): one line typed about one block, turned into a
 * patch on that block of the page's own .dog declaration, with no model.
 *
 * THE COMMON ASKS ARE RULES, NOT GUESSES. Show it as a calendar, sort by due, newest first, only this month, hide paid
 * ones, top 5, hide the owner column. Each becomes the same `Patch` the block editor makes (`withPatch`), so the page is
 * written the one way, Undo is the body before, and an agent can make the same change from the source. A line the rules
 * cannot read comes back `null`, and only then does the caller hand it to the model (which has its own plan cap).
 *
 * A FILTER IS CHECKED BY THE RECORD'S OWN PARSER (`readSentence`) before it is offered, so a sentence the record would
 * refuse is never written. PURE: no runes and no `$lib`, so `change-this.test.ts` holds it in Node.
 */

import { readSentence, toWhere, type QueryField } from '../query/tree.ts';
import type { Patch } from '../record/page-write.ts';
import { kindPatch } from '../record/page-write.ts';
import type { BlockBody } from '../record/pages-live.ts';

/** A field the block's list declares: its id, its type and, for a choice, the words it takes. */
export type AskField = { id: string; label?: string | undefined; type?: string | undefined; values?: readonly string[] | undefined };

export type AskIn = {
  /** What was typed. */
  text: string;
  /** The stored block, as the page's declaration has it. */
  block: BlockBody;
  /** The list the block reads, or none for a block that reads no list. */
  register: string | null;
  fields: readonly AskField[];
  /** What `kindsFor` says this block may become, and each kind's name as a person says it. */
  kinds: readonly string[];
  kindNames?: Readonly<Record<string, string>> | undefined;
  /** The record's clock, for the parser's day words. */
  now: number;
};

export type Edited = { patch: Patch; said: string };

export const changeThisWords = {
  change: 'Change this',
  title: (name: string) => `Change ${name}`,
  field: 'Say what to change',
  hint: 'Show it as a calendar. Only this month. Hide paid ones. Newest first. Top 5. Hide the owner column.',
  go: 'Show me',
  keep: 'Keep',
  undo: 'Undo',
  preview: 'This is how it looks now. Keep it, or undo it.',
  kept: 'Kept.',
  undone: 'Put back as it was.',
  pinned: 'You pinned this block. Change it anyway?',
  pinnedGo: 'Change it anyway',
  leave: 'Leave it',
  cannot: 'That is not one I can make from a line. Ask in the page sheet, or edit how it is built.',
  nothing: 'That would not change anything here.',
  asking: 'Reading it with the model.',
  notYours: 'This page came with a plugin, so hide the block instead.',
  noList: 'This block reads no list, so there is nothing to sort or filter.',
  chart: (kind: string) => `Showing it as ${article(kind)}.`,
  sorted: (field: string, up: boolean) => `Sorted by ${field}, ${up ? 'lowest' : 'highest'} first.`,
  limited: (n: number) => `Showing the first ${n}.`,
  only: (what: string) => `Only ${what}.`,
  without: (what: string) => `${what} left out.`,
  column: (name: string) => `The ${name} column is hidden.`,
};

const DATES: readonly string[] = ['day', 'instant', 'date'];
const NUMBERS: readonly string[] = ['int', 'number', 'decimal', 'money', 'quantity'];

/** What a person calls each kind, where it is not the kind's own name. */
const SAID_AS: Readonly<Record<string, string>> = {
  calendar: 'calendar',
  calendars: 'calendar',
  board: 'board',
  kanban: 'board',
  lanes: 'board',
  table: 'table',
  grid: 'table',
  sheet: 'table',
  cards: 'cards',
  card: 'cards',
  tiles: 'cards',
  list: 'todo',
  checklist: 'todo',
  todo: 'todo',
  'to-do': 'todo',
  'to do': 'todo',
  chart: 'bar',
  'bar chart': 'bar',
  bars: 'bar',
  bar: 'bar',
  graph: 'lines',
  line: 'lines',
  lines: 'lines',
  'line chart': 'lines',
  'line graph': 'lines',
  split: 'split',
  timeline: 'timeline',
  feed: 'feed',
  tree: 'tree',
};

function article(kind: string): string {
  const k = kind.trim().toLowerCase();
  return /s$/u.test(k) ? k : `${/^[aeiou]/u.test(k) ? 'an' : 'a'} ${k}`;
}

export const norm = (s: string): string => s.toLowerCase().replace(/[_-]+/gu, ' ').replace(/[^a-z0-9. ]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const nameOf = (f: AskField): string => norm(f.label ?? f.id);

/** The field a phrase names: by its id or its label, the longest that fits, or `null`. */
export function fieldIn(phrase: string, fields: readonly AskField[], want?: (f: AskField) => boolean): AskField | null {
  const p = ` ${norm(phrase)} `;
  let best: AskField | null = null;
  let size = 0;
  for (const f of fields) {
    if (want && !want(f)) continue;
    for (const name of new Set([norm(f.id), nameOf(f)])) {
      if (name && p.includes(` ${name} `) && name.length > size) {
        best = f;
        size = name.length;
      }
    }
  }
  return best;
}

/** A choice's word as the phrase says it, "paid" for `Paid` or `paid_out`, or `null` where no field takes it. */
export function choiceIn(phrase: string, fields: readonly AskField[]): { field: AskField; value: string } | null {
  const p = norm(phrase).replace(/^(the|all|any)\s+/u, '');
  if (p === '') return null;
  for (const f of fields) {
    const hit = f.values?.find((v) => norm(v) === p || norm(v) === p.replace(/s$/u, ''));
    if (hit !== undefined) return { field: f, value: hit };
  }
  return null;
}

export const queryFields = (fields: readonly AskField[]): QueryField[] =>
  fields.map((f) => ({ id: f.id, type: f.type ?? (f.values ? 'enum' : 'text'), ...(f.label ? { label: f.label } : {}), ...(f.values ? { values: f.values } : {}) }));

/** The `where` that joins a new sentence to what the block already filters by, or `null` where the two cannot be joined. */
export function joined(had: unknown, sentence: string, i: Pick<AskIn, 'register' | 'fields' | 'now'>): unknown | null {
  const reading = readSentence(sentence, i.register ?? '', queryFields(i.fields), i.now);
  if (!reading.ok) return null;
  if (had === undefined || had === null) return sentence;
  if (typeof had === 'string') {
    if (had.includes('{{') || / or /u.test(had) || / or /u.test(sentence)) return null;
    return `${had}, ${sentence}`;
  }
  const leaf = toWhere(reading.root, i.register ?? '', queryFields(i.fields));
  return leaf ? { all: [had, leaf] } : null;
}

/** A period said as a person says it, as the two day words a `between` takes. */
const PERIODS: readonly { say: RegExp; from: string; to: string; what: string }[] = [
  { say: /\bthis month\b/u, from: 'bom', to: 'eom', what: 'this month' },
  { say: /\bthis week\b/u, from: 'bow', to: 'bow+6d', what: 'this week' },
  { say: /\bthis year\b/u, from: 'boy', to: 'eoy', what: 'this year' },
  { say: /\blast month\b/u, from: 'bom-1m', to: 'bom-1d', what: 'last month' },
  { say: /\btoday\b/u, from: 'today', to: 'today', what: 'today' },
];

export function periodOf(t: string): { from: string; to: string; what: string } | null {
  const days = /\b(last|past|next)\s+(\d{1,3})\s+days?\b/u.exec(t);
  if (days) {
    const n = Number(days[2]);
    return days[1] === 'next' ? { from: 'today', to: `+${n}d`, what: `the next ${n} days` } : { from: `-${n}d`, to: 'today', what: `the last ${n} days` };
  }
  return PERIODS.find((p) => p.say.test(t)) ?? null;
}

/** The ask as a patch on the stored block, or `null` where the rules cannot read it. */
export function askedOf(i: AskIn): Edited | null {
  const t = norm(i.text)
    .replace(/^(please|can you|could you|just|now)\s+/u, '')
    .replace(/^(make|turn)\s+it\s+/u, 'show it ')
    .trim();
  if (t === '') return null;
  const block = i.block;
  const cols = Array.isArray(block.columns) ? (block.columns as { field?: unknown; label?: unknown }[]) : [];

  /* A COLUMN TAKEN OFF: "hide the owner column". Never the last one, which would leave a table of nothing. */
  const col = /\b(?:hide|drop|remove|delete)\s+(?:the\s+)?(.+?)\s+column\b/u.exec(t) ?? /\bwithout\s+(?:the\s+)?(.+?)\s+column\b/u.exec(t);
  if (col) {
    const named = cols.flatMap((c) => (typeof c.field === 'string' ? [{ id: c.field, label: typeof c.label === 'string' && c.label !== '' ? c.label : undefined }] : []));
    const f = fieldIn(col[1]!, named);
    if (!f || cols.length < 2) return null;
    return { patch: { columns: cols.filter((c) => c.field !== f.id) }, said: changeThisWords.column(nameOf(f)) };
  }

  /* WHAT IT IS DRAWN AS: "show it as a calendar", "as a chart". The kind must be one `kindsFor` allows for these cells. */
  const as = /\b(?:show|see|draw|display|view)?\s*(?:it|this|them)?\s*\bas\s+(?:an?\s+|the\s+)?(.+)$/u.exec(t);
  if (as) {
    const said = as[1]!.trim();
    const kind = SAID_AS[said] ?? SAID_AS[said.replace(/s$/u, '')] ?? [said, said.replace(/s$/u, '')].find((k) => i.kinds.includes(k));
    if (!kind) return null;
    const patch = kindPatch(block, kind, i.kinds);
    if (!patch) return null;
    return { patch, said: changeThisWords.chart(i.kindNames?.[kind]?.toLowerCase() ?? kind) };
  }

  /* HOW MANY: "top 5", "first 10", "only 3". A period such as "last 30 days" is a filter, not a count. */
  const top = /\b(?:top|first|only|just|limit(?:\s+to)?|show)\s+(\d{1,3})\b(?!\s*(?:days?|weeks?|months?|years?))/u.exec(t);
  if (top) {
    const n = Number(top[1]);
    if (n < 1) return null;
    /* A BLOCK THAT DRAWS COLUMNS TAKES A `limit`; one that already says `first`, or has no columns to draw, takes that. */
    const key = 'first' in block || cols.length === 0 ? 'first' : 'limit';
    return { patch: { [key]: n }, said: changeThisWords.limited(n) };
  }

  if (!i.register) return null;

  /* ORDER: "sort by due", "newest first", "biggest first", "by amount, lowest first". */
  const up = /\b(oldest|earliest|lowest|smallest|cheapest|least|ascending|a to z|soonest)\b/u.test(t);
  const down = /\b(newest|latest|highest|biggest|largest|most|descending|z to a)\b/u.test(t);
  const by = /\bsort(?:ed)?\b.*?\bby\s+(.+)$/u.exec(t) ?? /^by\s+(.+)$/u.exec(t) ?? /\border(?:ed)?\s+by\s+(.+)$/u.exec(t);
  const ranked = up || down || by !== null || /\bfirst$/u.test(t);
  if (ranked && (by !== null || up || down) && !/\b(hide|without|only)\b/u.test(t)) {
    const named = by ? fieldIn(by[1]!, i.fields) : null;
    const pick = (types: readonly string[]) => i.fields.find((f) => f.type !== undefined && types.includes(f.type)) ?? null;
    const wantsDate = /\b(newest|latest|oldest|earliest|soonest)\b/u.test(t);
    const f = named ?? (wantsDate ? pick(DATES) : pick(NUMBERS));
    if (f) {
      const dated = f.type !== undefined && DATES.includes(f.type);
      const asc = up ? true : down ? false : !(f.type !== undefined && NUMBERS.includes(f.type)) || dated;
      const dir = asc ? 'asc' : 'desc';
      return { patch: { order: [{ field: f.id, dir }] }, said: changeThisWords.sorted(nameOf(f), asc) };
    }
  }

  /* A PERIOD: "only this month", "last 30 days", "next 7 days", on the field the line names or the block's first date. */
  const period = periodOf(t);
  if (period) {
    const f = fieldIn(t, i.fields, (x) => DATES.includes(x.type ?? '')) ?? i.fields.find((x) => DATES.includes(x.type ?? '')) ?? null;
    if (!f) return null;
    const sentence = period.from === period.to ? `${f.id} is ${period.from}` : `${f.id} is between ${period.from} and ${period.to}`;
    const where = joined(block.where, sentence, i);
    return where === null ? null : { patch: { where }, said: changeThisWords.only(period.what) };
  }

  /* LEAVE ONE OUT: "hide paid ones", "without cancelled", "not done". */
  const leave = /\b(?:hide|without|exclude|except|skip|not|no)\s+(?:the\s+)?(.+?)(?:\s+(?:ones?|rows?|items?|entries))?$/u.exec(t);
  if (leave) {
    const hit = choiceIn(leave[1]!, i.fields);
    if (hit) {
      const where = joined(block.where, `${hit.field.id} is not ${norm(hit.value)}`, i);
      return where === null ? null : { patch: { where }, said: changeThisWords.without(cap(norm(hit.value))) };
    }
  }

  /* KEEP ONE: "only paid", "just the open ones", "paid ones". */
  const only = /\b(?:only|just|show only|filter to|keep)\s+(?:the\s+)?(.+?)(?:\s+(?:ones?|rows?|items?|entries))?$/u.exec(t) ?? /^(.+?)\s+ones$/u.exec(t);
  if (only) {
    const hit = choiceIn(only[1]!, i.fields);
    if (hit) {
      const where = joined(block.where, `${hit.field.id} is ${norm(hit.value)}`, i);
      return where === null ? null : { patch: { where }, said: changeThisWords.only(norm(hit.value)) };
    }
  }

  return null;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Whether the patch would change nothing the block already has, so the line says so rather than writing the same page. */
export function unchanged(block: BlockBody, patch: Patch): boolean {
  return Object.entries(patch).every(([k, v]) => JSON.stringify(block[k] ?? null) === JSON.stringify(v ?? null));
}

/** Whether a block is one he pinned: his pins always win, so the change asks first. */
export const pinnedIn = (key: string | undefined, pinned: readonly string[] | undefined): boolean => key !== undefined && (pinned ?? []).includes(key);
