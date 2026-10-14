/**
 * What a `calendar` decides, as functions both drawers call: which day each row falls on, the months drawn as grids,
 * and the agenda of the days that hold anything.
 *
 * Kept out of the markup for the reason `heat.ts` is: an answer here can be tested without a DOM, and two drawers
 * that each worked it out would be two answers. The arithmetic under the grid is `days.ts`'s, written for this kind
 * and `heat` together, so a week starts on Monday here as it does in the kernel's buckets.
 *
 * A ROW IS `title | day`, and a tone. The day reads as `2026-09-12`, as an instant whose day is that one, or as
 * `12 Sep 2026`, the form `day()` writes and so the form a page's reader may project a day field in.
 *
 * EVERY MONTH FROM THE FIRST ROW'S TO THE LAST ROW'S IS DRAWN, one grid each, and nothing is hidden behind a control.
 * The record reads the rows of a window of whole months (`back:` and `ahead:`), so the rows already say which months
 * the reader asked for; the host lays the grids out, side by side or one under another. The mirror and the digest
 * draw the same months the app does, because a calendar whose other months were behind a button would be a calendar
 * of one month in every copy that has no button.
 *
 * AND UNDER THE GRIDS, AN AGENDA of the days that hold anything, every row of them in the order they came. It is the
 * dated list a calendar falls back to, the whole of what a narrow screen shows under a strip of the month's days, and
 * the one place every row is said, because a day's cell names its first three and counts the rest.
 */

import { DOTS_MOST, isDay, monthGrid } from './days.ts';

/** The words the drawers write that no author did, here because this package cannot import the app's copy. */
export const CALENDAR_NONE = 'Nothing on the calendar.';
export const calendarSkipped = (titles: readonly string[]): string => `Not on the calendar, because the day does not read: ${titles.join(', ')}.`;
/** A day's count of the rows its cell has no room to name. */
export const calendarMore = (n: number): string => `+${n}`;

/**
 * The most months drawn as grids. A window reaches twelve back and twelve ahead of the month it is read in, and a
 * fence an author typed reaches as far as its dates do; past this many the rows are still in the agenda.
 */
export const CALENDAR_MONTHS_MOST = 13;

/** The week's days, Monday first, as a grid's head says them and as its abbreviation expands them. */
export const WEEKDAYS: readonly { short: string; long: string }[] = [
  { short: 'Mon', long: 'Monday' },
  { short: 'Tue', long: 'Tuesday' },
  { short: 'Wed', long: 'Wednesday' },
  { short: 'Thu', long: 'Thursday' },
  { short: 'Fri', long: 'Friday' },
  { short: 'Sat', long: 'Saturday' },
  { short: 'Sun', long: 'Sunday' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WRITTEN = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{3,4})$/u;
const INSTANT = /^(\d{4}-\d{2}-\d{2})T/u;

/** A day that no calendar holds, handed to the grid when the drawer was told no clock, so no cell is today. */
const NO_TODAY = '0001-01-01';

/**
 * The day a cell names, as `YYYY-MM-DD`, or null when it names none.
 *
 * NOTHING IS GUESSED. An instant is its own day as written, because the page's writer has already put it in the
 * reader's day; `12 Sep 2026` is read only in the spelling `day()` writes; and a date the calendar does not have, 30
 * February, is no day at all.
 */
export function calendarDay(text: string): string | null {
  const t = text.trim();
  if (isDay(t)) return t;
  const instant = INSTANT.exec(t);
  if (instant && isDay(instant[1]!) && Number.isFinite(Date.parse(t))) return instant[1]!;
  const m = WRITTEN.exec(t);
  const month = m ? MONTHS.indexOf(m[2]!) + 1 : 0;
  if (!m || month === 0) return null;
  const iso = `${m[3]!.padStart(4, '0')}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isDay(iso) ? iso : null;
}

/** A day as the agenda says it: `Sat 12 Sep`, and the year too when it is not this one. */
export function calendarSaid(day: string, today: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const said = `${WEEKDAYS[(d.getUTCDay() + 6) % 7]!.short} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!}`;
  return isDay(today) && today.slice(0, 4) === day.slice(0, 4) ? said : `${said} ${day.slice(0, 4)}`;
}

/** The month after `YYYY-MM`. */
const nextMonth = (month: string): string => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${String(y + 1).padStart(4, '0')}-01` : `${month.slice(0, 4)}-${String(m + 1).padStart(2, '0')}`;
};

