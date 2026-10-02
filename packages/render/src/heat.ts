/**
 * What `heat` decides, as functions both drawers call, over the grid `days.ts` has kept ready for it.
 *
 * A heat grid is twelve weeks across and the seven weekdays down, ending on the week that holds today, each day
 * washed in one of four steps of `--info` by how busy it was against the busiest day in view. `days.ts` owns the
 * geometry and the wash (`heatGrid`, `washSteps`), including its two rules that matter here: a week starts on
 * Monday, where the kernel buckets it, and a day nobody wrote is a GAP, never a zero. This file only turns a
 * block's rows into the counts those two functions take, and says what it could not place.
 *
 * A ROW IS A DAY AND HOW MUCH: `day | value`. Two rows on one day are added, as a register's rows on one day are
 * counted together, and a row with no value is one of something. A value that is not a number, or is below zero,
 * does not read, and neither does a day that is no day; those rows are named under the grid by index, as `roadmap`
 * names its own, rather than drawn somewhere a reader could take for a real day.
 *
 * A DAY IS READ IN EITHER SPELLING THIS PACKAGE WRITES, `2026-09-02` and `2 Sep 2026`, as `calendarDay` reads one. The
 * web's page reader projects every cell through `display()`, which writes a day field with `day()`, so People's "In
 * touch, 12 weeks" reached here as `2 Sep 2026`, `1 Sep 2026`, ... and drew no grid at all: only `YYYY-MM-DD` was read,
 * and every row was named under an empty tile as a day that does not read (measured on the seed's People page).
 *
 * A ROW DATED OUTSIDE THE WEEKS DRAWN IS COUNTED AND SAID, never placed. The busiest day is judged among the days
 * in view only, so a big day in January does not wash September pale; and a day after today is not washed at all,
 * as `days.ts` marks it, because nothing on it has happened yet.
 *
 * THE `people` FORM IS `day | who`, one line a person and a dot a week (`heatPeoplePlan`), below.
 *
 * ON A PHONE THE GRID IS EIGHT WEEKS, the last eight of these twelve. That is the host's stylesheet hiding the first
 * four columns, not a second plan: the scale stays the twelve weeks', so a day keeps its wash when the page narrows.
 */

import { calendarDay } from './calendar.ts';
import { heatGrid, washSteps, type Wash } from './days.ts';
import { signedOf } from './bridge.ts';
import { day } from './format.ts';
import { addDays } from './forecast.ts';

/** How many weeks the grid spans. */
export const HEAT_WEEKS = 12;

/** One row as the plan reads it: the day and the value as drawn text. */
export type HeatInput = { day: string; value: string };

/** One day of the grid, in the order a drawer lays them: week by week, Monday first. */
export type HeatCell = {
  day: string;
  /** `null` for a gap, `0` for a day counted empty, `1` to `4` for how busy. Always `null` after today. */
  wash: Wash;
  /** What the rows on this day added up to, as printed, or `null` for a gap. */
  count: string | null;
  today: boolean;
  future: boolean;
};

export type HeatPlan = {
  weeks: number;
  cells: HeatCell[];
  /** The grid's accessible name. */
  name: string;
  /** The rows that did not read, by index. */
  skipped: number[];
  /** How many rows read but fall outside the weeks drawn, before them or after today. */
  outside: number;
  /** No counted day in view: the block is its sentence. */
  empty: boolean;
};

/** Two decimals at most, and no trailing zeros, so a count of hours reads `2.5` and a count of things `3`. */
const said = (n: number): string => String(Math.round(n * 100) / 100);

/** The plan for a block's rows, on the weeks that end with `today`. */
export function heatPlan(rows: readonly HeatInput[], today: string, weeks = HEAT_WEEKS): HeatPlan {
  const grid = heatGrid(today, weeks);
  const inView = new Set(grid.cells.filter((c) => !c.future).map((c) => c.day));
  const counts: Record<string, number> = {};
  const skipped: number[] = [];
  let outside = 0;
  rows.forEach((r, i) => {
    const d = calendarDay(r.day);
    const v = r.value.trim() === '' ? 1 : signedOf(r.value);
    if (d === null || !Number.isFinite(v) || v < 0) skipped.push(i);
    else if (!inView.has(d)) outside++;
    else counts[d] = (counts[d] ?? 0) + v;
  });

  const days = grid.cells.map((c) => c.day);
  const washes = washSteps(counts, days);
  const cells = grid.cells.map((c, i) => ({
    day: c.day,
    wash: c.future ? null : washes[i]!,
    count: Object.hasOwn(counts, c.day) ? said(counts[c.day]!) : null,
    today: c.today,
    future: c.future,
  }));
  const counted = Object.keys(counts).length;
  if (counted === 0) return { weeks, cells: [], name: '', skipped, outside, empty: true };

  /* The busiest day, the earliest of them on a tie, so the sentence names one day the same way every time. */
  const busiest = Object.keys(counts)
    .sort()
    .reduce((best, d) => (counts[d]! > counts[best]! ? d : best));
  const most = counts[busiest]!;
  const head = `${weeks} weeks to ${day(today)}, ${counted} ${counted === 1 ? 'day' : 'days'} counted`;
  const name = most > 0 ? `${head}, the busiest ${day(busiest)} with ${said(most)}.` : `${head}, none with anything in it.`;
  return { weeks, cells, name, skipped, outside, empty: false };
}

/** A cell's hover: the day, and what was on it when anything was counted. Nothing on a day still to come. */
export const heatTitle = (c: HeatCell): string | null => (c.future ? null : c.count === null ? day(c.day) : `${day(c.day)}: ${c.count}`);

/** The counted days in view, oldest first, as the table under the grid says them. */
export const heatLines = (plan: HeatPlan): { day: string; count: string }[] =>
  plan.cells.flatMap((c) => (c.count === null ? [] : [{ day: day(c.day), count: c.count }]));

