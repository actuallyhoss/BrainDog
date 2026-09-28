/**
 * The clocks the inspector offers, and how a pick or an edit is written, now that the record keeps the calendar
 * (`packages/kernel/src/clock.ts`: every month, or every few, on a day of the month, at a time).
 *
 * A PICK WENT THROUGH `flow.ts`'s `clockOf`, WHICH KEEPS A DAY FOR A WEEK ALONE. Measured on 25 September: from
 * `every: 1mo, day: 31, at: 07:30`, a pick of 3mo wrote `{ every: 3mo }`, and the record refused it as naming no day
 * of the month. So every pick and every edit of a clock is written here, from the clock it was, keeping what the new
 * clock reads and dropping what the lint refuses on it (`flow-lint.ts` `calendarFault`), and a day, a week or anything
 * shorter still goes through `clockOf` exactly as before.
 *
 * NOTHING THE LINT REQUIRES IS LEFT OUT. A monthly clock with no day, no time or (above one month) no month is refused,
 * so a pick from a clock that had none supplies the ones the lint's own fix sentences name: day 1, 09:00, January.
 *
 * WRITTEN HERE AND NOT IMPORTED from the kernel, for the reason `flow.ts` gives: the package has one entry point and
 * `clock.ts` is not on it. `inspector-monthly.test.ts` runs every clock this builds through `validateDeclaration`.
 */

import { often } from '../record/actions.ts';
import { clockOf, type Clock } from './flow.ts';

/*
 * `flow.ts` IMPORTS THIS FILE AND THIS FILE IMPORTS `flow.ts`, so nothing here may read `flow.ts` while the module
 * loads. `CLOCKS` is built as it loads, so the two lists it starts from live here and `flow.ts` re-exports them: with
 * them in `flow.ts`, a test that imported `flow.ts` first threw on a list not yet defined.
 */

/** The clocks under a month. The record's floor is fifteen minutes; a time of day belongs to a day or a week only. */
export const EVERY = ['15m', '1h', '6h', '1d', '1w'] as const;
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Months as the rule writes them, January first. `clock.ts` `MONTHS`. */
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

export const MONTH_WORDS: Readonly<Record<string, string>> = {
  jan: 'January',
  feb: 'February',
  mar: 'March',
  apr: 'April',
  may: 'May',
  jun: 'June',
  jul: 'July',
  aug: 'August',
  sep: 'September',
  oct: 'October',
  nov: 'November',
  dec: 'December',
};

/**
 * The clocks offered: `flow.ts`'s, then the counts of months that divide the year (`clock.ts` `CALENDAR_STEPS`). `1y`
 * and not `12mo`, which is the same clock; a rule that says `12mo` keeps it, drawn as the unlisted option it is.
 */
export const CLOCKS: readonly string[] = [...EVERY, '1mo', '2mo', '3mo', '4mo', '6mo', '1y'];

/** The days of the month a clock can fall on. A day past a month's end falls on its last day, so 31 is every month. */
export const MONTH_DAYS: readonly (number | 'last')[] = [...Array.from({ length: 31 }, (_, i) => i + 1), 'last'];

const STEPS: readonly number[] = [1, 2, 3, 4, 6, 12];

/**
 * How many months a clock is written in (`3mo`, `1y`), any count, or `null` for a clock not written in months.
 * `clock.ts` `monthsIn`, so `5mo` is a clock of months the record refuses, and not a clock it cannot read.
 */
export function inMonths(every: string): number | null {
  const m = /^([1-9]\d{0,2})mo$|^([1-9]\d?)y$/u.exec(every);
  if (!m) return null;
  return m[1] ? Number(m[1]) : Number(m[2]) * 12;
}

/** How many months a clock steps, when it is one the record keeps (`1mo` to `6mo`, `12mo`, `1y`), or `null`. */
export function monthsOf(every: string): number | null {
  const n = inMonths(every);
  return n !== null && STEPS.includes(n) ? n : null;
}

/** The clock and what goes beside it, loosely, because an agent may have written `day: 31` or `day: fri`. */
export type ClockWas = { every?: string; at?: string; day?: unknown; month?: unknown; late?: unknown };

const isMonthDay = (d: unknown): d is number | 'last' => d === 'last' || (Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31);
const isMonth = (m: unknown): m is string => typeof m === 'string' && (MONTHS as readonly string[]).includes(m);
/** A time as `clock.ts` `timeOf` reads one: HH:MM, up to 23:59. */
const isTime = (at: unknown): at is string => {
  const m = typeof at === 'string' ? /^(\d{1,2}):(\d{2})$/u.exec(at.trim()) : null;
  return m !== null && Number(m[1]) <= 23 && Number(m[2]) <= 59;
};

/**
 * The trigger for `every`, carrying from `was` what `every` reads.
 *
 * A DAY OF THE MONTH IS NO WEEKDAY, AND THE OTHER WAY ROUND. `day: 31` carried to a week is refused as not mon to sun,
 * and `day: fri` carried to a month as not 1 to 31, so each clock takes only a day of its own kind and otherwise
 * starts from its default: Monday for a week (`clockOf`), the 1st for a month.
 */
export function clockTo(every: string, was: ClockWas): Clock {
  /* `late:` IS KEPT ACROSS EVERY PICK, since how late a turn may be taken is a question about the turn and not about how
     often it comes. A patch of `late: ''` is the person choosing "however late", and drops it. */
  const late = typeof was.late === 'string' && was.late !== '' ? { late: was.late } : {};
  return { ...clockWithout(every, was), ...late };
}

