/**
 * The Work screen's rules, with no network and no runes: what a record's tasks list can do, which band a task sits in,
 * the order inside a band, and how a day is said.
 *
 * READ FROM THE LIST'S DECLARATION, NEVER FROM A NAME TYPED HERE. The founder record's `tasks` says Status, Priority,
 * Project, Due, Owner and Agent; a student's homework list may say only a title and a state. Each part of the screen
 * asks `shapeOf` whether its field is there and is absent when it is not, so the same screen draws both.
 *
 * THE BANDS ARE THE OWNER'S OLD TOOL'S: what is late or due today first, then the work by
 * how much it matters, then what waits on somebody or sits with an agent, then what was kept for later and what was
 * finished. A task is in exactly one band, and the first rule that takes it wins, so no task is drawn twice.
 *
 * HALF OF IT GOES WITH THE SCREEN AS IT WAS. `/?work` draws the declared Work page now (`Work.svelte`), whose bands are
 * declared and whose project filter the kernel applies, so the bands and their order (`BANDS`, `bandOf`, `bandTitle`,
 * `byDue`, `byFinished`), the project pick (`ALL`, `NONE`, `inProject`) and the search (`matches`) were the old Work
 * screen's, retired on 24 October (C32); `board.test.ts` and the one-clock test still hold them as the record's day
 * rules. `shapeOf`, `projectOf`, `dayIn` and the day words stay: every page's row panel, row menu and capture line read
 * them (`lib/page`).
 */

import type { FieldDecl, Fields, RegisterDecl } from '../record/schema.ts';
import { recordToday } from '../record/zone.ts';

/** What a record's tasks list can do, read from its declaration. Every part is `null` when the list lacks it. */
export type Shape = {
  /** The field a task is named by. */
  title: string;
  /** The state field, its values, and the word each value is said as. */
  state: string | null;
  states: readonly string[];
  said: Readonly<Record<string, string>>;
  /** The states a task is finished in, the one a tick moves it to, and the one taking the tick off puts it back in. */
  done: readonly string[];
  tickTo: string | null;
  reopenTo: string | null;
  /** The state work kept for later sits in, and the states that wait on somebody. */
  later: string | null;
  waiting: readonly string[];
  /** The state a new task is written in. */
  fresh: string | null;
  /** The link to the project a task is filed under, and the list it points at. */
  project: { field: string; to: string } | null;
  /** The day it is due, and the day the record fills when it is finished. */
  due: string | null;
  finished: string | null;
  /** How much it matters: the field, its values from most to least, and their words. */
  priority: { field: string; values: readonly string[]; said: Readonly<Record<string, string>> } | null;
  /** Who holds it: a person by a link, an agent by the name it signs with. */
  owner: { field: string; to: string } | null;
  agent: string | null;
  note: string | null;
};

/** A value spelt as a word, where the declaration gives none: `to_check` is "To check". */
export const wordOf = (v: string): string => v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const find = (fields: readonly FieldDecl[], pick: (f: FieldDecl) => boolean): FieldDecl | undefined => fields.find(pick);
const labelled = (f: FieldDecl, re: RegExp): boolean => re.test(f.id) || re.test(f.label ?? '');
const refTo = (f: FieldDecl | undefined): { field: string; to: string } | null => (f?.type === 'ref' && f.to ? { field: f.id, to: f.to } : null);

/** The list's `hand:` (`42 §4.4`), where it says which fields hold a task: a person's link and an agent's name. */
type Hand = { person?: unknown; agent?: unknown };

/**
 * What this list can do.
 *
 * EACH PART IS FOUND THE WAY THE RECORD SAYS IT FIRST, and by its usual name second: the finished day is the
 * declaration's `finished`, the holder its `hand:`, and a due day the `day` field marked `deadline`. A list made by
 * hand says none of that, so a day field called Due, a link called Project and an enum called Priority still count.
 */
