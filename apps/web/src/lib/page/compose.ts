/**
 * "MAKE A COMPONENT" (DIRECTION §45, "BrainDog designs itself", Compose): something asked to be drawn, composed from
 * BrainDog's own blocks into one block of the page's declaration, with no model.
 *
 * THE COMMON SHAPES ARE RULES. A list named in the line (or the page's own), a shape named in it (calendar, board,
 * table, cards, timeline, a line, bars, a split, a ring, a heat map, a gauge, a checklist), a time window ("next 90
 * days", "this month") and a filter by a choice's word ("only open", "not paid"). Each becomes a block the page already
 * knows how to draw, so it is native, instant and right on a phone, and the person can then change it like any block.
 * A line the rules cannot read comes back `null`, and only then does the caller hand it to the model (which has its own
 * plan cap).
 *
 * LISTS AND FIELDS ARE READ FROM WHAT IS PASSED, never named here. A filter is checked by the record's own parser before
 * it is written, so a sentence the record would refuse is dropped, not kept. PURE: no runes, so `compose.test.ts`
 * holds it in Node.
 */

import { KINDS, isKind } from 'braindog-render';
import { readSentence } from '../query/tree.ts';
import { choiceIn, fieldIn, norm, periodOf, queryFields, type AskField } from './change-this.ts';
import type { Declared } from './shelf.ts';

/** One of the person's lists, as the record declares it. */
export type ComposeList = { id: string; name: string; one?: string | undefined; title?: string | undefined; fields: readonly AskField[] };

export type ComposeIn = {
  text: string;
  lists: readonly ComposeList[];
  /** The list the page is about, used where the line names none. */
  current: string | null;
  now: number;
};

export type Composed = { block: Declared; list: string; name: string; said: string };

export const composeWords = {
  make: 'Make a component',
  title: 'Make a component',
  field: 'Say what to draw',
  hint: 'Renewals as a calendar. Cash for the next 90 days as a line chart. Open tasks as a board. Spend by owner as bars.',
  go: 'Draw it',
  draft: 'Drawn as a draft on the page. Keep it, put it on your shelf, or throw it away.',
  keep: 'Keep',
  away: 'Throw away',
  kept: 'Kept. Done saves it to the page.',
  thrown: 'Thrown away.',
  cannot: 'That is not one I can draw from a line. Name a list and how to show it, such as tasks as a board.',
  asking: 'Reading it with the model.',
  noLists: 'There is no list to draw from yet.',
};

/** What each shape is called in a sentence about it. */
const SAY: Readonly<Record<string, string>> = {
  lines: 'a line chart',
  bar: 'a bar chart',
  split: 'a split',
  ring: 'a ring',
  gauge: 'a gauge',
  heat: 'a heat map',
  calendar: 'a calendar',
  board: 'a board',
  lanes: 'lanes',
  timeline: 'a timeline',
  todo: 'a checklist',
  table: 'a table',
  cards: 'cards',
};

/** The shape a line asks for, first match wins: the specific words before the general "chart". */
const SHAPES: readonly (readonly [RegExp, string])[] = [
  [/\bheat ?maps?\b/u, 'heat'],
  [/\bcalendars?\b/u, 'calendar'],
  [/\b(?:kanban|board|boards)\b/u, 'board'],
  [/\b(?:gantt|swim ?lanes?|lanes)\b/u, 'lanes'],
  [/\btimelines?\b/u, 'timeline'],
  [/\b(?:donut|doughnut|ring)\b/u, 'ring'],
  [/\b(?:pie|split|breakdown|proportions?|share of)\b/u, 'split'],
  [/\b(?:area|line|trend)(?: chart| graph)?\b|\bgraph\b|\bover time\b|\brunway\b/u, 'lines'],
  [/\b(?:gauge|progress)\b/u, 'gauge'],
  [/\b(?:bars?|columns?)(?: chart| graph)?\b|\bchart\b/u, 'bar'],
  [/\b(?:cards?|tiles)\b/u, 'cards'],
  [/\b(?:checklist|to ?do list|todo)\b/u, 'todo'],
  [/\b(?:table|grid|sheet)\b/u, 'table'],
];

const DATES: readonly string[] = ['day', 'instant', 'date'];
const NUMBERS: readonly string[] = ['int', 'number', 'decimal', 'money', 'quantity'];
const isDate = (f: AskField): boolean => DATES.includes(f.type ?? '');
const isNumber = (f: AskField): boolean => NUMBERS.includes(f.type ?? '');
const isChoice = (f: AskField): boolean => f.type === 'enum' || (f.values?.length ?? 0) > 0;

type Want = 'date' | 'number' | 'group' | 'choice' | 'title' | 'more';
type Slot = { want: Want; hard?: boolean };

