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
import { exponentOf } from './exponent.ts';

/** The buckets a measure may be drawn in. A day for a month or two, a week for a year. */
export const MEASURE_BUCKETS = ['day', 'week'] as const;
export type MeasureBucket = (typeof MEASURE_BUCKETS)[number];

/** How many days a period may be: a year and a day at the outside, two at the least so a line has two points. */
export const MEASURE_BACK = { least: 2, most: 366, fallback: 30 } as const;

/** The most measures one block is handed. A page of charts is a page someone scrolls, not a wall. */
export const MEASURES_MOST = 12;

/**
 * The most readings a grouped block lists (`grouped` below): one line a measure, so forty lines is a page a person reads
 * down once, where forty charts were not.
 */
export const MEASURES_LISTED = 40;

/**
 * One reading as the record holds it: the fields a block named, unconverted, and `of`, the name of the project it was
 * reported for when its list says (`readings` in `index.ts`).
 */
/**
 * One reading as a list holds it. `of` is the project's name, which is drawn; `project` is the project itself, by its id,
 * which only keeps two projects apart and is never drawn, so two projects with no name (or one name) are two measures.
 * `amount` is the reading as money, minor units and a currency, and when it is money it is read in place of `value`.
 */
export type RawReading = { at: unknown; value: unknown; amount?: unknown; name?: unknown; unit?: unknown; of?: unknown; project?: unknown; group?: unknown };

export type MeasureSeries = {
  name: string;
  /**
   * The project the measure was reported for, by its name, when the readings say. Two projects' "Orders" are two
   * measures, each drawn under its own project, and never one line through both projects' numbers.
   */
  of?: string;
  /** The group it is listed under, by the sixth column's value as a person reads it, on a block that names one. */
  group?: string;
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

/**
 * Money, `{ amount, currency }` with the amount in minor units, as a number in major units by the currency's decimals,
 * its unit the code. The store may hand it back as JSON text. Anything else is not money and answers `null`.
 */
function moneyOf(v: unknown): { value: number; unit: string } | null {
  let x = v;
  if (typeof x === 'string' && x.startsWith('{')) {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  if (x === null || typeof x !== 'object') return null;
  const { amount, currency } = x as { amount?: unknown; currency?: unknown };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || typeof currency !== 'string' || currency.trim() === '') return null;
  const code = currency.trim().toUpperCase();
  return { value: amount / 10 ** exponentOf(code), unit: code };
}

/** A unit's currency code, upper case, or `null` when it is not three letters and cannot be one. */
const currencyCode = (unit: string): string | null => (/^[A-Za-z]{3}$/.test(unit) ? unit.toUpperCase() : null);

/** A reading's number and unit: a number, a numeric text, or money, which carries its own currency. */
function readingOf(v: unknown, unit: unknown): { value: number; unit: string } | null {
  const said = typeof unit === 'string' ? unit.trim() : '';
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v, unit: said };
  if (typeof v === 'string' && !v.startsWith('{') && v.trim() !== '' && Number.isFinite(Number(v))) return { value: Number(v), unit: said };
  return moneyOf(v);
}

/** A measure with fewer than two points in the period, which draws no line: its newest reading, said once. */
export type MeasureLatest = {
  measure: string;
  /** The project it was reported for, by its name, as `MeasureSeries.of`. */
  of?: string;
  /** The group it is listed under, as `MeasureSeries.group`. */
  group?: string;
  /** The reading as a number: money in major units of `unit`, as a series holds it. */
  value: number;
  /** A currency code, another unit, or ''. */
  unit: string;
  /** The reading's instant, and the record's local day it fell on. */
  at: string;
  day: string;
};

/** What a `lines` block over readings is handed: the lines worth drawing, and the measures that have only a reading. */
export type MeasureLines = { lines: MeasureSeries[]; latest: MeasureLatest[] };

/**
 * The options both readers take. `fallback` names the measure of a block with no name column, by its heading. `grouped`
 * is a block with a sixth column: every measure is listed under its group, the quiet ones too (`measureLines`).
 */
type MeasureOpts = { nowMs: number; back?: unknown; bucket?: unknown; tz?: string; fallback: string; most?: number; grouped?: boolean; listed?: number };

/** How many points a measure has in the period, which is what a line needs two of. */
const pointsIn = (m: MeasureSeries): number => m.now.reduce<number>((n, v) => n + (v === null ? 0 : 1), 0);

