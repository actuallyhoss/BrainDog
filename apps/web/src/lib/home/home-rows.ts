/**
 * TODAY'S TWO LISTS OF THINGS THAT FALL DUE, as Home draws them ("Today reads as one story").
 *
 * LATE IS ONE LIST. The late tasks and the money that fell due are two reads, because a task is ticked where it is shown
 * and a bill is not, and they were drawn in two shapes under one name: a checklist over a three-column ledger in smaller
 * type, with the count beside the name saying the tasks alone ("Late 1" over seven rows while the head said seven). Here
 * every one is a line of the same shape: a red dot, its name, how late it is, and its amount at the right where it has
 * one. A task keeps its tick, behind its dot.
 *
 * COMING UP IS A FEW DAYS. Each day is a 36px chip (the weekday over the date) and the things that fall due on it beside
 * the chip, an amount coming in in the earn green and one going out in the ink.
 *
 * PURE, AND NODE LOADS IT: `homeDrawn` (`default-home.ts`) puts what these answer on the block as `homeRows`, and
 * `HomeRows.svelte` draws it, so the rule is held by `home-rows.test.ts` without a component. Every word here is the
 * row's own as the record answered it; an amount is the record's own string in its own currency, never summed.
 */

import type { LiveBlock } from '../record/page-live.ts';
import { lateSaid } from './today-tiles.ts';

/** One thing on one of Home's lists. */
export type HomeLine = {
  /** The row's own key (`obligations#2`, `tasks#4`), which the row cursor and Svelte's keyed list read. */
  key: string;
  title: string;
  /** How late it is ("4 days late"), or that it is due today; absent on a line that sits under its day. */
  when?: string;
  /** Its amount as the record said it, and which way the money goes. */
  amount?: { text: string; dir: 'in' | 'out' };
  /** The same amount as the record holds it, in minor units, where it carries one: Today's Late tile says it whole. */
  money?: { minor: number; currency: string };
  /** The day it fell due, `YYYY-MM-DD`, on a late line: "due 9 Oct" under its name. */
  day?: string;
  /** Its page, an app path. */
  href?: string;
  /** Whether it is past its day; a line due today is not, and its dot says so. */
  late: boolean;
  /** The task's number in its list, on a line a person may tick done where it is shown. */
  tick?: number;
};

/** One day of Coming up: the chip's two words, what a screen reader is told, and what falls due that day. */
export type DayGroup = {
  day: string;
  /** "Thu" over "3", in the chip. */
  weekday: string;
  date: string;
  /** "Thursday 3 September", the chip's name for a screen reader and its tooltip. */
  label: string;
  today: boolean;
  lines: HomeLine[];
};

/**
 * HOW MANY LATE THINGS EACH HALF OF THE LATE LIST HOLDS PAST WHAT IT DREW: the tasks, and the money that fell due. The
 * joined list is drawn on one block with the count of both, so the block's own count cannot say which half was cut,
 * and the door under the list has to open the half that was (`BlockSlot.svelte`).
 */
export type LateMore = { tasks: number; money: number };

/** What Home draws a block as in place of the renderer's rows. */
export type HomeRows = { kind: 'late'; lines: HomeLine[]; more?: LateMore } | { kind: 'days'; days: DayGroup[] };

/** A block as Home may draw it: with `homeRows`, Home's own list is drawn instead of the renderer's. */
export type WithRows = LiveBlock & { homeRows?: HomeRows };

const DAY = /^\d{4}-\d{2}-\d{2}/u;

/** The words for a line due today and not yet late. */
export const DUE_TODAY = 'Due today';