export function shapeOf(decl: RegisterDecl): Shape {
  const fields = decl.fields ?? [];
  const byId = (id: unknown) => (typeof id === 'string' ? fields.find((f) => f.id === id) : undefined);

  const stateField = decl.state ? byId(decl.state) : undefined;
  const states = stateField?.type === 'enum' ? (stateField.values ?? []) : [];
  const said: Record<string, string> = {};
  for (const v of states) said[v] = stateField?.labels?.[v] ?? wordOf(v);

  const done = states.filter((v) => (decl.done ?? []).includes(v));
  const tickTo = done.includes('done') ? 'done' : (done[0] ?? null);
  const live = states.filter((v) => !done.includes(v));
  const deflt = typeof stateField?.default === 'string' && live.includes(stateField.default) ? stateField.default : null;
  const later = live.find((v) => v === 'backlog' || v === 'later' || v === 'someday') ?? null;
  const fresh = deflt ?? (live.includes('open') ? 'open' : (live.find((v) => v !== later) ?? null));
  const waiting = live.filter((v) => v === 'review' || v === 'blocked' || v === 'waiting');

  const project =
    refTo(byId('thing')) ??
    refTo(find(fields, (f) => f.type === 'ref' && (f as { scope?: unknown }).scope !== undefined)) ??
    refTo(find(fields, (f) => f.type === 'ref' && labelled(f, /project/i)));

  const dueField =
    find(fields, (f) => f.type === 'day' && (f as { deadline?: unknown }).deadline === true) ??
    find(fields, (f) => f.type === 'day' && f.id !== decl.finished && labelled(f, /^(by|due)$|due/i));

  const pField = find(fields, (f) => f.type === 'enum' && labelled(f, /priority|tier/i) && (f.values?.length ?? 0) > 1);
  const priority = pField
    ? {
        field: pField.id,
        values: pField.values ?? [],
        said: Object.fromEntries((pField.values ?? []).map((v) => [v, pField.labels?.[v] ?? wordOf(v)])),
      }
    : null;

  const hand = (decl as unknown as { hand?: Hand }).hand;
  const owner = refTo(byId(hand?.person)) ?? refTo(byId('owner'));
  const agentField = byId(hand?.agent) ?? byId('agent');

  return {
    title: decl.title,
    state: stateField && states.length > 0 ? stateField.id : null,
    states,
    said,
    done,
    tickTo,
    reopenTo: fresh,
    later,
    waiting,
    fresh,
    project,
    due: dueField?.id ?? null,
    finished: decl.finished && byId(decl.finished) ? decl.finished : null,
    priority,
    owner,
    agent: agentField && agentField.type === 'text' ? agentField.id : null,
    note: byId('note')?.id ?? null,
  };
}

/* ── the bands ─────────────────────────────────────────────────────────── */

/** The bands, top to bottom. `top`, `second` and `low` are the list's own priorities; `open` is everything else. */
export const BANDS = ['changed', 'overdue', 'today', 'top', 'second', 'open', 'low', 'waiting', 'agent', 'later', 'done'] as const;
export type Band = (typeof BANDS)[number];

/** The bands that are folded until somebody opens them. */
export const FOLDED: ReadonlySet<Band> = new Set(['later', 'done']);

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
/** A day as the record holds one, cut to `YYYY-MM-DD`, or `''`. */
export const dayIn = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

/** Whether a task is finished, by the list's own terminal states. */
export const isDone = (f: Fields, s: Shape): boolean => s.state !== null && s.done.includes(text(f[s.state]));

/** Which of the priority bands a value falls in: the first two values, the last of four or more, or the rest. */
function priorityBand(value: string, s: Shape): Band {
  const values = s.priority?.values ?? [];
  const i = values.indexOf(value);
  if (i < 0) return 'open';
  if (i === 0) return 'top';
  if (i === 1 && values.length >= 3) return 'second';
  if (i === values.length - 1 && values.length >= 4) return 'low';
  return 'open';
}

/**
 * The band a task sits in, `today` being the reader's own day.
 *
 * THE DAY COMES BEFORE HOW MUCH IT MATTERS, as it does on Today: a task past its day is late whoever holds it. Work
 * kept for later is later whatever its date, which is the word the Board already uses for it.
 */
export function bandOf(f: Fields, s: Shape, today: string): Band {
  const state = s.state ? text(f[s.state]) : '';
  if (s.done.includes(state)) return 'done';
  if (s.later !== null && state === s.later) return 'later';
  const due = s.due ? dayIn(f[s.due]) : '';
  if (due !== '' && due < today) return 'overdue';
  if (due !== '' && due === today) return 'today';
  if (s.waiting.includes(state)) return 'waiting';
  if (s.agent && text(f[s.agent]).trim() !== '') return 'agent';
  if (s.priority) return priorityBand(text(f[s.priority.field]), s);
  return 'open';
}

