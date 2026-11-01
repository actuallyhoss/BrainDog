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
 * EVERY MONTH FROM THE FIRST ROW'S TO THE LAST ROW'S IS WRITTEN, one grid each, AND ONE IS SHOWN (`focus`): the month
 * of the day a link opened, else this month, else the first month after it, else the last (the lists review, L38:
 * three months stacked were 2,266px at 1512). The others are written `hidden`, so a drawer with buttons moves between
 * them, and a copy with none (the mirror, the digest) still says every row: in the agenda.
 *
 * AND UNDER THE GRIDS, AN AGENDA of the days that hold anything, every row of them in the order they came. It is the
 * dated list a calendar falls back to, the whole of what a narrow screen shows under a strip of the month's days, and
 * the one place every row is said, because a day's cell names its first three and counts the rest. A day in the month
 * shown is marked `shown`, so a wide host lists only the rest under the grid: the agenda for the other months.
 *
 * OR A STRIP OF WEEKS, when the block says `weeks:` (`calendarStripPlan`): whole weeks from the Monday of this one, a
 * week a row of seven days, which is what a person reads on Today and a project page, where three whole months would
 * be two of them empty. The record reads the strip's days itself (`packages/kernel/src/kinds/calendar.ts`).
 */

import { DOTS_MOST, isDay, monthGrid, weekStart } from './days.ts';
import { addDays } from './day-math.ts';

/** The words the drawers write that no author did, here because this package cannot import the app's copy. */
export const CALENDAR_NONE = 'Nothing on the calendar.';
export const calendarSkipped = (titles: readonly string[]): string => `Not on the calendar, because the day does not read: ${titles.join(', ')}.`;
/** The word beside today's number on a strip, so today is never told by its colour alone. */
export const CALENDAR_TODAY = 'Today';
/** What a strip's week with nothing on it says, where a narrow screen lists only the days that hold something. */
export const CALENDAR_WEEK_NONE = 'Nothing this week.';
/**
 * A FEW ENTRIES ARE A LIST, NOT A MONTH (the money review): five bills on a five-week grid spent 520px on empty days
 * and said no amount. A calendar of this many rows or fewer is marked `data-few`, and the host shows its agenda, with
 * each row's amount, in the grid's place; "Month" brings the grid back where the host draws the choice.
 */
export const CALENDAR_FEW = 8;
export const CALENDAR_VIEWS = 'Show as';
export const CALENDAR_VIEW_MONTH = 'Month';
export const CALENDAR_VIEW_LIST = 'List';
/** What a strip says of the rows whose day falls before or after its weeks, which it draws on no day. */
export const calendarOutside = (n: number): string =>
  `${n} ${n === 1 ? 'thing falls' : 'things fall'} outside these weeks and ${n === 1 ? 'is' : 'are'} not drawn.`;
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
/** A day with no year, `3 Sep`, which `dateSaid` writes for the reader's own year. */
const BARE = /^(\d{1,2}) ([A-Z][a-z]{2})$/u;
const INSTANT = /^(\d{4}-\d{2}-\d{2})T/u;

/** A day that no calendar holds, handed to the grid when the drawer was told no clock, so no cell is today. */
const NO_TODAY = '0001-01-01';

/**
 * The day a cell names, as `YYYY-MM-DD`, or null when it names none.
 *
 * NOTHING IS GUESSED. An instant is its own day as written, because the page's writer has already put it in the
 * reader's day; `12 Sep 2026` is read only in the spelling `day()` writes; and a date the calendar does not have, 30
 * February, is no day at all. A day said with no year (`3 Sep`, as `dateSaid` writes the reader's own year) is read in
 * the year of `now`.
 */
export function calendarDay(text: string, now: number = Date.now()): string | null {
  const t = text.trim();
  if (isDay(t)) return t;
  const instant = INSTANT.exec(t);
  if (instant && isDay(instant[1]!) && Number.isFinite(Date.parse(t))) return instant[1]!;
  const bare = BARE.exec(t);
  const m = WRITTEN.exec(t);
  const [dd, mon, yyyy] = m ? [m[1]!, m[2]!, m[3]!] : bare ? [bare[1]!, bare[2]!, String(new Date(now).getFullYear())] : [];
  const month = mon ? MONTHS.indexOf(mon) + 1 : 0;
  if (!dd || !yyyy || month === 0) return null;
  const iso = `${yyyy.padStart(4, '0')}-${String(month).padStart(2, '0')}-${dd.padStart(2, '0')}`;
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
  /** The month shown, by index into `months` (`calendarFocus`); the rest are written hidden. */
  focus: number;
  days: CalendarDay<R>[];
  /** The rows whose day does not read, by index, which the drawers name under the calendar rather than lose. */
  skipped: number[];
  /** No row has a day, so there is no month to draw. */
  empty: boolean;
};

/** The rows by the day each falls on, in the order they came, and those whose day does not read, by index. */
function byDayOf<R extends { cells: readonly string[] }>(rows: readonly R[]): { byDay: Map<string, R[]>; skipped: number[] } {
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
  return { byDay, skipped };
}

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
  const { byDay, skipped } = byDayOf(rows);
  const keys = [...byDay.keys()].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return { months: [], focus: 0, days: [], skipped, empty: true };

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
  return { months, focus: calendarFocus(months.map((m) => m.month), clock === NO_TODAY ? '' : clock, marking), days, skipped, empty: false };
}

