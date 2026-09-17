/**
 * The numbers a project reports, worked out in the record: one series a measure, the period and the one before.
 *
 * A REGISTER OF READINGS, NOT A FIGURE PER MEASURE. A project sends one number at one moment, and a record holds as
 * many measures as its projects send. A `stat` or `lines` block over such a register names which field is when, which
 * is the value, and optionally which is the measure's name and its unit; this file turns the readings into what the
 * block draws, so the host is handed a few hundred numbers and not every reading of a year of hourly polls.
 *
 * ONE READING A BUCKET, THE LAST. A reported number is a reading of something (the revenue now, the users now), so a
 * bucket's last reading is its value, and a bucket with no reading is a gap and never a zero.
 *
 * THE BUCKETS ARE `buckets.ts`'s, AND A DAY IS THE RECORD'S LOCAL DAY. A reading taken at 23:30 in Auckland belongs to
 * that evening, not to the UTC morning it falls in, so an instant is turned into a local date first and then bucketed.
 * The browser's sample engine calls this same function with the reader's own zone, so both draw one chart.
 */

import { bucketOf, bucketStart, nextBucket, shiftBucket, type Bucket } from './buckets.ts';
import { exponentOf } from './ingest.ts';

/** The buckets a measure may be drawn in. A day for a month or two, a week for a year. */
export const MEASURE_BUCKETS = ['day', 'week'] as const;
export type MeasureBucket = (typeof MEASURE_BUCKETS)[number];

/** How many days a period may be: a year and a day at the outside, two at the least so a line has two points. */
export const MEASURE_BACK = { least: 2, most: 366, fallback: 30 } as const;

/** The most measures one block is handed. A page of charts is a page someone scrolls, not a wall. */
export const MEASURES_MOST = 12;

/** One reading as the record holds it: the fields a block named, unconverted. */
export type RawReading = { at: unknown; value: unknown; name?: unknown; unit?: unknown };

export type MeasureSeries = {
  name: string;
  /** A currency code, another unit, or ''. */
  unit: string;
  bucket: MeasureBucket;
  /** The period's buckets, oldest first, each as `buckets.ts` keys it (a week by its Monday). */
  keys: string[];
  /** The last reading in each bucket of the period, aligned with `keys`. */
  now: (number | null)[];
  /** The last reading in each bucket of the period before, aligned the same way. */
  was: (number | null)[];
  /** The newest reading of all: its value, its instant, and the local day it fell on. */
  latest: { value: number; at: string; day: string } | null;
};

/** How many days a period is, from a block's `back:`. */
export const measurePeriod = (back: unknown): number =>
  typeof back === 'number' && Number.isInteger(back) && back >= MEASURE_BACK.least && back <= MEASURE_BACK.most ? back : MEASURE_BACK.fallback;

/** A block's `bucket:`, or `day`. */
export const measureBucket = (bucket: unknown): MeasureBucket => (bucket === 'week' ? 'week' : 'day');

/** A zone this runtime can read, or `UTC`. */
export function readableZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz === '') return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

const SLOT = 900_000;

/**
 * The local date of an instant in a zone, as `YYYY-MM-DD`.
 *
 * CACHED BY THE QUARTER HOUR, because every zone's offset is a whole number of quarter hours and `Intl` is the slow
 * part of twenty thousand readings. Two instants in one quarter hour are on one local date.
 */
export function localDays(tz: string): (ms: number) => string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: readableZone(tz), year: 'numeric', month: '2-digit', day: '2-digit' });
  const seen = new Map<number, string>();
  return (ms) => {
    const slot = Math.floor(ms / SLOT);
    let day = seen.get(slot);
    if (day === undefined) {
      day = fmt.format(new Date(slot * SLOT));
      seen.set(slot, day);
    }
    return day;
  };
}

/**
 * The period's buckets and the period before's, and the first day a reading in either can fall on.
 *
 * `since` IS A DAY BEFORE THE FIRST, so a query comparing stored instants as text keeps every reading whose local day
 * is in the window whatever the zone's offset, and the buckets drop the rest.
 */