/**
 * How much a measure moved over the period, from its first point to its last, as a share of the larger of the two.
 *
 * A SHARE AND NOT AN AMOUNT, because the measures beside it are in other units: 40 sign-ups more and EGP 4,000 more are
 * not comparable, a doubling and a tenth more are. Bounded by the larger end, so a measure that starts at nought moves
 * by one whole share rather than by infinity, and one that stays at nought does not move.
 */
function movedBy(m: MeasureSeries): number {
  const points = m.now.filter((v): v is number => v !== null);
  if (points.length < 2) return 0;
  const first = points[0]!;
  const last = points.at(-1)!;
  const larger = Math.max(Math.abs(first), Math.abs(last));
  return larger === 0 ? 0 : Math.abs(last - first) / larger;
}

/** Newest reading first, then by name and project, which is the order a measure that did not move is kept in. */
const newestFirst = (a: MeasureSeries & { ms: number }, b: MeasureSeries & { ms: number }): number =>
  b.ms - a.ms || a.name.localeCompare(b.name) || (a.of ?? '').localeCompare(b.of ?? '');

/**
 * A MEASURE THAT HAS ONLY SAID NOUGHT IS NOT DRAWN (leftovers9, the owner 2 Nov: "remove any $0 cards"): "Monthly revenue
 * $0, flat" on a project and on the Dashboard, its newest reading nought and every point in the period and the one
 * before nought or none. One reading that was anything else keeps the whole measure, its noughts with it.
 */
const spoke = (m: MeasureSeries): boolean => !(m.latest !== null && m.latest.value === 0 && [...m.now, ...m.was].every((v) => v === null || v === 0));

/**
 * Every measure the readings hold, each over its period and the period before: those that moved most first, then the
 * rest newest reading first. What a `stat` over readings draws as tiles, where a single reading is still a figure.
 *
 * THE MEASURES THAT MOVED LEAD, because an import that wrote every measure at one instant made "newest first" mean
 * nothing at all, and the tiles were the first of them alphabetically: "Accounts, Pinwheel", "Active7d", "Ad spend30d"
 * (Today 3).
 */
export function measureSeries(readings: Iterable<RawReading>, opts: MeasureOpts): MeasureSeries[] {
  const all = seriesOf(readings, opts).filter(spoke);
  const moved = all.filter((m) => pointsIn(m) >= 2).sort((a, b) => movedBy(b) - movedBy(a) || newestFirst(a, b));
  const still = all.filter((m) => pointsIn(m) < 2).sort(newestFirst);
  return [...moved, ...still].slice(0, opts.most ?? MEASURES_MOST).map(({ ms: _ms, ...m }) => m);
}

/**
 * What a `lines` block over readings draws: a line for each measure with at least two points in the period, ranked by
 * how much it moved, and each measure with one point in the period as its latest reading beside them.
 *
 * A LINE OF ONE POINT IS A DOT UNDER A CHART'S HEADING. Of 267 measures on a real record, 227 had exactly one reading in
 * the period, the import's snapshot of one day, and the block drew a wall of twelve one-dot charts chosen by name. So a
 * measure with one point is said as a number (`latest`), and a measure with none in the period is quiet and drawn as
 * neither. Both are cut to `most`, the lines by how much they moved, the latest readings newest first.
 */
export function measureLines(readings: Iterable<RawReading>, opts: MeasureOpts): MeasureLines {
  const all = seriesOf(readings, opts).filter(spoke);
  const most = opts.most ?? MEASURES_MOST;
  const lines = all
    .filter((m) => pointsIn(m) >= 2)
    .sort((a, b) => movedBy(b) - movedBy(a) || newestFirst(a, b))
    .slice(0, most)
    .map(({ ms: _ms, ...m }) => m);
  /* GROUPED, EVERY MEASURE READ IN THE PERIOD THAT DRAWS NO LINE IS LISTED, under its group: a page of a list's numbers
     says each kind once, so one read twice but past the lines' `most` is listed too rather than missing. A measure with
     no reading in the period is quiet and drawn as neither, as ungrouped. Up to `listed`, a line each. */
  const listed = opts.grouped
    ? all
        .filter((m) => m.latest !== null && pointsIn(m) >= 1 && !lines.some((l) => sameMeasure(l, m)))
        .sort((a, b) => byGroup(a, b) || newestFirst(a, b))
        .slice(0, opts.listed ?? MEASURES_LISTED)
    : all.filter((m) => pointsIn(m) === 1 && m.latest !== null).sort(newestFirst).slice(0, most);
  const latest = listed.map(
    (m): MeasureLatest => ({
      measure: m.name,
      ...(m.of !== undefined ? { of: m.of } : {}),
      ...(m.group !== undefined ? { group: m.group } : {}),
      value: m.latest!.value,
      unit: m.unit,
      at: m.latest!.at,
      day: m.latest!.day,
    }),
  );
  return { lines, latest };
}

