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
 * does not read, and neither does a day that is not `YYYY-MM-DD`; those rows are named under the grid by index, as
 * `roadmap` names its own, rather than drawn somewhere a reader could take for a real day.
 *
 * A ROW DATED OUTSIDE THE WEEKS DRAWN IS COUNTED AND SAID, never placed. The busiest day is judged among the days
 * in view only, so a big day in January does not wash September pale; and a day after today is not washed at all,
 * as `days.ts` marks it, because nothing on it has happened yet.
 *
 * ON A PHONE THE GRID IS EIGHT WEEKS, the last eight of these twelve. That is the host's stylesheet hiding the first
 * four columns, not a second plan: the scale stays the twelve weeks', so a day keeps its wash when the page narrows.
 */

import { heatGrid, isDay, washSteps, type Wash } from './days.ts';
import { signedOf } from './bridge.ts';
import { day } from './format.ts';

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
    const d = r.day.trim();
    const v = r.value.trim() === '' ? 1 : signedOf(r.value);
    if (!isDay(d) || !Number.isFinite(v) || v < 0) skipped.push(i);
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
  `${n} ${n === 1 ? 'row falls' : 'rows fall'} outside the twelve weeks to today and ${n === 1 ? 'is' : 'are'} not drawn.`;