/**
 * THE MONTH A CALENDAR OPENS ON, by index into `months` (`YYYY-MM`, in order): the month of the day a link opened it on,
 * else this month, else the first month after this one, else the last month (every month is past). With no clock and
 * no mark, the first.
 */
export function calendarFocus(months: readonly string[], today: string, mark?: string | null): number {
  if (months.length === 0) return 0;
  const marked = mark && isDay(mark) ? months.indexOf(mark.slice(0, 7)) : -1;
  if (marked >= 0) return marked;
  if (!isDay(today)) return 0;
  const now = today.slice(0, 7);
  const after = months.findIndex((m) => m >= now);
  return after >= 0 ? after : months.length - 1;
}

/** The arrows' names: which month each moves to. */
export const calendarPrev = (label: string): string => (label ? `Previous month, ${label}` : 'Previous month');
export const calendarNext = (label: string): string => (label ? `Next month, ${label}` : 'Next month');
/** Over the agenda on a wide screen, where it lists only the days outside the month shown. */
export const CALENDAR_REST = 'Other months';

/** The most weeks a strip draws, as many as the record reads (`weeks:` 1 to 8). */
export const CALENDAR_WEEKS_MOST = 8;

/**
 * One day of a strip. `past` is a day of this week already gone, drawn quieter and still holding what fell on it, so
 * the week reads whole. `marked` is the day a link opened the calendar on, as on a month's grid.
 */
export type CalendarStripDay<R> = { day: string; num: number; said: string; today: boolean; past: boolean; marked: boolean; items: R[]; more: number; count: number };
/** One week of a strip, Monday first: `This week`, or the week of its Monday. `count` is every row on its days. */
export type CalendarStripWeek<R> = { from: string; label: string; days: CalendarStripDay<R>[]; count: number };
export type CalendarStripPlan<R> = {
  weeks: CalendarStripWeek<R>[];
  /** The rows whose day does not read, by index, named under the strip as under the months. */
  skipped: number[];
  /** The rows whose day falls before or after the weeks, by index, which the strip counts and draws on no day. */
  outside: number[];
  /** No row falls on a day of the weeks. */
  empty: boolean;
};

/**
 * `weeks` whole weeks from the Monday of the week `today` is in, a week a row of seven days, each day its first rows
 * and a count of the rest as a month's cell has (`DOTS_MOST`, `calendarMore`).
 *
 * THE WEEKS ARE TODAY'S, NOT THE ROWS': the record read the strip from this Monday (`weeks:`), so a strip with nothing
 * in its first week still starts on it. With no clock the strip starts on the week of the first row instead, and no
 * day is today or past. `weeks` is held to 1 to `CALENDAR_WEEKS_MOST`.
 */
export function calendarStripPlan<R extends { cells: readonly string[] }>(rows: readonly R[], today: string, weeks: number, mark?: string | null): CalendarStripPlan<R> {
  const { byDay, skipped } = byDayOf(rows);
  const n = Math.min(CALENDAR_WEEKS_MOST, Math.max(1, Number.isFinite(weeks) ? Math.trunc(weeks) : 1));
  const clock = isDay(today) ? today : null;
  const start = clock ?? [...byDay.keys()].sort()[0];
  if (start === undefined) return { weeks: [], skipped, outside: [], empty: true };
  const from = weekStart(start);
  const to = addDays(from, 7 * n - 1);
  const outside: number[] = [];
  rows.forEach((row, i) => {
    const day = calendarDay(row.cells[1] ?? '');
    if (day !== null && (day < from || day > to)) outside.push(i);
  });
  const marking = mark && isDay(mark) ? mark : null;
  const out: CalendarStripWeek<R>[] = Array.from({ length: n }, (_, w) => {
    const monday = addDays(from, 7 * w);
    const days = Array.from({ length: 7 }, (_, d): CalendarStripDay<R> => {
      const day = addDays(monday, d);
      const items = byDay.get(day) ?? [];
      const shown = items.slice(0, DOTS_MOST);
      return {
        day,
        num: Number(day.slice(8, 10)),
        said: calendarSaid(day, today),
        today: day === clock,
        past: clock !== null && day < clock,
        marked: day === marking,
        items: shown,
        more: items.length - shown.length,
        count: items.length,
      };
    });
    const label = clock !== null && clock >= monday && clock <= addDays(monday, 6) ? 'This week' : `Week of ${calendarSaid(monday, today).slice(4)}`;
    return { from: monday, label, days, count: days.reduce((sum, d) => sum + d.count, 0) };
  });
  return { weeks: out, skipped, outside, empty: out.every((w) => w.count === 0) };
}

/**
 * A strip as lines, for a drawer that writes words and no grid: one line a day that holds anything, in its week, and
 * one line saying `CALENDAR_WEEK_NONE` for a week that holds nothing, so a quiet week is said rather than skipped.
 */
export type CalendarStripLine<R> = { week: string; day: string | null; said: string; today: boolean; past: boolean; items: R[]; more: number };

export function calendarStripLines<R>(plan: CalendarStripPlan<R>): CalendarStripLine<R>[] {
  return plan.weeks.flatMap((w): CalendarStripLine<R>[] =>
    w.count === 0
      ? [{ week: w.label, day: null, said: CALENDAR_WEEK_NONE, today: false, past: false, items: [], more: 0 }]
      : w.days.filter((d) => d.count > 0).map((d) => ({ week: w.label, day: d.day, said: d.said, today: d.today, past: d.past, items: d.items, more: d.more })),
  );
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