/** What a band is called: the list's own word for a priority or for later, plain words for the rest. */
export function bandTitle(b: Band, s: Shape): string {
  const p = s.priority;
  switch (b) {
    case 'changed':
      return 'Just changed';
    case 'overdue':
      return 'Overdue';
    case 'today':
      return 'Today';
    case 'top':
      return p ? (p.said[p.values[0]!] ?? 'First') : 'First';
    case 'second':
      return p ? (p.said[p.values[1]!] ?? 'Next') : 'Next';
    case 'low':
      return p ? (p.said[p.values[p.values.length - 1]!] ?? 'Low') : 'Low';
    case 'open':
      return 'Open';
    case 'waiting':
      return 'Waiting';
    case 'agent':
      return 'With an agent';
    case 'later':
      return s.later ? (s.said[s.later] ?? 'Later') : 'Later';
    case 'done':
      return 'Done recently';
  }
}

/** A task's order inside its band: soonest due first, a task with no day after those, then the newest. */
export function byDue(s: Shape): (a: { seq: number; fields: Fields }, b: { seq: number; fields: Fields }) => number {
  return (a, b) => {
    const da = s.due ? dayIn(a.fields[s.due]) : '';
    const db = s.due ? dayIn(b.fields[s.due]) : '';
    if (da !== db) return da === '' ? 1 : db === '' ? -1 : da < db ? -1 : 1;
    return b.seq - a.seq;
  };
}

/** Finished work, the latest finished first. */
export function byFinished(s: Shape): (a: { seq: number; fields: Fields }, b: { seq: number; fields: Fields }) => number {
  return (a, b) => {
    const da = s.finished ? dayIn(a.fields[s.finished]) : '';
    const db = s.finished ? dayIn(b.fields[s.finished]) : '';
    if (da !== db) return da < db ? 1 : -1;
    return b.seq - a.seq;
  };
}

/* ── the project filter ────────────────────────────────────────────────── */

/** The filter: every task (`''`), the tasks filed under no project (`'none'`), or one project's by its number. */
export type ProjectPick = string;
export const ALL = '';
export const NONE = 'none';

/** The project a task is filed under, by number, or `null`. */
export function projectOf(f: Fields, s: Shape): number | null {
  if (!s.project) return null;
  const v = f[s.project.field];
  return typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null;
}

export function inProject(f: Fields, s: Shape, pick: ProjectPick): boolean {
  if (pick === ALL || !s.project) return true;
  const p = projectOf(f, s);
  return pick === NONE ? p === null : p === Number(pick);
}

/** Whether a task answers the search box: its words, its note, its project or holder's name, or `#12` for its number. */
export function matches(t: { seq: number; fields: Fields }, s: Shape, needle: string, named: (t: { seq: number; fields: Fields }) => string): boolean {
  const n = needle.trim().toLowerCase();
  if (n === '') return true;
  if (/^#\d+$/.test(n)) return `#${t.seq}` === n;
  const hay = [text(t.fields[s.title]), s.note ? text(t.fields[s.note]) : '', named(t)].join(' ').toLowerCase();
  return n.split(/\s+/).every((w) => hay.includes(w));
}

/* ── days ──────────────────────────────────────────────────────────────── */

const pad = (n: number): string => String(n).padStart(2, '0');

/** The record's own day, `YYYY-MM-DD`, on its wall clock (`zone.ts`), the one "today" every screen says. */
export const dayOf = (now: number): string => recordToday(now);

/** A day `n` days after `day`, by the calendar and not by 24-hour steps, so a clock change moves nothing. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/** Sunday is 0, as `Date` counts. */
export const weekdayOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Whole days from `from` to `to`, by the calendar. */
export function daysBetween(from: string, to: string): number {
  const at = (day: string) => {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * A due day as the row says it: Today, Tomorrow, a weekday this week, `3 Oct`, and how late when it has passed.
 */
export function dueSaid(day: string, today: string): string {
  const n = daysBetween(today, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n} days late`;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  if (n < 7) return DAYS[weekdayOf(day)]!;
  return `${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? '' : ` ${y}`}`;
}

/** A day in full, for a receipt: `Wed 30 Sep`. */
export function daySaid(day: string): string {
  const [, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${DAYS[weekdayOf(day)]} ${d} ${MONTHS[m - 1]}`;
}

/** Next Monday, strictly after `today`: what "next week" means. */
export const nextMonday = (today: string): string => addDays(today, ((8 - weekdayOf(today)) % 7) || 7);