/**
 * One day of a month's grid. A day of the month either side is `inside: false` and holds nothing here. `marked` is the
 * day the reader came to, a date pressed elsewhere on the record (`?day=`), and only ever a day inside its month.
 */
export type CalendarCell<R> = { day: string; num: number; inside: boolean; today: boolean; marked: boolean; items: R[]; more: number; count: number };
export type CalendarMonth<R> = { month: string; label: string; weeks: CalendarCell<R>[][] };
/** One day of the agenda: every row on it, in the order they came. */
export type CalendarDay<R> = { day: string; said: string; today: boolean; items: R[] };
export type CalendarPlan<R> = {
  months: CalendarMonth<R>[];
  days: CalendarDay<R>[];
  /** The rows whose day does not read, by index, which the drawers name under the calendar rather than lose. */
  skipped: number[];
  /** No row has a day, so there is no month to draw. */
  empty: boolean;
};

/**
 * The months and the agenda for these rows, on `today` (`YYYY-MM-DD`, or empty for no clock).
 *
 * The order of the rows on a day is the order they came in, which is the reader's: the record sorts a block by its
 * `order:`, and a person typing a fence puts first what matters first.
 *
 * `mark` is the day a link opened the calendar on (`YYYY-MM-DD`): its cell reads `marked`, and a day outside the months
 * drawn marks nothing, so the grids are never stretched to reach it.
 */
export function calendarPlan<R extends { cells: readonly string[] }>(rows: readonly R[], today: string, mark?: string | null): CalendarPlan<R> {
  const byDay = new Map<string, R[]>();
  const skipped: number[] = [];
  rows.forEach((row, i) => {
    const day = calendarDay(row.cells[1] ?? '');
    if (day === null) {
      skipped.push(i);
      return;
    }
    const held = byDay.get(day) ?? [];
    held.push(row);
    byDay.set(day, held);
  });

  const keys = [...byDay.keys()].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return { months: [], days: [], skipped, empty: true };

  const clock = isDay(today) ? today : NO_TODAY;
  const marking = mark && isDay(mark) ? mark : null;
  const months: CalendarMonth<R>[] = [];
  for (let month = first.slice(0, 7), n = 0; month <= last.slice(0, 7) && n < CALENDAR_MONTHS_MOST; month = nextMonth(month), n++) {
    const grid = monthGrid(month, clock);
    const cells = grid.cells.map((c): CalendarCell<R> => {
      const items = c.inside ? (byDay.get(c.day) ?? []) : [];
      const shown = items.slice(0, DOTS_MOST);
      const marked = c.inside && c.day === marking;
      return { day: c.day, num: Number(c.day.slice(8, 10)), inside: c.inside, today: c.today, marked, items: shown, more: items.length - shown.length, count: items.length };
    });
    months.push({ month: grid.month, label: grid.label, weeks: Array.from({ length: grid.weeks }, (_, w) => cells.slice(w * 7, w * 7 + 7)) });
  }

  const days = keys.map((day) => ({ day, said: calendarSaid(day, today), today: day === today, items: byDay.get(day) ?? [] }));
  return { months, days, skipped, empty: false };
}

/**
 * THE DAY A LINK OPENED THE CALENDAR ON: `?day=2026-11-03`, the address a date anywhere on the record writes
 * (`dayHref` in the app). Only a day the calendar holds is one: `2030-13-01`, `2026-02-30` and words are none, and the
 * calendar opens unmarked.
 */
export const dayParam = (url: URL): string | null => {
  const day = url.searchParams.get('day')?.trim() ?? '';
  return isDay(day) ? day : null;
};

/**
 * Where a host that cannot reach a block's options hands the day down: a Svelte context under this key, holding a
 * function that answers the day or null. `Calendar.svelte` reads `opts.day` first. The app's declared page sets it
 * (`apps/web/src/routes/p/[slug]/+page.svelte`, which spells the key again, as `calendar-day.test.ts` holds).
 */
export const CALENDAR_DAY = 'braindog-render.calendar-day';
