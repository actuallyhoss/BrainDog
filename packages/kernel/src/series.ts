/**
 * A `series` block's bars: figures grouped by the same bucket, lined up on one run of buckets.
 *
 * ONE FUNCTION FOR BOTH ENGINES. The record reads each figure in SQL and the sample in the browser,
 * and what is left, choosing which buckets the chart spans and which figure answers each of them, is
 * arithmetic on the readings. It is written once, here, and the browser imports it, so a page drawn
 * from the sample and the same page drawn from a record put the same bars in the same months.
 */

import type { Refusal } from '@braindog/ports';

import { isBucket, shiftBucket, type Bucket } from './buckets.ts';
import type { Part } from './fx.ts';
import type { Group, MetricDecl, Reading } from './metrics.ts';

/** One series on a `series` block: a figure grouped by date, and optionally the figure for buckets still to come. */
export type SeriesLine = {
  metric: string;
  /**
   * The figure that answers the buckets after the current one: money due, where `metric` is money paid. In the current
   * bucket it is added to what was paid so far, so money due later this month is in this month, and the bucket says so.
   */
  then?: string;
  /**
   * A monthly figure counted in every bucket after the current one: what repeats, at its share of a month, where `then`
   * leaves repeating rows out. A repeating bill has one due day, so without this it drew in the one month ahead that
   * day falls in and in none after it. Only on a series bucketed by month.
   */
  each?: string;
  label?: string;
  /**
   * EACH BAR IS THE TOTAL SO FAR: the figure's value in its bucket added to every earlier bucket's, the buckets before the
   * chart's first too, so a plan paid in parts draws what was paid in all by each quarter. A bucket with nothing of its own
   * stands at the total before it, and one before the first value is a gap, as it is on any line.
   */
  running?: boolean;
  /** Money in stands on the zero rule and money out hangs under it. `in` when absent. */
  dir?: 'in' | 'out';
};

/** The buckets a `series` block draws, and each line's value in each, a gap `null`. */
export type Bars = {
  bucket: Bucket;
  current: string;
  keys: string[];
  /**
   * `partial` for the bucket the clock is in, `due` for that bucket when it also holds money due later in it (a line's
   * `then`), `ahead` for one after it, `''` for a finished one.
   */
  states: ('' | 'partial' | 'due' | 'ahead')[];
  /** One row per line, aligned with `keys`. */
  values: (number | null)[][];
  /** The unit every line is in, when they are money. */
  unit: string | null;
  /**
   * LINES IN MORE THAN ONE CURRENCY, ONE CHART EACH. Present when a figure could not be added up in one currency: each
   * entry is every line's values in that currency alone, aligned with `keys`, and `values` and `unit` are the first
   * entry's. Two currencies are never drawn on one scale, so a renderer draws one chart per entry.
   */
  split?: { unit: string; values: (number | null)[][] }[];
};

/** How far back and ahead a series may reach, in buckets. */
export const SERIES_BACK = { least: 1, most: 24, fallback: 6 } as const;
export const SERIES_AHEAD = { least: 0, most: 12, fallback: 0 } as const;
export const SERIES_LINES = 4;

type Read = (decl: MetricDecl) => { ok: true; value: Pick<Reading, 'groups' | 'current' | 'unit'> & { value?: number | null; parts?: Part[] | undefined } } | { ok: false; refusal?: Refusal };

/**
 * The bars, or the one refusal that stops them.
 *
 * EVERY LINE IS BUCKETED THE SAME WAY, because a June bar beside a second-quarter bar is two charts
 * drawn over each other. Every line is in one unit for the reason two currencies are never added.
 * A bucket before the first one any line has a value in is trimmed: data starts there, and a run of
 * gaps before it would read as months where nothing happened (`08 §2.4`).
 */
