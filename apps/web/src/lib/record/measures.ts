/**
 * The numbers a project reports, as tiles and as lines.
 *
 * A REGISTER OF READINGS, NOT A FIGURE PER MEASURE. A project sends one number at one moment (a datapoint), and a
 * founder's record holds as many measures as their projects send: revenue, sign-ups, installs. No page can declare a
 * figure for a measure before the project reports it, so a `stat` or `lines` block over such a register names the
 * register and which field is which, and the record works out one series a measure (`measures.ts` in the kernel).
 *
 * WHICH FIELD IS WHICH, BY POSITION, as `bar` names its two: the block's `columns:` are when, value, then optionally
 * the measure's name and its unit. A block with no name column is one measure, named by its heading.
 *
 * ONE ENGINE. A live record answers the series itself, so a year of hourly readings never reaches the browser; the
 * sample works them out here with the kernel's own function, in the reader's own timezone, so both draw one chart.
 */

import { MEASURE_BACK, measurePeriod, measureSeries, type MeasureSeries } from '@braindog/kernel';
import { exponentOf, money, quantity } from 'braindog-render';

import { copy } from '../copy.ts';
import type { MeasureLatest } from './api.ts';

/** A stat fence draws six tiles at most (`KINDS.stat.rows`), so a block draws its six most recently reported measures. */
export const TILES_MOST = 6;
/** And a page of charts is a page someone scrolls, not a wall: twelve charts at most per block. */
export const CHARTS_MOST = 12;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Measure = MeasureSeries;

type Row = { fields: Record<string, unknown> };

/** How many days a period is, from the block's `back:`. */
export const periodOf = measurePeriod;
export { MEASURE_BACK };

/** The reader's own timezone, which the sample counts a day in. */
const readerZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** `17 Sep`, as a person says a day. */
export const dayLabel = (key: string): string => `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1] ?? ''}`;

/**
 * The codes a unit column may name, which is a question about ISO 4217's list and nothing to do
 * with how many decimals a code takes.
 *
 * MEMBERSHIP AND EXPONENT ARE TWO QUESTIONS AND THIS FILE ANSWERED BOTH WITH ONE CALL. It asked
 * `Intl.NumberFormat` for a currency's minor digits and read a throw as "not a currency", but
 * `Intl.NumberFormat` accepts any three ASCII letters and answers 2 for a code it has never heard
 * of, so the refusal never came and `VAT 1.50` was a spreadsheet's tax column drawn as money. The
 * exponent it returned was CLDR's, which is what a person in that country expects to SEE, while
 * `money()` divides by the minor unit a record STORES: the two disagree on real currencies, and
 * `IQD 1.5` drew `IQD 0.002`. `02 §3` rule 1 settles it: the kernel and the renderer each hold the
 * table, a third copy is not allowed, and nothing in an app reads `maximumFractionDigits` for
 * itself. This file was the third copy.
 *
 * ONE LIST, THE SAME ONE THE RECORD USES. `Intl.supportedValuesOf('currency')` is what
 * `coerce.ts`'s `isCurrencyCode` and `packages/record/src/index.ts` both build from, so a unit this
 * screen draws as money is a unit the record would accept as money, and the exponent comes from
 * `braindog-render` because that is the module that divides by it.
 *
 * THE TWO FUND CODES FALL OUT, AND THAT IS THE LIST BEING HONEST. `CLF` and `UYW` are ISO 4217
 * index units rather than tender, CLDR's list omits them, and the record already refuses them with
 * `CURRENCY_UNKNOWN`. A reading in one draws as a quantity now, which is the true thing to say
 * about a figure the record could not store.
 */
const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

const isCurrency = (unit: string): boolean => CURRENCIES.has(unit);

/** One value as a figure: money in its currency, a quantity with its unit, or a plain number. */
export function figureOf(value: number, unit: string): string {
  if (unit && isCurrency(unit)) return money(Math.round(value * 10 ** exponentOf(unit)), unit);
  return quantity(Math.round(value * 1000) / 1000, unit);
}

/**
 * Every measure the rows hold, each over its period and the period before, as the record works them out.
 *
 * `fields` is the block's columns: when, value, name, unit. Ordered by the newest reading first, so the measure a
 * project sent last leads, and two measures with the same newest moment by name.
 */
export function measuresOf(
  rows: readonly Row[],
  fields: readonly string[],
  nowMs: number,
  back: unknown,
  fallback: string,
  opts: { bucket?: unknown; tz?: string } = {},
): Measure[] {
  const [when, val, name, unit] = fields;
  if (!when || !val) return [];
  const readings = rows.map((r) => ({ at: r.fields[when], value: r.fields[val], name: name ? r.fields[name] : undefined, unit: unit ? r.fields[unit] : undefined }));
  return measureSeries(readings, { nowMs, back, bucket: opts.bucket, tz: opts.tz ?? readerZone(), fallback, most: CHARTS_MOST });
}

const escapeCell = (c: string): string => c.replaceAll('\\', '\\\\').replaceAll('|', '\\|');

/** The last value that is not a gap, and where. */
function lastOf(values: readonly (number | null)[]): { value: number; at: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined) return { value: v, at: i };
  }
  return null;
}

