/**
 * THE ONE PRESS THAT FINISHES A LATE LINE'S ROW, in the words its own page leads with ("Mark paid", "Mark done"), or
 * `null` where its list declares no finished state or the reader may not change a row of it. The Late tile draws it
 * (`LateNow.svelte`), and Today keeps the line a press can finish when one thing stands in two lists
 * (`today-brief.ts` `onceEach`).
 *
 * A BILL AND A TASK ARE PRESSED DIFFERENTLY: a line with money on it is a bill, answered "Paid" or "Not yet" with
 * its amount to the cent; a task is a quiet tick, never a red "Mark done" louder than everything else on the page.
 */

import { REGISTERS } from '../record/held.ts';
import { finishOf } from '../../routes/r/[register]/[seq]/lead.ts';
import type { HomeLine } from './home-rows.ts';

/** The list a line's row is in, from its handle (`obligations#2`). */
export const listOf = (line: HomeLine): string | null => /^([a-z][a-z0-9_-]*)#[1-9][0-9]*$/u.exec(line.key)?.[1] ?? null;

/** The verb that finishes a line's row, as its own page says it, or `null` where the list has none or the reader may not. */
export function verbOf(line: HomeLine, writes: (list: string) => boolean): string | null {
  const list = listOf(line);
  if (list === null || !writes(list)) return null;
  return finishOf(REGISTERS[list], '')?.said ?? null;
}

/** Whether a late line is money that fell due (a bill, a salary, a part of a plan) rather than a piece of work. */
export const isBill = (line: Pick<HomeLine, 'money' | 'amount'>): boolean => line.money !== undefined || line.amount !== undefined;

/** The Late tile's own words for a bill's two answers and a task's tick. */
export const lateWords = {
  /** The bill's primary, said short: the full verb ("Mark paid") is its name for a screen reader. */
  paid: 'Paid',
  /** Not paid yet: the line goes quiet until tomorrow, and nothing is written. */
  notYet: 'Not yet',
  /** Said when a bill is put aside for the day. */
  notYetSaid: (title: string) => `${title} is out of Late until tomorrow.`,
} as const;

/** THE DAY A LINE WAS PUT ASIDE, by its handle: one day only, so a bill still unpaid tomorrow is back in Late. */
const ASIDE = 'today-late-aside';

/** Today's day, as the reader's own calendar says it (`YYYY-MM-DD`). */
const dayNow = (now = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** The handles put aside today, read from this browser alone; nothing kept is a record of anything. */
export function asideToday(now = new Date()): Set<string> {
  try {
    const kept = JSON.parse(globalThis.localStorage?.getItem(ASIDE) ?? '{}') as Record<string, unknown>;
    const day = dayNow(now);
    return new Set(Object.entries(kept).filter(([, d]) => d === day).map(([k]) => k));
  } catch {
    return new Set();
  }
}

/** Put a line aside until tomorrow, in this browser. A store that cannot be written keeps it aside for this view only. */
export function putAside(key: string, now = new Date()): void {
  try {
    const day = dayNow(now);
    const kept = JSON.parse(globalThis.localStorage?.getItem(ASIDE) ?? '{}') as Record<string, unknown>;
    const today = Object.fromEntries(Object.entries(kept).filter(([, d]) => d === day));
    globalThis.localStorage?.setItem(ASIDE, JSON.stringify({ ...today, [key]: day }));
  } catch {
    /* A private window: the line is aside for this view only. */
  }
}