/** What each shape's columns read, in order. A hard slot with no field to fill it means the list cannot be drawn so. */
const SLOTS: Readonly<Record<string, readonly Slot[]>> = {
  lines: [{ want: 'date', hard: true }, { want: 'number', hard: true }],
  bar: [{ want: 'group', hard: true }, { want: 'number', hard: true }],
  split: [{ want: 'choice', hard: true }, { want: 'number', hard: true }],
  ring: [{ want: 'title', hard: true }, { want: 'number', hard: true }],
  gauge: [{ want: 'title', hard: true }, { want: 'number', hard: true }],
  heat: [{ want: 'date', hard: true }, { want: 'number' }],
  calendar: [{ want: 'title', hard: true }, { want: 'date', hard: true }],
  board: [{ want: 'choice', hard: true }, { want: 'title', hard: true }],
  lanes: [{ want: 'title', hard: true }, { want: 'date', hard: true }, { want: 'date' }],
  timeline: [{ want: 'date', hard: true }, { want: 'title', hard: true }],
  todo: [{ want: 'title', hard: true }, { want: 'date' }],
  table: [{ want: 'title', hard: true }, { want: 'number' }, { want: 'date' }, { want: 'more' }],
  cards: [{ want: 'title', hard: true }, { want: 'number' }, { want: 'date' }, { want: 'choice' }],
};

/** How many rows a shape shows unless the line says "top 5". A ring is five parts at most. */
const LIMITS: Readonly<Record<string, number>> = { table: 8, cards: 6, todo: 8, timeline: 8, bar: 8, split: 6, ring: 5 };

/** The kinds that sort their rows by the day they read. */
const BY_DAY: readonly string[] = ['table', 'cards', 'todo', 'timeline', 'calendar', 'lanes'];

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The names a list is said by: its name, what one is called and its id, singular or plural. */
function namesOf(l: ComposeList): string[] {
  const out = new Set<string>();
  for (const raw of [l.name, l.one ?? '', l.id]) {
    const n = norm(raw);
    if (n.length < 2) continue;
    out.add(n);
    out.add(/s$/u.test(n) ? n.slice(0, -1) : `${n}s`);
  }
  return [...out];
}

/** The list the line names (the longest name that fits), or `null`. */
function listIn(t: string, lists: readonly ComposeList[]): ComposeList | null {
  const p = ` ${t} `;
  let best: ComposeList | null = null;
  let size = 0;
  for (const l of lists)
    for (const n of namesOf(l))
      if (p.includes(` ${n} `) && n.length > size) {
        best = l;
        size = n.length;
      }
  return best;
}

/** A window of time as the day words a `between` takes, with how it reads in a sentence. Weeks and months are days. */
function windowOf(t: string): { from: string; to: string; what: string } | null {
  const m = /\b(next|coming|last|past)\s+(\d{1,3})\s+(day|week|month)s?\b/u.exec(t);
  if (m) {
    const unit = m[3]!;
    const n = Number(m[2]);
    const days = n * (unit === 'week' ? 7 : unit === 'month' ? 30 : 1);
    if (days < 1 || days > 730) return null;
    const ahead = m[1] === 'next' || m[1] === 'coming';
    const what = `the ${ahead ? 'next' : 'last'} ${n} ${unit}${n === 1 ? '' : 's'}`;
    return ahead ? { from: 'today', to: `+${days}d`, what } : { from: `-${days}d`, to: 'today', what };
  }
  return periodOf(t);
}

/** The columns a shape reads, filled by what each field is, preferring one the line names; `null` where a hard slot has none. */
function fill(kind: string, list: ComposeList, t: string): AskField[] | null {
  const slots = SLOTS[kind];
  if (!slots) return null;
  const fields = list.fields;
  const used = new Set<string>();
  const out: AskField[] = [];
  const titleId = list.title && fields.some((f) => f.id === list.title) ? list.title : null;
  for (const slot of slots) {
    const free = fields.filter((f) => !used.has(f.id));
    const pool =
      slot.want === 'date'
        ? free.filter(isDate)
        : slot.want === 'number'
          ? free.filter(isNumber)
          : slot.want === 'choice'
            ? free.filter(isChoice)
            : slot.want === 'group'
              ? free.filter((f) => !isNumber(f) && !isDate(f) && f.type !== 'secret')
              : slot.want === 'title'
                ? [...free.filter((f) => f.id === titleId), ...free.filter((f) => !isNumber(f) && !isDate(f) && !isChoice(f) && f.type !== 'secret')]
                : free.filter((f) => f.type !== 'secret');
    /* A group reads best by a choice or a link, then by a name: "spend by owner" names its own. */
    const ordered = slot.want === 'group' ? [...pool.filter(isChoice), ...pool.filter((f) => f.type === 'ref'), ...pool] : pool;
    const named = slot.want === 'title' || slot.want === 'more' ? null : fieldIn(t, ordered);
    const pick = named ?? ordered[0] ?? null;
    if (!pick) {
      if (slot.hard) return null;
      continue;
    }
    used.add(pick.id);
    out.push(pick);
  }
  return out;
}