/** One measure by what keeps it apart: its name, its project, its group and its unit. */
const sameMeasure = (a: MeasureSeries, b: MeasureSeries): boolean => a.name === b.name && a.of === b.of && a.group === b.group && a.unit === b.unit;

/** Groups by name, the measures with no group after every named one. */
const byGroup = (a: MeasureSeries, b: MeasureSeries): number =>
  a.group === b.group ? 0 : a.group === undefined ? 1 : b.group === undefined ? -1 : a.group.localeCompare(b.group);

/** Every measure the readings hold, each over its period and the period before, in no order, with its newest instant. */
function seriesOf(readings: Iterable<RawReading>, opts: MeasureOpts): (MeasureSeries & { ms: number })[] {
  const bucket = measureBucket(opts.bucket);
  const tz = readableZone(opts.tz);
  const { keys, before } = measureWindow(opts.nowMs, opts.back, bucket, tz);
  const dayOf = localDays(tz);
  const inWindow = new Set([...before, ...keys]);

  type Group = { name: string; of: string | null; group: string | null; unit: string; last: Map<string, { ms: number; value: number }>; latest: { ms: number; value: number; day: string } | null };
  /* ONE GROUP A MEASURE AND PROJECT. By name alone, two projects' "Orders" were one line through both projects' numbers,
     whichever reported last that day standing for the day, and the importer glued the project onto the name to tell them
     apart ("Aov, Oxbow.gg"). */
  const groups = new Map<string, Group>();
  for (const r of readings) {
    if (typeof r.at !== 'string') continue;
    const dated = r.at.length === 10;
    const ms = Date.parse(dated ? `${r.at}T00:00:00Z` : r.at);
    if (!Number.isFinite(ms)) continue;
    /* AN AMOUNT THAT IS MONEY IS THE READING, and a row without one is read from `value` as before, so a measure's older
       decimal rows and its newer money rows, grouped by name and project below, are one line. */
    const reading = moneyOf(r.amount) ?? readingOf(r.value, r.unit);
    if (reading === null) continue;
    const said = typeof r.name === 'string' && r.name.trim() !== '' ? r.name.trim() : opts.fallback;
    const of = typeof r.of === 'string' && r.of.trim() !== '' ? r.of.trim() : null;
    const project = typeof r.project === 'string' ? r.project : null;
    /* AND ITS GROUP, where the block names a sixth column: the same measure in two groups is two lines. */
    const under = typeof r.group === 'string' && r.group.trim() !== '' ? r.group.trim() : null;
    let id = JSON.stringify([said, of, project, under]);
    let group = groups.get(id);
    /* TWO CURRENCIES ARE NEVER ONE LINE. A measure that turns from EUR to JPY under one name drew its yen as euros, under
       the first reading's code; the reading in the other currency is a line of its own, of the same name. */
    const code = currencyCode(reading.unit);
    if (group && code !== null && currencyCode(group.unit) !== null && currencyCode(group.unit) !== code) {
      id = JSON.stringify([said, of, project, under, code]);
      group = groups.get(id);
    }
    if (!group) groups.set(id, (group = { name: said, of, group: under, unit: reading.unit, last: new Map(), latest: null }));
    if (!group.unit && reading.unit) group.unit = reading.unit;
    const day = dated ? r.at : dayOf(ms);
    if (!group.latest || ms >= group.latest.ms) group.latest = { ms, value: reading.value, day };
    const key = bucketOf(day, bucket);
    if (key === null || !inWindow.has(key)) continue;
    const held = group.last.get(key);
    if (!held || ms >= held.ms) group.last.set(key, { ms, value: reading.value });
  }

  return [...groups.values()].map((g): MeasureSeries & { ms: number } => ({
    name: g.name,
    ...(g.of !== null ? { of: g.of } : {}),
    ...(g.group !== null ? { group: g.group } : {}),
    unit: g.unit,
    bucket,
    keys,
    now: keys.map((k) => g.last.get(k)?.value ?? null),
    was: before.map((k) => g.last.get(k)?.value ?? null),
    latest: g.latest ? { value: g.latest.value, at: new Date(g.latest.ms).toISOString(), day: g.latest.day } : null,
    ms: g.latest?.ms ?? 0,
  }));
}