/**
 * The change a tile says under its figure: the period's last reading against the period before at the same point,
 * or why there is none.
 */
export function changeLine(m: Measure): string {
  const now = lastOf(m.now);
  if (!now) return m.latest ? copy.measureLastOn(dayLabel(m.latest.day)) : '';
  const then = lastOf(m.was.slice(0, now.at + 1));
  if (!then || then.value === 0) return copy.measureNothingBefore(m.keys.length, m.bucket === 'week');
  const pct = Math.round(((now.value - then.value) / Math.abs(then.value)) * 1000) / 10;
  const said = pct === 0 ? '0%' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('en-u-nu-latn', { maximumFractionDigits: 1 })}%`;
  return copy.measureAgainst(said, m.keys.length, m.bucket === 'week');
}

/**
 * A `stat` fence's rows: one tile a measure, its newest reading, the change against the period before, and the
 * period's days as its small line.
 */
export function tileRows(measures: readonly Measure[]): string[] {
  return measures.slice(0, TILES_MOST).map((m) => {
    /* A TILE'S FIGURE KEEPS ITS CURRENCY AND DROPS ANY OTHER UNIT, which its name already says: "476 customers" under
       "Active customers" is a tile wrapped over two lines to say one word twice. */
    const figure = m.latest ? figureOf(m.latest.value, isCurrency(m.unit) ? m.unit : '') : '';
    const trend = m.now.some((v) => v !== null) ? ` | ${m.now.map((v) => (v === null ? '-' : String(v))).join(' ')}` : '';
    return `${escapeCell(m.name)} | ${escapeCell(figure)} | ${escapeCell(changeLine(m))}${trend}`;
  });
}

/**
 * The `lines` fences: one chart a measure, the period as the line and the period before as the dashed one, each under
 * the measure's name as its heading. A block hands this only its measures with a line to draw (`linesAndLatest`).
 */
export function linesText(measures: readonly Measure[]): string {
  return measures
    .slice(0, CHARTS_MOST)
    .map((m) => {
      const head = `${escapeCell(copy.seriesAxis[m.bucket] ?? 'Day')} | ${escapeCell(m.name)} | was: ${escapeCell(copy.measurePrevious(m.keys.length, m.bucket === 'week'))}`;
      const rows = m.keys.map((d, i) => {
        const cell = (v: number | null | undefined) => (v === null || v === undefined ? '' : escapeCell(figureOf(v, m.unit)));
        return `${escapeCell(dayLabel(d))} | ${cell(m.now[i])} | ${cell(m.was[i])}`;
      });
      return ['```lines | ' + escapeCell(m.name), head, ...rows, '```'].join('\n');
    })
    .join('\n\n');
}

/** How many points a measure has in its period, which is what a line needs two of: the record's own count. */
const pointsIn = (m: Measure): number => m.now.filter((v) => v !== null && v !== undefined).length;

/**
 * WHAT A `lines` BLOCK DRAWS: a line for each measure with two points or more in the period, and each measure with one
 * as its reading, said once. A measure with none in the period is quiet and drawn as neither.
 *
 * THE RECORD SPLITS THEM ITSELF (`measureLines` in the kernel, which answers `measures` and `latest`), and this is the
 * same split for the measures this tab works out from rows, and for a record on an older kernel, whose `measures` still
 * holds the measures read once: so both draw one page. 227 of the 261 measures a real record had read that month held
 * one reading, and the block was a wall of one-dot charts.
 */
export function linesAndLatest(measures: readonly Measure[], latest?: readonly MeasureLatest[]): { lines: Measure[]; latest: MeasureLatest[] } {
  if (latest) return { lines: [...measures], latest: [...latest] };
  return {
    lines: measures.filter((m) => pointsIn(m) >= 2),
    latest: measures.flatMap((m) => (pointsIn(m) === 1 && m.latest ? [{ measure: m.name, value: m.latest.value, unit: m.unit, at: m.latest.at, day: m.latest.day }] : [])),
  };
}

/** The words this file says for itself, beside the only code that says them, until `copy.ts` holds them. */
export const measureWords = {
  /** The heading over the measures reported once, under the lines of the ones reported more often. */
  readOnce: 'Reported once',
} as const;

/**
 * THE MEASURES READ ONCE, AS ONE QUIET LIST: each measure's name, its reading and the day it was read, a line each, in
 * the record's order (newest first). A list and not a tile a measure (DIRECTION §37: tiles only for figures and charts,
 * and fewer things on screen), headed only where lines stand above it, so it is not taken for one of them.
 */
export function latestText(latest: readonly MeasureLatest[], underLines: boolean): string {
  if (latest.length === 0) return '';
  const rows = latest.slice(0, CHARTS_MOST).map((m) => `${escapeCell(m.measure)} | ${escapeCell(figureOf(m.value, m.unit))} | ${escapeCell(dayLabel(m.day))}`);
  return [`\`\`\`spec${underLines ? ` | ${escapeCell(measureWords.readOnce)}` : ''}`, ...rows, '```'].join('\n');
}