const NEGATES = '(?:not|without|except|excluding|exclude|hide|no)';

/** The filter sentences a line's choice words make, each checked by the record's own parser. */
function filtersOf(t: string, list: ComposeList, skip: ReadonlySet<string>, now: number): string[] {
  const out: string[] = [];
  const p = ` ${t} `;
  for (const f of list.fields) {
    if (skip.has(f.id) || !f.values) continue;
    let positive: string | null = null;
    for (const v of f.values) {
      const nv = norm(v);
      if (nv === '' || !(p.includes(` ${nv} `) || p.includes(` ${nv}s `))) continue;
      const negated = new RegExp(`\\b${NEGATES}\\s+(?:the\\s+)?${esc(nv)}\\b`, 'u').test(t);
      if (negated) out.push(`${f.id} is not ${nv}`);
      else if (positive === null || nv.length > positive.length) positive = nv;
    }
    if (positive !== null) out.push(`${f.id} is ${positive}`);
  }
  const fields = queryFields(list.fields);
  return out.filter((s) => readSentence(s, list.id, fields, now).ok);
}

/** The line as one block of the page's declaration, or `null` where the rules cannot read it. */
export function composeOf(i: ComposeIn): Composed | null {
  const t = norm(i.text);
  if (t === '' || i.lists.length === 0) return null;
  const list = listIn(t, i.lists) ?? i.lists.find((l) => l.id === i.current) ?? null;
  if (!list) return null;

  const win = windowOf(t);
  const shaped = SHAPES.find(([re]) => re.test(t))?.[1] ?? null;
  /* A WINDOW ALONE OVER A DATED AMOUNT IS A LINE: "cash for the next 90 days" is that, said without the shape. */
  const kind = shaped ?? (win && list.fields.some(isDate) && list.fields.some(isNumber) ? 'lines' : null);
  if (kind === null || !isKind(kind)) return null;

  const cols = fill(kind, list, t);
  if (!cols) return null;

  const sentences: string[] = [];
  let day: AskField | null = null;
  if (win) {
    day = fieldIn(t, list.fields, isDate) ?? cols.find(isDate) ?? list.fields.find(isDate) ?? null;
    if (!day) return null;
    const s = win.from === win.to ? `${day.id} is ${win.from}` : `${day.id} is between ${win.from} and ${win.to}`;
    if (!readSentence(s, list.id, queryFields(list.fields), i.now).ok) return null;
    sentences.push(s);
  }
  /* A COLUMN THE SHAPE GROUPS BY IS NOT FILTERED BY: "split by status" must not keep only one status. */
  const grouped = new Set(kind === 'bar' || kind === 'split' || kind === 'board' ? cols.filter(isChoice).map((f) => f.id) : []);
  sentences.push(...filtersOf(t, list, grouped, i.now));

  const top = /\b(?:top|first|biggest|largest|latest)\s+(\d{1,3})\b/u.exec(t);
  const limit = top ? Number(top[1]) : LIMITS[kind];
  const sortDay = kind === 'lines' ? (cols.find(isDate) ?? day) : BY_DAY.includes(kind) ? (cols.find(isDate) ?? null) : null;
  const sortNumber = top && !sortDay && kind !== 'bar' ? (cols.find(isNumber) ?? null) : null;

  const block: Declared = {
    kind,
    heading: cap(list.name) + (win ? `, ${win.what}` : ''),
    span: Math.max(KINDS[kind].minSpan, 6),
    source: `register.${list.id}`,
    columns: cols.map((f) => ({ field: f.id, ...(f.label ? { label: f.label } : {}) })),
    ...(sentences.length > 0 ? { where: sentences.join(', ') } : {}),
    ...(sortDay ? { order: [{ field: sortDay.id, dir: 'asc' }] } : sortNumber ? { order: [{ field: sortNumber.id, dir: 'desc' }] } : {}),
    ...(limit && limit > 0 ? { limit } : {}),
    empty: `Nothing in ${list.name.toLowerCase()} fits.`,
  };
  const name = cap(i.text.replace(/\s+/gu, ' ').trim()).slice(0, 60);
  return { block, list: list.id, name, said: `Drew ${list.name.toLowerCase()} as ${SAY[kind] ?? kind}${win ? `, ${win.what}` : ''}.` };
}