export function barsOf(
  lines: readonly SeriesLine[] | undefined,
  back: number | undefined,
  ahead: number | undefined,
  metric: (id: string) => MetricDecl | null,
  read: Read,
): { bars: Bars } | { refusal: Refusal } {
  const bad = (code: string, fix: string, at = 'series'): { refusal: Refusal } => ({ refusal: { code, fix, at } });
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > SERIES_LINES)
    return bad('DECLARATION_INVALID', `A series draws one to ${SERIES_LINES} lines, each { metric, then?, label?, dir?, running? }.`);
  const span = (v: number | undefined, b: { least: number; most: number; fallback: number }) =>
    v === undefined ? b.fallback : Number.isInteger(v) && v >= b.least && v <= b.most ? v : null;
  const backs = span(back, SERIES_BACK);
  if (backs === null) return bad('OUT_OF_BOUNDS', `back is a whole number of buckets from ${SERIES_BACK.least} to ${SERIES_BACK.most}.`, 'back');
  const aheads = span(ahead, SERIES_AHEAD);
  if (aheads === null) return bad('OUT_OF_BOUNDS', `ahead is a whole number of buckets from ${SERIES_AHEAD.least} to ${SERIES_AHEAD.most}.`, 'ahead');

  /* HELD ON AN OBJECT, because each line's reading sets them and a narrowed `let` would not see that. */
  const seen: { bucket: Bucket | null; current: string | null; unit: string | null } = { bucket: null, current: null, unit: null };
  const parts: { past: Group[]; then: Group[] | null; each: number | null; eachParts: Part[] | null; eachUnit: string | null; units: (string | null)[]; running: boolean }[] = [];
  /* WHETHER ANY LINE CAME BACK IN MORE THAN ONE CURRENCY, OR TWO LINES IN TWO: then the chart is drawn once per currency. */
  const units = new Set<string>();
  let split = false;

  const one = (id: string): { groups: Group[]; current: string | undefined; unit: string | null } | { refusal: Refusal } => {
    const decl = typeof id === 'string' ? metric(id) : null;
    if (!decl) return bad('METRIC_UNKNOWN', `There is no metric called ${String(id)} for a series to draw.`);
    if (!isBucket(decl.bucket)) return bad('DECLARATION_INVALID', `${id} is not grouped by a date and a bucket, so it has no months to draw.`);
    if (seen.bucket !== null && decl.bucket !== seen.bucket)
      return bad('DECLARATION_INVALID', `${id} is bucketed by ${decl.bucket} and the series by ${seen.bucket}. Every line is bucketed the same way.`);
    seen.bucket = decl.bucket;
    const got = read(decl);
    if (!got.ok) return { refusal: got.refusal ?? { code: 'NOT_IN_THIS_BUILD', fix: `${id} could not be read.`, at: 'series' } };
    return { groups: got.value.groups ?? [], current: got.value.current, unit: got.value.unit };
  };

  for (const line of lines) {
    if (line === null || typeof line !== 'object') return bad('DECLARATION_INVALID', 'Each line of a series is { metric, then?, label?, dir?, running? }.');
    if (line.dir !== undefined && line.dir !== 'in' && line.dir !== 'out') return bad('DECLARATION_INVALID', `dir is in or out, and this one is ${JSON.stringify(line.dir)}.`);
    if (line.running !== undefined && typeof line.running !== 'boolean') return bad('DECLARATION_INVALID', `running is true or false, and this one is ${JSON.stringify(line.running)}.`);
    /* A RUNNING LINE ADDS WHAT IS PAID; money still due later would be added to it twice over, so it takes no then or each. */
    if (line.running === true && (line.then !== undefined || line.each !== undefined)) return bad('DECLARATION_INVALID', 'A running line adds up what its own figure read, so it takes no then or each.');
    const past = one(line.metric);
    if ('refusal' in past) return past;
    const then = line.then === undefined ? null : one(line.then);
    if (then && 'refusal' in then) return then;
    for (const got of [past, then]) {
      if (!got) continue;
      seen.current ??= got.current ?? null;
      if (got.groups.some((g) => g.parts)) split = true;
      for (const g of got.groups) for (const p of g.parts ?? []) units.add(p.currency);
      if (got.unit !== null) {
        if (seen.unit !== null && got.unit !== seen.unit) split = true;
        units.add(got.unit);
        seen.unit ??= got.unit;
      }
    }
    let each: number | null = null;
    let eachParts: Part[] | null = null;
    let eachUnit: string | null = null;
    if (line.each !== undefined) {
      const decl = typeof line.each === 'string' ? metric(line.each) : null;
      if (!decl) return bad('METRIC_UNKNOWN', `There is no metric called ${String(line.each)} for a series to count in every month ahead.`);
      if (decl.group_by !== undefined || decl.bucket !== undefined)
        return bad('DECLARATION_INVALID', `each: counts one figure in every month ahead, and ${line.each} is grouped.`);
      if (seen.bucket !== 'month') return bad('DECLARATION_INVALID', `each: counts a monthly figure, so the series is bucketed by month.`);
      const got = read(decl);
      if (!got.ok) return { refusal: got.refusal ?? { code: 'NOT_IN_THIS_BUILD', fix: `${line.each} could not be read.`, at: 'series' } };
      if (got.value.unit !== null && seen.unit !== null && got.value.unit !== seen.unit) split = true;
      if (got.value.unit !== null) {
        units.add(got.value.unit);
        seen.unit ??= got.value.unit;
      }
      if (got.value.parts) {
        split = true;
        eachParts = got.value.parts;
        for (const p of got.value.parts) units.add(p.currency);
      }
      each = got.value.value ?? null;
      eachUnit = got.value.unit;
    }
    parts.push({ past: past.groups, then: then ? then.groups : null, each, eachParts, eachUnit, units: [past.unit, then ? then.unit : null], running: line.running === true });
  }
  if (seen.bucket === null || seen.current === null) return bad('DECLARATION_INVALID', 'A series needs figures grouped by a date.');

  const b: Bucket = seen.bucket;
  const now: string = seen.current;
  const keys = Array.from({ length: backs + aheads }, (_, i) => shiftBucket(now, b, i - (backs - 1)));
  /* ONE CURRENCY'S VALUES: a group in parts gives its amount in that currency, a group in one unit gives its value when
     that unit is this one, and anything else is a gap. `null` for the whole-record case keeps every value as it is. */
  /* WHETHER ANY LINE ADDED MONEY DUE LATER THIS BUCKET TO WHAT WAS PAID IN IT, which the current bucket then says. */
  let dueNow = false;
  const valuesIn = (unit: string | null) =>
    parts.map(({ past, then, each, eachParts, eachUnit, units: lineUnits, running }) =>
      keys.map((key) => {
        const ahead = key > now && then;
        const one = (group: Group | undefined, own: string | null | undefined): number | null =>
          unit === null
            ? (group?.value ?? null)
            : group?.parts
              ? (group.parts.find((p) => p.currency === unit)?.amount ?? null)
              : own === unit
                ? (group?.value ?? null)
                : null;
        const valueOf = (groups: readonly Group[], own: string | null | undefined): number | null => {
          if (!running) return one(groups.find((g) => g.key === key), own);
          /* THE TOTAL SO FAR: every bucket up to this one, in this currency, and a gap until the first has a value. */
          let sum: number | null = null;
          for (const g of groups) {
            const v = g.key <= key ? one(g, own) : null;
            if (v !== null) sum = (sum ?? 0) + v;
          }
          return sum;
        };
        const paid = valueOf(ahead ? then : past, ahead ? lineUnits[1] : lineUnits[0]);
        /* THE CURRENT BUCKET IS WHAT WAS PAID SO FAR AND WHAT IS STILL DUE IN IT: an invoice due on the 28th is this month's
           money on the 17th, and a chart of only what was paid said the month was short by it. */
        const dueHere = key === now && then ? valueOf(then, lineUnits[1]) : null;
        if (dueHere !== null && dueHere !== 0) dueNow = true;
        const found = dueHere !== null && dueHere !== 0 ? (paid ?? 0) + dueHere : paid;
        const repeat = unit === null || !eachParts ? (unit === null || eachUnit === unit ? each : null) : (eachParts.find((p) => p.currency === unit)?.amount ?? null);
        /* WHAT REPEATS IS IN EVERY MONTH AHEAD, or in none: never only the month its next due day falls in. */
        if (key > now && repeat !== null && repeat !== 0) return (found ?? 0) + repeat;
        return found;
      }),
    );
  const tables = split ? [...units].sort().map((unit) => ({ unit, values: valuesIn(unit) })) : null;
  const values = tables ? (tables[0]?.values ?? parts.map(() => keys.map(() => null))) : valuesIn(null);
  const all = tables ? tables.flatMap((t) => t.values) : values;
  const first = keys.findIndex((_, i) => all.some((line) => line[i] !== null));
  const from = first < 0 ? keys.length : Math.min(first, backs - 1);
  const kept = keys.slice(from);
  return {
    bars: {
      bucket: b,
      current: now,
      keys: kept,
      states: kept.map((key) => (key === now ? (dueNow ? 'due' : 'partial') : key > now ? 'ahead' : '')),
      values: values.map((line) => line.slice(from)),
      unit: tables ? (tables[0]?.unit ?? null) : seen.unit,
      ...(tables ? { split: tables.map((t) => ({ unit: t.unit, values: t.values.map((line) => line.slice(from)) })) } : {}),
    },
  };
}
