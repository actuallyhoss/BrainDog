/**
 * The five kinds, and the one way each of them folds two rows into a bucket.
 *
 * THE KINDS ARE THE TEST. Sum two readings of a bank balance and the chart says the account holds
 * twice what it holds; take the latest of two payments and the day is short by one. Both are wrong
 * by exactly one row, both look plausible, and neither fails anything. So every kind is asserted
 * against the same two rows, and the answers differ.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeSeries, type ExtractedRow, type IngestDecl, type SeriesKind } from '../src/index.ts';

const CAIRO = 'Africa/Cairo';

const decl = (kind: SeriesKind, grain: 'hour' | 'day' | 'month' = 'day'): IngestDecl => ({
  id: 'acme-revenue',
  fetch: {
    base: 'https://api.example.com',
    path: '/v1/things',
    auth: { kind: 'none' },
    schedule: { every: '1h' },
    window: { grain, start: '2026-01-01' },
  },
  writes: { series: 'revenue', kind, unit: 'money.EGP' },
});

const row = (fields: Record<string, unknown>, confidence: ExtractedRow['confidence'] = 'exact'): ExtractedRow => ({
  fields: fields as ExtractedRow['fields'],
  confidence,
  outcome: {},
});

/* ── The five kinds ──────────────────────────────────────────────────────────────────────────── */

const TWO = [row({ at: '2026-01-15T08:00:00Z', value: 100 }), row({ at: '2026-01-15T14:00:00Z', value: 250 })];

test('an accumulator adds and the four readings take the latest', () => {
  assert.equal(writeSeries(decl('flow'), TWO, CAIRO)[0]?.value, 350);
  for (const kind of ['gauge', 'cumulative', 'unique', 'fact'] as const)
    assert.equal(writeSeries(decl(kind), TWO, CAIRO)[0]?.value, 250, kind);
});

/* THE TIE-BREAK IS RESPONSE ORDER, because two rows in one bucket often carry the same source `at`
   — a provider reporting a daily figure twice, corrected. The later row is the correction. */
test('two readings of the same instant resolve to the later one in the response', () => {
  const same = [row({ at: '2026-01-15T08:00:00Z', value: 100 }), row({ at: '2026-01-15T08:00:00Z', value: 180 })];
  assert.equal(writeSeries(decl('gauge'), same, CAIRO)[0]?.value, 180);
  assert.equal(writeSeries(decl('gauge'), [...same].reverse(), CAIRO)[0]?.value, 100);
});

/* WITH `n` PRESENT A READING IS WEIGHTED. Two hours of a gauge, one over 10 samples and one over
   90, average to the 90's value — otherwise a quiet hour counts as much as a busy one and the
   day's figure is wrong in the direction of whatever happened at 4 a.m. */
test('a reading with a sample count is weighted by it, and a flow just adds both', () => {
  const weighted = [row({ at: '2026-01-15T04:00:00Z', value: 10, n: 10 }), row({ at: '2026-01-15T14:00:00Z', value: 110, n: 90 })];
  const gauge = writeSeries(decl('gauge'), weighted, CAIRO)[0];
  assert.equal(gauge?.value, 100, 'the quiet hour counted as much as the busy one');
  assert.equal(gauge?.n, 100);

  const flow = writeSeries(decl('flow'), weighted, CAIRO)[0];
  assert.equal(flow?.value, 120);
  assert.equal(flow?.n, 100);
});

/* ── Buckets ─────────────────────────────────────────────────────────────────────────────────── */

test('the bucket is the grain in the record zone, and rows land where a person there would put them', () => {
  /* 2026-01-15T22:30Z is half past midnight on the 16th in Cairo. */
  const late = [row({ at: '2026-01-15T22:30:00Z', value: 5 })];
  assert.equal(writeSeries(decl('flow'), late, CAIRO)[0]?.at, '2026-01-16');
  assert.equal(writeSeries(decl('flow'), late, 'UTC')[0]?.at, '2026-01-15');
  assert.equal(writeSeries(decl('flow', 'hour'), late, CAIRO)[0]?.at, '2026-01-16T00:00:00Z');
  assert.equal(writeSeries(decl('flow', 'month'), late, CAIRO)[0]?.at, '2026-01');
});

/* `unique` IS PINNED TO ITS DAY AND NEVER WIDENED (`08 §3`). A day's distinct count summed into a
   month is not a month's distinct count; it is a number with no meaning at all. */
test('a distinct count is a day, whatever grain the window declares', () => {
  for (const grain of ['hour', 'day', 'month'] as const)
    assert.equal(writeSeries(decl('unique', grain), [row({ at: '2026-01-15T10:00:00Z', value: 9 })], CAIRO)[0]?.grain, 'day');
});

