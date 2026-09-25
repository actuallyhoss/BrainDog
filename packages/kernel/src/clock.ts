/**
 * An automation's clock that keeps the calendar: every month, or every few, on a day of the month, at a time in the
 * record's zone (`loop/research-legacy-parity.md` B2).
 *
 * `pull.ts`'s `intervalMs` IS A NUMBER OF MILLISECONDS, AND A MONTH IS NOT ONE. Until this file the lint refused `1mo`
 * outright, so a bill due on the last day of each month could only be kept as a task somebody copied forward by hand,
 * and the nearest clock that installed (`every: 4w`) left the date within two months. So nothing here adds a length
 * to an instant: each run is the next (year, month, day, time) on the wall of the record's zone, turned into an
 * instant through `Intl`, which is the zone data the runtime already carries and `digest.ts`'s `nextOccurrence` reads.
 *
 * THE DAY IS CLAMPED AND NEVER CARRIED. `day: 31` in April is the 30th, and May is the 31st again, because each run
 * is worked out from the declaration and never from the day the one before landed on. `Date.UTC(2027, 1, 30)` answers
 * 2 March, which is the carry this file exists not to make.
 *
 * EVERY FEW MONTHS NAMES ITS MONTH. `every: 3mo` with no `month:` would count from wherever the schedule row happened to
 * be armed, which an edit re-arms from today, so the quarter would move each time somebody fixed a typo in the rule.
 * With `month: jan` the months it falls in are written in the rule, the count divides the year so they are the same
 * months every year, and `1y` is `12mo` falling out of the same code.
 */

/** Months as the rule writes them, January first. */
export const MONTHS: readonly string[] = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The counts of months a clock may step: the ones that divide the year, so every year has the same months. */
export const CALENDAR_STEPS: readonly number[] = [1, 2, 3, 4, 6, 12];

const IN_MONTHS = /^([1-9]\d{0,2})mo$/u;
const IN_YEARS = /^([1-9]\d?)y$/u;
const TIME = /^(\d{1,2}):(\d{2})$/u;

/** A clock of months, read: how many it steps, which it counts from (0 is January), its day and its time. */
export type Calendar = { months: number; month: number; day: number | 'last'; hh: number; mm: number };

/**
 * The months an `every:` steps, when it is written in months (`3mo`) or years (`1y`), or `null` when it is not. Any
 * count, so the lint can say what is wrong with `5mo` rather than calling it unreadable.
 */
export function monthsIn(every: unknown): number | null {
  if (typeof every !== 'string') return null;
  const mo = IN_MONTHS.exec(every);
  if (mo) return Number(mo[1]);
  const y = IN_YEARS.exec(every);
  return y ? Number(y[1]) * 12 : null;
}

/** `HH:MM` as hours and minutes, or `null`. `nextOccurrence`'s reading, so a digest and a clock agree on a time. */
export function timeOf(at: unknown): { hh: number; mm: number } | null {
  const m = typeof at === 'string' ? TIME.exec(at.trim()) : null;
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh <= 23 && mm <= 59 ? { hh, mm } : null;
}

/** Whether `day:` is a day of the month: a whole number from 1 to 31, or `last`. */
export const isMonthDay = (day: unknown): day is number | 'last' => day === 'last' || (Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 31);

/**
 * A trigger's calendar clock, or `null` when it is not one the lint would install. `flow.ts` asks this first, so
 * anything it answers `null` for goes to the interval clock exactly as before.
 */
export function calendarOf(on: { every?: unknown; at?: unknown; day?: unknown; month?: unknown }): Calendar | null {
  const months = monthsIn(on.every);
  const time = timeOf(on.at);
  if (months === null || !CALENDAR_STEPS.includes(months) || time === null || !isMonthDay(on.day)) return null;
  if (months === 1) return on.month === undefined ? { months, month: 0, day: on.day, ...time } : null;
  const month = typeof on.month === 'string' ? MONTHS.indexOf(on.month) : -1;
  return month < 0 ? null : { months, month, day: on.day, ...time };
}

/** The days in a month of the proleptic Gregorian calendar, `month` from 0. Day 0 of the next month is this one's last. */
export const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * The next instant a calendar clock falls on, strictly after `fromMs`.
 *
 * STRICTLY AFTER, because `onClock` asks at the instant a run was due, and an answer equal to it would run the same
 * turn again. And FROM NOW, not from the turn before: a drain that comes a month late takes one turn and is armed for
 * the next one ahead, as a weekly clock is, rather than firing once for every month it missed.
 */
export function nextCalendar(cal: Calendar, fromMs: number, tz: string): number | null {
  const now = wall(fromMs, tz);
  /* THE MONTH WE ARE IN, counted from year zero, then forward to the first one this clock falls in. Three steps is
     enough: this month may be past its day, and the one after is always ahead. */
  let index = now.year * 12 + now.month;
  index += (((cal.month - index) % cal.months) + cal.months) % cal.months;
  for (let step = 0; step < 3; step++, index += cal.months) {
    const year = Math.floor(index / 12);
    const month = index % 12;
    const last = daysIn(year, month);
    const at = instantOf(year, month, cal.day === 'last' ? last : Math.min(cal.day, last), cal.hh, cal.mm, tz);
    if (at > fromMs) return at;
  }
  return null;
}

/**
 * The instant a wall-clock time names in a zone.
 *
 * TWO GUESSES, ONE WITH THE OFFSET A DAY BEFORE AND ONE WITH THE OFFSET A DAY AFTER, since no zone changes twice in
 * two days. The earlier guess that reads back as the time asked for wins, so a time the zone says twice (01:30 on the
 * night New York leaves EDT) is its first. A time the zone skips (02:30 on the night it enters EDT) reads back as
 * neither, and the answer is the one read with the offset in force before the change, which the wall shows as the
 * same distance past the gap: 03:30.
 * THAT IS NOT THE READING `digest.ts`'s `nextOccurrence` GIVES, measured on 25 September in New York: asked for 02:30
 * on 14 March 2027 it answers 01:30 EST, before the gap, and for 01:30 on 7 November 2027 it answers the second one,
 * in EST. So a digest and a monthly rule at the same skipped or repeated time do not run together on those two nights.
 */
function instantOf(year: number, month: number, day: number, hh: number, mm: number, tz: string): number {
  const asUtc = Date.UTC(year, month, day, hh, mm);
  const before = asUtc - offsetAt(asUtc - 86_400_000, tz);
  const after = asUtc - offsetAt(asUtc + 86_400_000, tz);
  for (const at of before <= after ? [before, after] : [after, before]) {
    const w = wall(at, tz);
    if (w.year === year && w.month === month && w.day === day && w.hour === hh && w.minute === mm) return at;
  }
  return before;
}

/** How far a zone's wall is ahead of UTC at an instant, in milliseconds. */
function offsetAt(ms: number, tz: string): number {
  const w = wall(ms, tz);
  return Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second) - (ms - (((ms % 1000) + 1000) % 1000));
}

/** The wall-clock parts of an instant in a zone, month from 0. */
function wall(ms: number, tz: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month) - 1, day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}