export function measureWindow(nowMs: number, back: unknown, bucket: MeasureBucket, tz: string): { keys: string[]; before: string[]; since: string } {
  const days = measurePeriod(back);
  const n = bucket === 'week' ? Math.ceil(days / 7) : days;
  const today = bucketOf(localDays(tz)(nowMs), bucket)!;
  let at = shiftBucket(today, bucket, -(2 * n - 1));
  const all: string[] = [];
  for (let i = 0; i < 2 * n; i++) {
    all.push(at);
    at = nextBucket(at, bucket);
  }
  const first = Date.parse(`${bucketStart(all[0]!, bucket)}T00:00:00Z`) - 86_400_000;
  return { before: all.slice(0, n), keys: all.slice(n), since: new Date(first).toISOString().slice(0, 10) };
}

/** A reading's number and unit: a number, a numeric text, or money, which carries its own currency. */
function readingOf(v: unknown, unit: unknown): { value: number; unit: string } | null {
  const said = typeof unit === 'string' ? unit.trim() : '';
  let x = v;
  if (typeof x === 'string' && x.startsWith('{')) {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  if (typeof x === 'number' && Number.isFinite(x)) return { value: x, unit: said };
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return { value: Number(x), unit: said };
  if (x !== null && typeof x === 'object') {
    const { amount, currency } = x as { amount?: unknown; currency?: unknown };
    if (typeof amount === 'number' && typeof currency === 'string') return { value: amount / 10 ** exponentOf(currency), unit: currency };
  }
  return null;
}

/**
 * Every measure the readings hold, each over its period and the period before, newest reading first.
 *
 * `fallback` names the measure of a block with no name column, which is one measure named by its heading.
 */
export function measureSeries(
  readings: Iterable<RawReading>,
  opts: { nowMs: number; back?: unknown; bucket?: unknown; tz?: string; fallback: string; most?: number },
): MeasureSeries[] {
  const bucket = measureBucket(opts.bucket);
  const tz = readableZone(opts.tz);
  const { keys, before } = measureWindow(opts.nowMs, opts.back, bucket, tz);
  const dayOf = localDays(tz);
  const inWindow = new Set([...before, ...keys]);

  type Group = { unit: string; last: Map<string, { ms: number; value: number }>; latest: { ms: number; value: number; day: string } | null };
  const groups = new Map<string, Group>();
  for (const r of readings) {
    if (typeof r.at !== 'string') continue;
    const dated = r.at.length === 10;
    const ms = Date.parse(dated ? `${r.at}T00:00:00Z` : r.at);
    if (!Number.isFinite(ms)) continue;
    const reading = readingOf(r.value, r.unit);
    if (reading === null) continue;
    const said = typeof r.name === 'string' && r.name.trim() !== '' ? r.name.trim() : opts.fallback;
    let group = groups.get(said);
    if (!group) groups.set(said, (group = { unit: reading.unit, last: new Map(), latest: null }));
    if (!group.unit && reading.unit) group.unit = reading.unit;
    const day = dated ? r.at : dayOf(ms);
    if (!group.latest || ms >= group.latest.ms) group.latest = { ms, value: reading.value, day };
    const key = bucketOf(day, bucket);
    if (key === null || !inWindow.has(key)) continue;
    const held = group.last.get(key);
    if (!held || ms >= held.ms) group.last.set(key, { ms, value: reading.value });
  }

  return [...groups.entries()]
    .map(([name, g]): MeasureSeries & { ms: number } => ({
      name,
      unit: g.unit,
      bucket,
      keys,
      now: keys.map((k) => g.last.get(k)?.value ?? null),
      was: before.map((k) => g.last.get(k)?.value ?? null),
      latest: g.latest ? { value: g.latest.value, at: new Date(g.latest.ms).toISOString(), day: g.latest.day } : null,
      ms: g.latest?.ms ?? 0,
    }))
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
    .slice(0, opts.most ?? MEASURES_MOST)
    .map(({ ms: _ms, ...m }) => m);
}