/** The renderer's own words, as `roadmap.ts` keeps its own: it imports nothing from the app. */
export const HEAT_NONE = 'Nothing here falls in the last twelve weeks.';
export const HEAT_DAY = 'Day';
export const HEAT_VALUE = 'Value';
export const heatSkipped = (said: readonly string[]): string => `Not drawn, because the day or the value does not read: ${said.join(', ')}.`;
export const heatOutside = (n: number): string =>
  `${n} ${n === 1 ? 'day falls' : 'days fall'} outside the twelve weeks to today and ${n === 1 ? 'is' : 'are'} not drawn.`;

/* ── the `people` form: one line a person, a dot a week ───────────────────── */

/** One person's line: who, a mark for each of the weeks drawn, how many of them hold one, and the latest day. */
export type HeatPerson = { who: string; weeks: boolean[]; count: number; last: string };

export type HeatPeoplePlan = {
  weeks: number;
  /** Each week's Monday, oldest first. */
  starts: string[];
  /** The month names along the weeks: the week each month's first Monday falls in, and the first week. */
  ticks: { week: number; label: string }[];
  /** The people with a day in view, the one in touch most lately first, at most `HEAT_PEOPLE_MOST` of them. */
  people: HeatPerson[];
  /** How many more had a day in view and are not drawn. */
  more: number;
  name: string;
  skipped: number[];
  outside: number;
  empty: boolean;
};

/**
 * How many people the lines hold at most. A TILE, NOT A DIRECTORY: a record of forty contacts drew forty lines down the
 * page, so the latest eight are drawn and the rest are counted under them, as the sentence counts everyone.
 */
export const HEAT_PEOPLE_MOST = 8;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The `people` form: `day | who`, one row a time somebody was in touch, drawn as one line a person across the twelve
 * weeks with a dot in each week they were in touch.
 *
 * A DAY GRID OF EIGHTY-FOUR CELLS ANSWERED "WHEN WAS ANYBODY IN TOUCH" AND NOBODY ASKED THAT. People's "In touch, 12
 * weeks" was four black squares in a field of empty ones, with no name on any of them (the people review); the
 * question a person asks is who they have and have not spoken to, so the line is the person and the dots their weeks.
 * ALL TWELVE WEEKS ON A PHONE TOO: a week is a dot, not a column of seven days, so twelve fit beside a name at 390.
 * A row with no day that reads, or nobody named, is named under the chart by index, as the grid names its own. A time
 * in touch before the twelve weeks is counted (`outside`) and not said: on a list of people most were last spoken to
 * long ago, and a line under the chart saying so every time is noise, not news.
 */
export function heatPeoplePlan(rows: readonly { day: string; who: string }[], today: string, weeks = HEAT_WEEKS): HeatPeoplePlan {
  const grid = heatGrid(today, weeks);
  const starts = grid.weeks;
  const inView = new Map(grid.cells.filter((c) => !c.future).map((c, i) => [c.day, Math.floor(i / 7)] as const));
  const by = new Map<string, HeatPerson>();
  const skipped: number[] = [];
  let outside = 0;
  rows.forEach((r, i) => {
    const d = calendarDay(r.day);
    const who = r.who.trim();
    if (d === null || who === '') return void skipped.push(i);
    const week = inView.get(d);
    if (week === undefined) return void outside++;
    const p = by.get(who) ?? { who, weeks: Array.from({ length: weeks }, () => false), count: 0, last: d };
    if (!p.weeks[week]) p.count++;
    p.weeks[week] = true;
    if (d > p.last) p.last = d;
    by.set(who, p);
  });
  const all = [...by.values()].sort((a, b) => (a.last !== b.last ? (a.last < b.last ? 1 : -1) : a.who.localeCompare(b.who)));
  /* A MONTH IS NAMED ON THE WEEK ITS FIRST DAY FALLS IN, which is the week whose Sunday is one of its first seven. The
     first week names its month too, unless the next month is named on the week beside it: a week is a dot's width,
     so at 390 `JulAug` ran into one word. */
  const ticks = starts.flatMap((monday, w) => {
    const sunday = addDays(monday, 6);
    const first = (d: string): boolean => Number(d.slice(8, 10)) <= 7;
    const named = first(sunday) || (w === 0 && !(starts[1] && first(addDays(starts[1], 6))));
    return named ? [{ week: w, label: MONTHS[Number(sunday.slice(5, 7)) - 1]! }] : [];
  });
  const people = all.slice(0, HEAT_PEOPLE_MOST);
  const more = all.length - people.length;
  if (all.length === 0) return { weeks, starts, ticks, people, more, name: '', skipped, outside, empty: true };
  const name = `${weeks} weeks to ${day(today)}, ${all.length} ${all.length === 1 ? 'person' : 'people'} in touch.`;
  return { weeks, starts, ticks, people, more, name, skipped, outside, empty: false };
}

/** A person's dots as words, the name the strip of them carries: `in touch 2 of 12 weeks, last on 2 Sep 2026`. */
export const heatPersonSaid = (p: HeatPerson, weeks: number): string => `in touch ${p.count} of ${weeks} weeks, last on ${day(p.last)}`;

/** A week's hover, on a week with a dot: `week of 31 Aug 2026`. */
export const heatWeekTitle = (monday: string): string => `week of ${day(monday)}`;
/** Under the lines, when more were in touch than are drawn: `3 more people in touch`. */
export const heatPeopleMore = (n: number): string => `${n} more ${n === 1 ? 'person' : 'people'} in touch`;
export const heatMissed = (said: readonly string[]): string => `Not drawn, because the day does not read or nobody is named: ${said.join(', ')}.`;
