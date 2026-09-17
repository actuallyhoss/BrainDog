/**
 * The numbers a project reports, as tiles and as lines.
 *
 * A REGISTER OF READINGS, NOT A FIGURE PER MEASURE. A project sends one number at one moment (a datapoint), and a
 * founder's record holds as many measures as their projects send: revenue, sign-ups, installs. No page can declare a
 * figure for a measure before the project reports it, so a `stat` or `lines` block over such a register names the
 * register and which field is which, and this file does the rest from the rows the record answered.
 *
 * WHICH FIELD IS WHICH, BY POSITION, as `bar` names its two: the block's `columns:` are when, value, then optionally
 * the measure's name and its unit. A block with no name column is one measure, named by its heading.
 *
 * ONE READING A DAY, THE LAST. A reported number is a reading of something (the revenue now, the users now), so the
 * day's last reading is the day's value, and a day with no reading is a gap and never a zero. `back:` is how many days
 * a period is, thirty when absent, and the period before is the same number of days before it. Days are UTC days.
 */

import { money, quantity } from 'braindog-render';

import { copy } from '../copy.ts';

/** How many days a period may be. A year and a day at the outside, two at the least so a line has two points. */
const BACK = { least: 2, most: 366, fallback: 30 } as const;
/** A stat fence draws six tiles at most (`KINDS.stat.rows`), so a block draws its six most recently reported measures. */
export const TILES_MOST = 6;
/** And a page of charts is a page someone scrolls, not a wall: twelve charts at most per block. */
export const CHARTS_MOST = 12;

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Measure = {
  name: string;
  /** A currency code, another unit, or ''. */
  unit: string;
  /** The period's days, oldest first, as `YYYY-MM-DD`. */
  days: string[];
  /** The last reading of each day of the period, aligned with `days`. */
  now: (number | null)[];
  /** The last reading of each day of the period before, aligned the same way. */
  was: (number | null)[];
  /** The newest reading of all, whenever it was. */
  latest: { value: number; at: number } | null;
};

type Row = { fields: Record<string, unknown> };

/** How many days a period is, from the block's `back:`. */
export const periodOf = (back: unknown): number =>
  typeof back === 'number' && Number.isInteger(back) && back >= BACK.least && back <= BACK.most ? back : BACK.fallback;

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** `17 Sep`, as a person says a day. */
export const dayLabel = (key: string): string => `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1] ?? ''}`;

/** A reading's number and unit: a decimal or an integer, a numeric text, or money, which carries its own currency. */
function readingOf(v: unknown, unit: unknown): { value: number; unit: string } | null {
  const said = typeof unit === 'string' ? unit.trim() : '';
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v, unit: said };
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return { value: Number(v), unit: said };
  if (v !== null && typeof v === 'object') {
    const { amount, currency } = v as { amount?: unknown; currency?: unknown };
    if (typeof amount === 'number' && typeof currency === 'string') return { value: amount / 10 ** exponentOf(currency), unit: currency };
  }
  return null;
}

/** When a reading was: an instant, or a day read as its start. */
function whenOf(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isFinite(ms) ? ms : null;
}

const isCurrency = (unit: string): boolean => /^[A-Z]{3}$/u.test(unit) && exponentOf(unit) >= 0;

/** A currency's minor digits, from `Intl`, or -1 for a code it does not know. */
function exponentOf(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return -1;
  }
}

/** One value as a figure: money in its currency, a quantity with its unit, or a plain number. */
export function figureOf(value: number, unit: string): string {
  if (unit && isCurrency(unit)) return money(Math.round(value * 10 ** exponentOf(unit)), unit);
  return quantity(Math.round(value * 1000) / 1000, unit);
}

/**
 * Every measure the rows hold, each over its period and the period before.
 *
 * `fields` is the block's columns: when, value, name, unit. Ordered by the newest reading first, so the measure a
 * project sent last leads, and two measures with the same newest moment by name.
 */
export function measuresOf(rows: readonly Row[], fields: readonly string[], nowMs: number, back: unknown, fallback: string): Measure[] {
  const [when, val, name, unit] = fields;
  if (!when || !val) return [];
  const period = periodOf(back);
  const end = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate());
  const days = Array.from({ length: period }, (_, i) => dayKey(end - (period - 1 - i) * DAY));
  const before = Array.from({ length: period }, (_, i) => dayKey(end - (2 * period - 1 - i) * DAY));

  const groups = new Map<string, { unit: string; readings: { at: number; value: number }[] }>();
  for (const row of rows) {
    const at = whenOf(row.fields[when]);
    const reading = readingOf(row.fields[val], unit ? row.fields[unit] : undefined);
    if (at === null || reading === null) continue;
    const said = name ? row.fields[name] : fallback;
    const key = typeof said === 'string' && said.trim() !== '' ? said.trim() : fallback;
    const group = groups.get(key) ?? { unit: reading.unit, readings: [] };
    if (!group.unit && reading.unit) group.unit = reading.unit;
    group.readings.push({ at, value: reading.value });
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([measure, group]): Measure => {
      const sorted = group.readings.sort((a, b) => a.at - b.at);
      const lastByDay = new Map<string, number>();
      for (const r of sorted) lastByDay.set(dayKey(r.at), r.value);
      const latest = sorted[sorted.length - 1] ?? null;
      return {
        name: measure,
        unit: group.unit,
        days,
        now: days.map((d) => lastByDay.get(d) ?? null),
        was: before.map((d) => lastByDay.get(d) ?? null),
        latest: latest ? { value: latest.value, at: latest.at } : null,
      };
    })
    .sort((a, b) => (b.latest?.at ?? 0) - (a.latest?.at ?? 0) || a.name.localeCompare(b.name));
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
  if (!now) return m.latest ? copy.measureLastOn(dayLabel(dayKey(m.latest.at))) : '';
  const then = lastOf(m.was.slice(0, now.at + 1));
  if (!then || then.value === 0) return copy.measureNothingBefore(m.days.length);
  const pct = Math.round(((now.value - then.value) / Math.abs(then.value)) * 1000) / 10;
  const said = pct === 0 ? '0%' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('en-u-nu-latn', { maximumFractionDigits: 1 })}%`;
  return copy.measureAgainst(said, m.days.length);
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
 * the measure's name as its heading.
 */
export function linesText(measures: readonly Measure[]): string {
  return measures
    .slice(0, CHARTS_MOST)
    .map((m) => {
      const head = `${escapeCell(copy.seriesAxis.day ?? 'Day')} | ${escapeCell(m.name)} | was: ${escapeCell(copy.measurePrevious(m.days.length))}`;
      const rows = m.days.map((d, i) => {
        const cell = (v: number | null | undefined) => (v === null || v === undefined ? '' : escapeCell(figureOf(v, m.unit)));
        return `${escapeCell(dayLabel(d))} | ${cell(m.now[i])} | ${cell(m.was[i])}`;
      });
      return ['```lines | ' + escapeCell(m.name), head, ...rows, '```'].join('\n');
    })
    .join('\n\n');
}
