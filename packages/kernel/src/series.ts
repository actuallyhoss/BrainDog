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
import type { Group, MetricDecl, Reading } from './metrics.ts';

/** One series on a `series` block: a figure grouped by date, and optionally the figure for buckets still to come. */
export type SeriesLine = {
  metric: string;
  /** The figure that answers the buckets after the current one: money due, where `metric` is money paid. */
  then?: string;
  label?: string;
  /** Money in stands on the zero rule and money out hangs under it. `in` when absent. */
  dir?: 'in' | 'out';
};

/** The buckets a `series` block draws, and each line's value in each, a gap `null`. */
export type Bars = {
  bucket: Bucket;
  current: string;
  keys: string[];
  /** `partial` for the bucket the clock is in, `ahead` for one after it, `''` for a finished one. */
  states: ('' | 'partial' | 'ahead')[];
  /** One row per line, aligned with `keys`. */
  values: (number | null)[][];
  /** The unit every line is in, when they are money. */
  unit: string | null;
};

/** How far back and ahead a series may reach, in buckets. */
export const SERIES_BACK = { least: 1, most: 24, fallback: 6 } as const;
export const SERIES_AHEAD = { least: 0, most: 12, fallback: 0 } as const;
export const SERIES_LINES = 4;

type Read = (decl: MetricDecl) => { ok: true; value: Pick<Reading, 'groups' | 'current' | 'unit'> } | { ok: false; refusal?: Refusal };

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
    return bad('DECLARATION_INVALID', `A series draws one to ${SERIES_LINES} lines, each { metric, then?, label?, dir? }.`);
  const span = (v: number | undefined, b: { least: number; most: number; fallback: number }) =>
    v === undefined ? b.fallback : Number.isInteger(v) && v >= b.least && v <= b.most ? v : null;
  const backs = span(back, SERIES_BACK);
  if (backs === null) return bad('OUT_OF_BOUNDS', `back is a whole number of buckets from ${SERIES_BACK.least} to ${SERIES_BACK.most}.`, 'back');
  const aheads = span(ahead, SERIES_AHEAD);
  if (aheads === null) return bad('OUT_OF_BOUNDS', `ahead is a whole number of buckets from ${SERIES_AHEAD.least} to ${SERIES_AHEAD.most}.`, 'ahead');

  /* HELD ON AN OBJECT, because each line's reading sets them and a narrowed `let` would not see that. */
  const seen: { bucket: Bucket | null; current: string | null; unit: string | null } = { bucket: null, current: null, unit: null };
  const parts: { past: Group[]; then: Group[] | null }[] = [];

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
    if (line === null || typeof line !== 'object') return bad('DECLARATION_INVALID', 'Each line of a series is { metric, then?, label?, dir? }.');
    if (line.dir !== undefined && line.dir !== 'in' && line.dir !== 'out') return bad('DECLARATION_INVALID', `dir is in or out, and this one is ${JSON.stringify(line.dir)}.`);
    const past = one(line.metric);
    if ('refusal' in past) return past;
    const then = line.then === undefined ? null : one(line.then);
    if (then && 'refusal' in then) return then;
    for (const got of [past, then]) {
      if (!got) continue;
      seen.current ??= got.current ?? null;
      if (got.unit !== null) {
        if (seen.unit !== null && got.unit !== seen.unit)
          return bad('MIXED_CURRENCY', `One line of this series is in ${seen.unit} and another in ${got.unit}, and two currencies are never drawn on one scale.`);
        seen.unit = got.unit;
      }
    }
    parts.push({ past: past.groups, then: then ? then.groups : null });
  }
  if (seen.bucket === null || seen.current === null) return bad('DECLARATION_INVALID', 'A series needs figures grouped by a date.');

  const b: Bucket = seen.bucket;
  const now: string = seen.current;
  const keys = Array.from({ length: backs + aheads }, (_, i) => shiftBucket(now, b, i - (backs - 1)));
  const values = parts.map(({ past, then }) =>
    keys.map((key) => {
      const from = key > now && then ? then : past;
      return from.find((g) => g.key === key)?.value ?? null;
    }),
  );
  const first = keys.findIndex((_, i) => values.some((line) => line[i] !== null));
  const from = first < 0 ? keys.length : Math.min(first, backs - 1);
  const kept = keys.slice(from);
  return {
    bars: {
      bucket: b,
      current: now,
      keys: kept,
      states: kept.map((key) => (key === now ? 'partial' : key > now ? 'ahead' : '')),
      values: values.map((line) => line.slice(from)),
      unit: seen.unit,
    },
  };
}
