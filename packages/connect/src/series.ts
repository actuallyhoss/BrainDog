/**
 * Extracted rows into metric points: bucket, scale, reduce. `47 §4.7`, `08 §3`.
 *
 * THE REDUCER IS NOT A DETAIL AND THE FIVE KINDS ARE NOT INTERCHANGEABLE. Two rows landing in one
 * bucket mean different things depending on what the series IS: an accumulator adds them, and a
 * level does not. Sum two readings of a bank balance and the chart says the account holds twice
 * what it holds; take the latest of two payments and the day is short by one. There is no sensible
 * default here, which is why `writes.kind` is required for a series and has no fallback.
 *
 * A MISSING BUCKET GETS NO ROW. Absence is the gap (`08 §3`, `25 §8`) — a connector never emits a
 * zero it did not read, because a zero that was never measured is indistinguishable on a chart
 * from a zero that was, and one of them is a provider outage nobody noticed.
 *
 * ROUNDING IS HALF AWAY FROM ZERO, NOT `Math.round`. `Math.round(-0.5)` is `-0` — it rounds half
 * UP, towards positive infinity — so a refund of −0.5 units and a charge of 0.5 units would not be
 * symmetric, and a ledger that is asymmetric about zero is a ledger that drifts in one direction.
 */

import type { Json } from '@braindog/where';

import {
  isSeries, startOfGrain,
  type ExtractedRow, type Grain, type IngestDecl, type MetricPoint, type SeriesKind,
} from './index.ts';

/** Half away from zero, which is what a ledger means by rounding and what `Math.round` does not do. */
const round = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x));

const numberOf = (value: Json | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  /* `43`'s money shape is `{ amount, currency }` in integer minor units (`02 §3`), and the amount
     is the number a series carries; the currency is the register's business and not a point's. */
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.amount === 'number')
    return Number.isFinite(value.amount) ? value.amount : null;
  return null;
};

/** `34 §3`'s integer ceiling. A value past it is a miss rather than a silently wrapped number. */
const INT_MAX = Number.MAX_SAFE_INTEGER;

/** The instant a row's `at` names, or `null` when it names nothing this can bucket. */
const instantOf = (value: Json | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  /* A BARE DATE IS THAT DAY, and `Date.parse` reads `2026-01-15` as UTC midnight, which is what a
     `day` bucket wants before the zone is applied. An instant carries its own offset. */
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

type Bucket = { at: string; value: number; n: number | null; order: number; source: number };

/**
 * `gauge`, `cumulative`, `unique` and `fact` take a READING and `flow` ACCUMULATES.
 *
 * THE TIE-BREAK IS RESPONSE ORDER AND NOT ARRIVAL TIME, because two rows in one bucket often carry
 * the same source `at` — a provider that reports a daily figure twice, corrected. The later row in
 * the response is the correction, and `47 §4.7` says so; a `Map` preserving insertion order is
 * what makes that reproducible rather than incidental.
 *
 * WITH `n` PRESENT A READING IS WEIGHTED. Two hours of a gauge, one over 10 samples and one over
 * 90, average to the 90's value and not to the midpoint — otherwise a quiet hour counts as much as
 * a busy one and the day's figure is wrong in the direction of whatever happened at 4 a.m.
 */
const fold = (kind: SeriesKind, held: Bucket, next: Bucket): Bucket => {
  if (kind === 'flow')
    return {
      ...held,
      value: held.value + next.value,
      n: held.n === null && next.n === null ? null : (held.n ?? 0) + (next.n ?? 0),
    };

  if (held.n !== null && next.n !== null) {
    const total = held.n + next.n;
    return {
      ...next,
      value: total === 0 ? next.value : round((held.value * held.n + next.value * next.n) / total),
      n: total,
    };
  }

  const later = next.source > held.source || (next.source === held.source && next.order > held.order);
  return later ? next : held;
};

/**
 * One run's rows as the points it upserts. Pure.
 *
 * BUFFERED PER RUN AND WRITTEN ONCE (`47 §5.1` step 9), because a page boundary can split a bucket:
 * eleven of a day's transactions on page one and three on page two, reduced separately, is a `flow`
 * written twice and the second write overwriting the first with the smaller number. A window that
 * does not complete writes no points at all.
 */
export function writeSeries(decl: IngestDecl, rows: readonly ExtractedRow[], tz: string): MetricPoint[] {
  if (!isSeries(decl)) return [];
  const { series, kind, unit } = decl.writes;
  const grain: Grain = kind === 'unique' ? 'day' : ((decl.fetch.window?.grain ?? 'day') as Grain);

  const buckets = new Map<string, Bucket>();
  let order = 0;

  for (const row of rows) {
    /* A ROW THE EXTRACTOR COULD NOT READ IS COUNTED AND NEVER WRITTEN (`47 §5.1` step 6.8). A
       `needs-review` point is a number on a chart that nobody agreed to. */
    if (row.confidence === 'needs-review') continue;

    const source = instantOf(row.fields.at);
    const raw = numberOf(row.fields.value);
    if (source === null || raw === null) continue;

    const scaled = round(raw * (typeof row.fields.scale === 'number' ? row.fields.scale : 1));
    if (!Number.isFinite(scaled) || Math.abs(scaled) > INT_MAX) continue;

    const at = startOfGrain(source, grain, tz);
    const n = typeof row.fields.n === 'number' && Number.isFinite(row.fields.n) ? row.fields.n : null;
    const next: Bucket = { at, value: scaled, n, order, source };
    order += 1;

    const held = buckets.get(at);
    buckets.set(at, held === undefined ? next : fold(kind, held, next));
  }

  return [...buckets.values()]
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .map((b) => ({ series, grain, at: b.at, value: b.value, unit, n: b.n }));
}
