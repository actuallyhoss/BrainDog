/**
 * Day grids, as functions the `heat` and `calendar` drawers will call.
 *
 * `heat` and `calendar` both draw days in cells and share every piece of arithmetic under them: `heat` is weeks
 * across and weekdays down, eight or twelve weeks ending on this one, each day washed in one of four
 * steps; `calendar` is a month of whole weeks or a strip of fourteen days, each day holding up to
 * three dots. Neither kind is registered yet. This file is the ground under both, written first so
 * the two drawers and their parity tests have one answer to agree on, and so a test can check it
 * without a DOM.
 *
 * EVERYTHING IS UTC, AND A WEEK STARTS ON MONDAY, because that is where `packages/kernel/src/buckets.ts`
 * starts it and that file is the only source of a day's bucket in either engine. A grid that began its
 * weeks on Sunday would put a Sunday's work in a different column from the `tasks-done-by-week` bar
 * drawn beside it, and two blocks on one page would disagree about the same rows. The kernel is not
 * imported: `packages/render` is MIT and depends on nothing, so the rule is restated here and the test
 * pins it to the kernel's own example day.
 *
 * A MISSING DAY IS A GAP AND NEVER A ZERO (`08 §2.1`). A zero is a claim that the day was counted and
 * nothing was in it; a gap says nobody counted. `washSteps` keeps the two apart, and a day after today
 * is marked `future` so a drawer never washes it at all.
 *
 * Positions come back as a column and a row, not as coordinates, because both kinds draw cells in an
 * HTML grid rather than on the `0 0 1000 100` chart box: a day is something to read and point at, and
 * a cell holding text must not stretch.
 */

import { addDays } from './day-math.ts';

/** One day as a cell: where it sits, and the three facts that change how it is drawn. */
export type DayCell = {
  day: string;
  col: number;
  row: number;
  /** Outlined on `heat`, ringed on `calendar`. */
  today: boolean;
  /** After today, so there is nothing yet to count. */
  future: boolean;
  /** In the month being drawn. Always true outside a month grid. */
  inside: boolean;
};

/** A day's wash: `null` for a gap, `0` for a day counted empty, `1` to `4` for how busy it was. */
export type Wash = 0 | 1 | 2 | 3 | 4 | null;

/** How many wash steps a busy day can be in. */
export const WASH_STEPS = 4;

/** How many dots a calendar day holds before the rest become a count. */
export const DOTS_MOST = 3;

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const at = (day: string): Date => new Date(`${day}T00:00:00Z`);

/**
 * Whether the text is a real calendar day, `YYYY-MM-DD`.
 *
 * `Date` rolls 30 February over to 2 March without a word, so the day is written back out and
 * compared: a date that does not survive the round trip is not one.
 */
export const isDay = (text: string): boolean => {
  if (!DAY.test(text)) return false;
  const d = at(text);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
};

/** Monday is 0 and Sunday is 6, which is ISO 8601's order and the row a day sits on in `heat`. */
const weekday = (day: string): number => (at(day).getUTCDay() + 6) % 7;

/** The Monday on or before a day, the key `buckets.ts` gives its week. */
export const weekStart = (day: string): string => addDays(day, -weekday(day));

const cell = (day: string, col: number, row: number, today: string, inside = true): DayCell => ({
  day,
  col,
  row,
  today: day === today,
  future: day > today,
  inside,
});

/**
 * The heat grid: `weeks` columns ending on the week that holds today, oldest first, and a row per
 * weekday.
 *
 * THE LAST COLUMN IS THIS WEEK WHOLE, days after today included and marked `future`, so the grid is
 * a rectangle and today sits on its own weekday row rather than at the foot of a ragged column.
 */
export function heatGrid(today: string, weeks = 12): { weeks: string[]; cells: DayCell[] } {
  if (!isDay(today) || weeks < 1) return { weeks: [], cells: [] };
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const keys = Array.from({ length: weeks }, (_, w) => addDays(first, 7 * w));
  const cells = keys.flatMap((monday, col) => Array.from({ length: 7 }, (_, row) => cell(addDays(monday, row), col, row, today)));
  return { weeks: keys, cells };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A month as whole weeks, Monday first, with the days of the months either side filling the first
 * and last rows and marked as not `inside`.
 *
 * `month` is `YYYY-MM` or any day in it. The rows run from four (a February that starts on a Monday)
 * to six, and the drawer should not assume five.
 */
export function monthGrid(month: string, today: string): { month: string; label: string; weeks: number; cells: DayCell[] } {
  const first = `${month.slice(0, 7)}-01`;
  if (!isDay(first) || !isDay(today)) return { month: '', label: '', weeks: 0, cells: [] };
  const key = first.slice(0, 7);
  const next = at(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  const start = weekStart(first);
  const end = addDays(weekStart(last), 6);
  const cells: DayCell[] = [];
  for (let day = start, i = 0; day <= end; day = addDays(day, 1), i++) cells.push(cell(day, i % 7, Math.floor(i / 7), today, day.startsWith(key)));
  return { month: key, label: `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, weeks: cells.length / 7, cells };
}

/**
 * A strip of days starting today, one line of them.
 *
 * `col` is the place along the strip; `row` is the weekday, which a strip does not lay out by but
 * which the drawer needs to name each day and to mark where a week turns.
 */
export function dayStrip(today: string, days = 14): DayCell[] {
  if (!isDay(today)) return [];
  return Array.from({ length: Math.max(0, days) }, (_, i) => {
    const day = addDays(today, i);
    return cell(day, i, weekday(day), today);
  });
}

/**
 * Each day's wash step, scaled to the busiest day in view.
 *
 * A DAY NOT IN `counts` IS A GAP, and so is a count that cannot be one (below zero, not a number).
 * A zero is its own step, drawn as a counted empty day.
 *
 * THE STEP ROUNDS UP, so one thing done is never washed as nothing done. With a busy day of 100 in
 * view a day of 1 is a hundredth of it; rounded to the nearest step it would draw as zero, and the
 * grid would say an active day was empty.
 */
export function washSteps(counts: Readonly<Record<string, number | null | undefined>>, days: readonly string[]): Wash[] {
  const read = days.map((day) => {
    const n = Object.hasOwn(counts, day) ? counts[day] : undefined;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
  });
  const most = Math.max(0, ...read.map((n) => n ?? 0));
  return read.map((n) => (n === null ? null : n === 0 ? 0 : (Math.min(WASH_STEPS, Math.ceil((n / most) * WASH_STEPS)) as Wash)));
}

/**
 * The dots each day holds, in the order the items came, and how many more there were.
 *
 * The order is the caller's, because the caller knows what matters (a payment due before a note); a
 * day with more than `most` items keeps the first ones and says the rest as a count, rather than
 * shrinking the dots until four fit and none can be told apart. An item with no readable day is
 * placed nowhere; the agenda list that stands in for the grid at a narrow width is where it can be
 * said.
 */
export function dayDots<T extends { day: string }>(items: readonly T[], most = DOTS_MOST): Map<string, { dots: T[]; more: number }> {
  const out = new Map<string, { dots: T[]; more: number }>();
  for (const item of items) {
    if (!isDay(item.day)) continue;
    const held = out.get(item.day) ?? { dots: [], more: 0 };
    if (held.dots.length < most) held.dots.push(item);
    else held.more++;
    out.set(item.day, held);
  }
  return out;
}
