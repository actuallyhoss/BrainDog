/**
 * TODAY'S TWO LISTS OF THINGS THAT FALL DUE, as Home draws them (DIRECTION §39, "Today reads as one story").
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

/** What Home draws a block as in place of the renderer's rows. */
export type HomeRows = { kind: 'late'; lines: HomeLine[] } | { kind: 'days'; days: DayGroup[] };

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
      out.push({
        key: keyOf(b, n),
        title: titleOf(b, n),
        ...(due === null ? {} : { when: due < today ? lateSaid(due, today) : DUE_TODAY }),
        ...(amount ? { amount } : {}),
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