/** A cell of a row by the field its column reads, or `null`. */
function cell(b: LiveBlock, n: number, field: string): string | null {
  const at = b.columns.findIndex((c) => c.field === field);
  const v = at === -1 ? null : b.rows[n]?.cells[at];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** A row's name: its title column, else its first, as the renderer would have led with. */
const titleOf = (b: LiveBlock, n: number): string => cell(b, n, 'title') ?? cell(b, n, 'what') ?? String(b.rows[n]?.cells[0] ?? '').trim();

/**
 * A row's amount as the record said it ("−£9,190", "+£2,400") and which way it goes: the row's `direction`, else
 * the sign the record put on it. Only money known to come in is `in`. `undefined` where it has none.
 */
function amountOf(b: LiveBlock, n: number): HomeLine['amount'] {
  const text = cell(b, n, 'amount');
  if (text === null) return undefined;
  const fields = (b.entries[n]?.fields ?? {}) as Record<string, unknown>;
  /* NOTHING TO PAY IS NO AMOUNT: a certificate that renews for nothing reads "−£0" otherwise. */
  const value = fields.amount as { amount?: unknown } | null | undefined;
  if (value !== null && typeof value === 'object' && value.amount === 0) return undefined;
  /* THE ROW'S OWN WAY FIRST. What falls due is said "+" wherever its list names no way (`page-live.ts` signs only
     `out`), so a bill whose way is not known would read as money coming in, in the earn green: it is said unsigned,
     in the ink. */
  const way = fields.direction;
  if (way === 'in' || way === 'out') return { text, dir: way };
  if (Object.hasOwn(fields, 'direction')) return { text: text.replace(/^\+/u, ''), dir: 'out' };
  return { text, dir: text.startsWith('+') ? 'in' : 'out' };
}

/** The day a row falls due, `YYYY-MM-DD`: a deadline's `day`, else the first day one of the block's columns holds. */
function dueOf(b: LiveBlock, n: number): string | null {
  const fields = (b.entries[n]?.fields ?? {}) as Record<string, unknown>;
  if (typeof fields.day === 'string' && DAY.test(fields.day)) return fields.day.slice(0, 10);
  for (const c of b.columns) {
    const v = fields[c.field];
    if (typeof v === 'string' && DAY.test(v)) return v.slice(0, 10);
  }
  return null;
}

const hrefOf = (b: LiveBlock, n: number): string | undefined => {
  const h = (b.rows[n] as { href?: unknown } | undefined)?.href;
  return typeof h === 'string' && h !== '' ? h : undefined;
};

const keyOf = (b: LiveBlock, n: number): string => {
  const k = (b.rows[n] as { key?: unknown } | undefined)?.key;
  return typeof k === 'string' && k !== '' ? k : `${b.source ?? b.kind}@${n}`;
};

/**
 * EVERY LATE THING ON ONE LIST, in the order the blocks hold them: the tasks first, then the money. A block whose rows
 * and entries are not one for one says nothing it could misplace, and is left out.
 */
export function lateLines(blocks: readonly LiveBlock[], today: string): HomeLine[] {
  const out: HomeLine[] = [];
  for (const b of blocks) {
    if (b.entries.length !== b.rows.length) continue;
    b.rows.forEach((_, n) => {
      const due = dueOf(b, n);
      const amount = amountOf(b, n);
      const href = hrefOf(b, n);
      const held = ((b.entries[n]?.fields ?? {}) as Record<string, unknown>).amount as { amount?: unknown; currency?: unknown } | null | undefined;
      const money = amount && held && Number.isSafeInteger(held.amount) && typeof held.currency === 'string' ? { minor: held.amount as number, currency: held.currency } : null;
      out.push({
        key: keyOf(b, n),
        title: titleOf(b, n),
        ...(due === null ? {} : { when: due < today ? lateSaid(due, today) : DUE_TODAY, day: due }),
        ...(amount ? { amount } : {}),
        ...(money ? { money } : {}),
        ...(href ? { href } : {}),
        late: due === null || due < today,
        ...(b.kind === 'todo' && typeof b.entries[n]?.seq === 'number' ? { tick: b.entries[n]!.seq } : {}),
      });
    });
  }
  return out;
}

/** The weekday and the date a chip says, and the whole day for a screen reader, in the reader's language. */
function daySaid(day: string): { weekday: string; date: string; label: string } {
  const at = new Date(`${day}T12:00:00Z`);
  const said = (o: Intl.DateTimeFormatOptions) => at.toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  return { weekday: said({ weekday: 'short' }), date: String(at.getUTCDate()), label: said({ weekday: 'long', day: 'numeric', month: 'long' }) };
}

/**
 * WHAT FALLS DUE, BY DAY, in the order the record answered it (soonest first). A row with no day it can be put under is
 * left out rather than put under a day it does not fall on.
 */
export function dayGroups(b: LiveBlock, today: string): DayGroup[] {
  if (b.entries.length !== b.rows.length) return [];
  const days: DayGroup[] = [];
  b.rows.forEach((_, n) => {
    const day = dueOf(b, n);
    if (day === null) return;
    let group = days.at(-1);
    if (group?.day !== day) {
      group = { day, ...daySaid(day), today: day === today, lines: [] };
      days.push(group);
    }
    const amount = amountOf(b, n);
    const href = hrefOf(b, n);
    group.lines.push({ key: keyOf(b, n), title: titleOf(b, n), ...(amount ? { amount } : {}), ...(href ? { href } : {}), late: false });
  });
  return days;
}

/** How many lines a block's own list holds, for its fold. */
export const linesIn = (rows: HomeRows): number => (rows.kind === 'late' ? rows.lines.length : rows.days.reduce((n, d) => n + d.lines.length, 0));

/* ── the doors under the late list ─────────────────────────────────────── */

/** The words under a late list both of whose halves were cut, where "7 more" alone would not say of what. */
export const lateWords = {
  moreIn: (n: number, list: string) => `${n} more in ${list}`,
} as const;

const ROW_KEY = /^([a-z][a-z0-9_]*)#[1-9][0-9]*$/u;

/**
 * THE ONE LIST EVERY MONEY LINE SHOWN LIVES IN, by the lines' own keys (`obligations#2`), or `null`. What fell due is
 * read across lists, so the rest of it has one door only where every line drawn came from one list; from several, or
 * from a line that names no row, there is no one door, and none is drawn.
 */
export function moneyListOf(lines: readonly HomeLine[]): string | null {
  const from = new Set(lines.filter((l) => l.tick === undefined).map((l) => ROW_KEY.exec(l.key)?.[1] ?? ''));
  const list = from.size === 1 ? [...from][0]! : '';
  return list === '' ? null : list;
}

/** What `lateWhere` reads of a list's declaration. */
export type DueDecl = {
  state?: string | undefined;
  done?: readonly string[] | undefined;
  fields: readonly { id: string; type: string; deadline?: boolean | undefined; retired?: boolean | undefined }[];
};

/**
 * THE SENTENCE THAT KEEPS A LIST TO WHAT IS LATE, as the record reads what falls due: the one day its rows fall due on
 * is before today, and the row is not finished. `undefined` where the list cannot say it in one sentence: it declares
 * no day a row falls due on, or more than one, and a row late by either is not a filter a list's address holds. The
 * door then opens the whole list, which is the honest wide answer (`registerHref`). A retired day is no day a row falls
 * due on, as the record reads it.
 */
export function lateWhere(decl: DueDecl | undefined): string | undefined {
  const dated = (decl?.fields ?? []).filter((f) => f.type === 'day' && f.deadline === true && f.retired !== true);
  if (!decl || dated.length !== 1) return undefined;
  const open = decl.state !== undefined && decl.done && decl.done.length > 0 ? `, ${decl.state} is not ${decl.done.join(' or ')}` : '';
  return `${dated[0]!.id} before today${open}`;
}

/** One door under the late list: how many it leads to, and which half of the list they are. */
export type LateDoor = { half: 'todo' | 'money'; more: number };

/**
 * THE DOORS UNDER THE LATE LIST, one for each half that was cut, the tasks first as the list is. One half cut is one
 * door; both cut is two, because seven bills and three tasks more are in two places and one door opened one of them.
 * `null` for a list that does not say its halves, whose door is the block's own.
 */
export function lateDoors(rows: HomeRows | undefined): LateDoor[] | null {
  if (rows?.kind !== 'late' || !rows.more) return null;
  const { tasks, money } = rows.more;
  return [
    ...(tasks > 0 ? [{ half: 'todo' as const, more: tasks }] : []),
    ...(money > 0 ? [{ half: 'money' as const, more: money }] : []),
  ];
}