function clockWithout(every: string, was: ClockWas): Clock {
  const months = monthsOf(every);
  if (months === null) {
    const weekday = typeof was.day === 'string' && (DAYS as readonly string[]).includes(was.day) ? was.day : undefined;
    return clockOf(every, was.at, weekday);
  }
  const at = typeof was.at === 'string' && was.at !== '' ? was.at : '09:00';
  /* A DAY WRITTEN AS `"31"` IS READ AS 31. The lint refuses the string as no day of the month, and reading it as no day
     at all put every edit of such a rule back on the 1st. The number is what is written back. */
  const read = typeof was.day === 'string' && /^\d{1,2}$/u.test(was.day) ? Number(was.day) : was.day;
  const day = isMonthDay(read) ? read : 1;
  const month = months > 1 ? { month: isMonth(was.month) ? was.month : 'jan' } : {};
  return { every, day, at, ...month };
}

/**
 * What the record would refuse about a clock written in months, in one sentence, or `null` when it installs. The same
 * checks in the same order as `flow-lint.ts` `calendarFault`, said to the person at the canvas rather than to an agent.
 * A clock not written in months is not this function's, and answers `null`.
 */
export function calendarFault(on: ClockWas): string | null {
  const every = typeof on.every === 'string' ? on.every : '';
  const months = inMonths(every);
  if (months === null) return null;
  if (!STEPS.includes(months))
    return `Every ${months} months would fall in different months each year. Pick every month, every 2, 3, 4 or 6 months, or every year.`;
  if (on.day === undefined) return 'Say which day of the month it runs on.';
  if (!isMonthDay(on.day)) return `${JSON.stringify(on.day)} is not a day of the month. Pick a day from the 1st to the 31st, or the last day.`;
  if (on.at === undefined) return 'Say what time of day it runs.';
  if (!isTime(on.at)) return `${JSON.stringify(on.at)} is not a time of day. Write it as 09:00.`;
  if (months === 1 && on.month !== undefined) return 'Every month runs in every month, so it has no month to start in. Take the month off.';
  if (months > 1 && on.month === undefined) return 'Say which month it starts in.';
  if (months > 1 && !isMonth(on.month)) return `${JSON.stringify(on.month)} is not a month. Pick one from January to December.`;
  return null;
}

/** The fewest and the most days each month has, January first, for saying where a day past a month's end falls. */
const SHORTEST = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const LONGEST = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * A clock of months as the record says it on Decide (`packages/record/src/automations.ts` `calendarSaid`), less the
 * closing stop, since the canvas's trigger sentences carry none. `null` for a clock `calendarFault` refuses, which is
 * then said as it was written.
 */
export function calendarWords(on: ClockWas): string | null {
  if (calendarFault(on) !== null || typeof on.every !== 'string' || typeof on.at !== 'string' || !isMonthDay(on.day)) return null;
  const months = monthsOf(on.every)!;
  const day = on.day;
  const which = day === 'last' ? 'the last day' : `the ${dayWords(day)}`;
  if (months === 1) {
    const short = day !== 'last' && day > SHORTEST[1]! ? `, or on the last day of a month that has no ${dayWords(day)}` : '';
    return `On ${which} of each month at ${on.at}${short}`;
  }
  const from = (MONTHS as readonly string[]).indexOf(on.month as string);
  const falling = MONTHS.map((_, m) => m).filter((m) => (((m - from) % months) + months) % months === 0);
  const short = day !== 'last' && falling.some((m) => day > SHORTEST[m]!);
  if (months === 12) {
    const name = MONTH_WORDS[MONTHS[from]!]!;
    if (day !== 'last' && day > LONGEST[from]!) return `On the last day of ${name} each year at ${on.at}`;
    return `On ${which} of ${name} each year at ${on.at}${short ? `, or on the last day of ${name} in a year that has no ${dayWords(day as number)}` : ''}`;
  }
  const listed = andWords(falling.map((m) => MONTH_WORDS[MONTHS[m]!]!));
  return `On ${which} of ${listed} at ${on.at}${short ? `, or on the last day of a month that has no ${dayWords(day as number)}` : ''}`;
}

/** `3mo` as a person says it, in `often`'s words, so the list reads as one list. Anything else is `often`'s. */
export function clockWords(every: string): string {
  const months = monthsOf(every);
  if (months === null) return often(every);
  if (months === 12) return 'every year';
  return months === 1 ? 'every month' : `every ${months} months`;
}

/** A day of the month as the list shows it: `1st`, `22nd`, `last day`. */
export function dayWords(day: number | 'last'): string {
  if (day === 'last') return 'last day';
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const tail = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${tail}`;
}

/**
 * The months a clock of months falls in, counted from the month the rule names, January first. `3mo` from `feb` is
 * February, May, August and November, the same months every year, because the count divides the year.
 */
export function fallsIn(every: string, month: string): string[] {
  const months = monthsOf(every);
  const from = (MONTHS as readonly string[]).indexOf(month);
  if (months === null || from < 0) return [];
  const out: string[] = [];
  for (let i = from % months; i < 12; i += months) out.push(MONTH_WORDS[MONTHS[i]!]!);
  return out;
}

/** `February, May, August and November`. `flow.ts` has its own and does not export it. */
export const andWords = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