test('points come back in order, one per bucket, and a gap is a gap', () => {
  const across = [
    row({ at: '2026-01-17T10:00:00Z', value: 3 }),
    row({ at: '2026-01-15T10:00:00Z', value: 1 }),
    row({ at: '2026-01-15T20:00:00Z', value: 2 }),
  ];
  const points = writeSeries(decl('flow'), across, CAIRO);
  assert.deepEqual(points.map((p) => p.at), ['2026-01-15', '2026-01-17']);
  assert.deepEqual(points.map((p) => p.value), [3, 3]);
  /* THE 16TH IS ABSENT AND NOT ZERO. A zero that was never measured looks exactly like one that
     was, and one of the two is a provider outage nobody noticed. */
  assert.equal(points.length, 2);
});

/* ── Scale and rounding ──────────────────────────────────────────────────────────────────────── */

test('scale multiplies before the bucket is folded', () => {
  const scaled = [row({ at: '2026-01-15T10:00:00Z', value: 12.34, scale: 100 })];
  assert.equal(writeSeries(decl('flow'), scaled, CAIRO)[0]?.value, 1234);
});

/* HALF AWAY FROM ZERO AND NOT `Math.round`, which rounds half towards positive infinity — so a
   refund of −0.5 and a charge of 0.5 would not be symmetric, and a ledger that is asymmetric
   about zero drifts in one direction for ever. */
test('rounding is symmetric about zero', () => {
  const one = (value: number): number | undefined =>
    writeSeries(decl('flow'), [row({ at: '2026-01-15T10:00:00Z', value })], CAIRO)[0]?.value;
  assert.equal(one(0.5), 1);
  assert.equal(one(-0.5), -1);
  assert.equal(one(1.5), 2);
  assert.equal(one(-1.5), -2);
  assert.equal(one(2.4), 2);
  assert.equal(one(-2.4), -2);
});

/* ── What never becomes a point ──────────────────────────────────────────────────────────────── */

/* A ROW THE EXTRACTOR COULD NOT READ IS COUNTED AND NEVER WRITTEN. A `needs-review` point is a
   number on a chart that nobody agreed to. */
test('a needs-review row is not a point, and a proposed one is', () => {
  const mixed = [
    row({ at: '2026-01-15T10:00:00Z', value: 100 }, 'needs-review'),
    row({ at: '2026-01-15T11:00:00Z', value: 20 }, 'proposed'),
  ];
  assert.equal(writeSeries(decl('flow'), mixed, CAIRO)[0]?.value, 20);
});

test('a row with no readable at or value is skipped rather than guessed at', () => {
  const unreadable = [
    row({ value: 100 }),
    row({ at: 'last Tuesday', value: 100 }),
    row({ at: '2026-01-15T10:00:00Z' }),
    row({ at: '2026-01-15T10:00:00Z', value: 'a hundred' }),
    row({ at: '2026-01-15T10:00:00Z', value: 7 }),
  ];
  const points = writeSeries(decl('flow'), unreadable, CAIRO);
  assert.equal(points.length, 1);
  assert.equal(points[0]?.value, 7);
});

/* `34 §3`'s INTEGER CEILING. A value past it is a miss rather than a number that quietly loses its
   low digits, because a total that is wrong by a rounding error at 2^53 is still a total. */
test('a value past the integer ceiling is a miss and not a rounded one', () => {
  const huge = [row({ at: '2026-01-15T10:00:00Z', value: 2 ** 60 }), row({ at: '2026-01-16T10:00:00Z', value: 5 })];
  const points = writeSeries(decl('flow'), huge, CAIRO);
  assert.deepEqual(points.map((p) => p.at), ['2026-01-16']);
});

/* `43`'s MONEY IS `{ amount, currency }` IN INTEGER MINOR UNITS. The amount is the number a series
   carries; the currency belongs to `writes.unit` and not to every point. */
test('a money value contributes its minor units', () => {
  const money = [row({ at: '2026-01-15T10:00:00Z', value: { amount: 154_900, currency: 'EGP' } })];
  const point = writeSeries(decl('flow'), money, CAIRO)[0];
  assert.equal(point?.value, 154_900);
  assert.equal(point?.unit, 'money.EGP');
});

test('a declaration that writes a register writes no points at all', () => {
  const register: IngestDecl = { ...decl('flow'), writes: { register: 'transactions' } };
  assert.deepEqual(writeSeries(register, TWO, CAIRO), []);
});
