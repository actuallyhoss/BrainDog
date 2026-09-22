/**
 * A reading AS OF a past day, over a record that has rows dated after that day.
 *
 * THE CURRENT WINDOW HAD A START AND NO END, SO IT ENDED AT TODAY RATHER THAN AT THE AS-OF DAY.
 * `on after -30d` resolved against the as-of clock is "after the day thirty days before it", and
 * nothing said "and not after the day itself", so every row dated between the as-of day and now was
 * counted as if it had already happened. `endedAt` gave the window before an end in `245694a7`; the
 * window it was compared with had none. Measured in `loop/research-batch-seventeen-audit.md` §3 with
 * `metrics-asof.test.ts`'s four rows and 7,000,000 dated ten and forty days after the as-of day:
 *
 *     {"value":14300000,"delta":94.33333333333333,"rows":4}
 *
 * where the thirty days to the as-of day hold 300,000 in two rows. `snapshot` backfills every missing
 * day this way, so a Spent series written by it was the sum from each day's window start to today.
 * `metrics-asof.test.ts` could not see it: its fixture has no row after the as-of day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { evaluateMetric, openRecord, type Declaration, type EvalContext, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const AS_OF = NOW - 60 * DAY;
const day = (offset: number): string => new Date(AS_OF + offset * DAY).toISOString().slice(0, 10);

const SPENDING: Declaration = {
  id: 'register.spending',
  kind: 'register',
  body: {
    id: 'spending',
    name: 'Spending',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'on', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['cleared', 'pending'], index: true },
    ],
  } as never,
};

const SCHEMA: Schema = {
  register: 'spending',
  state: 'state',
  fields: {
    what: { type: 'text' },
    direction: { type: 'enum', values: ['in', 'out'] },
    amount: { type: 'money' },
    on: { type: 'day' },
    state: { type: 'enum', values: ['cleared', 'pending'] },
  },
} as Schema;

/* The seed's spelling since `aeef01c5`, which is the one the audit read. */
const SPENT: MetricDecl = {
  metric: 'spent-30d',
  name: 'Spent, 30 days',
  source: 'register.spending',
  where: 'state is cleared, direction is out, on after -30d',
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1_500_000 },
  window: '30d',
  compare: 'previous',
};

async function seeded(clockMs: number, rows: ReadonlyArray<[offset: number, amount: number]>) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(clockMs));
  assert.ok((await k.install([SPENDING])).ok);
  for (const [offset, amount] of rows)
    assert.ok(
      k.create('spending', { what: `spent ${offset}`, direction: 'out', amount: { amount, currency: 'GBP' }, on: day(offset), state: 'cleared' }, { actor: 'p_1' }).ok,
    );
  return { k, sql };
}

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const asOf = (asOfMs: number): EvalContext => ({
  nowMs: NOW,
  asOfMs,
  schemaOf: (register) => (register === 'spending' ? SCHEMA : null),
});

/* `metrics-asof.test.ts`'s rows: 300,000 in the thirty days to the as-of day and 150,000 in the thirty before. */
const THEN: ReadonlyArray<[number, number]> = [[-5, 200_000], [-20, 100_000], [-40, 100_000], [-50, 50_000]];
/* And what the record went on to hold: three rows dated after the as-of day, the first on the day after it. */
const LATER: ReadonlyArray<[number, number]> = [[1, 7_000_000], [10, 7_000_000], [40, 7_000_000]];

test('A READING AS OF A PAST DAY DOES NOT COUNT ROWS DATED AFTER THAT DAY', async () => {
  const { sql } = await seeded(NOW, [...THEN, ...LATER]);
  const r = reading(evaluateMetric(sql, SPENT, asOf(AS_OF)));
  sql.close();
  assert.deepEqual({ value: r.value, rows: r.rows, delta: r.delta, why: r.why }, { value: 300_000, rows: 2, delta: 1, why: '' });
});

test('and it is what a live read gave on that day, before the later rows were written', async () => {
  const { k, sql } = await seeded(AS_OF, THEN);
  const live = reading(k.metric(SPENT));
  sql.close();
  const past = await seeded(NOW, [...THEN, ...LATER]);
  const backfilled = reading(evaluateMetric(past.sql, SPENT, asOf(AS_OF)));
  past.sql.close();
  assert.deepEqual(
    { value: backfilled.value, rows: backfilled.rows, delta: backfilled.delta, why: backfilled.why },
    { value: live.value, rows: live.rows, delta: live.delta, why: live.why },
  );
});

test('the as-of day itself is inside the window', async () => {
  /* `before` is exclusive of its day, so the end is written as the day after; a row ON the as-of day
     is the last day of the window, as today is the last day of a live one. */
  const { sql } = await seeded(NOW, [[0, 1_000], ...THEN, ...LATER]);
  const r = reading(evaluateMetric(sql, SPENT, asOf(AS_OF)));
  sql.close();
  assert.equal(r.value, 301_000);
});

test('a grouped reading as of a past day ends there too', async () => {
  const { sql } = await seeded(NOW, [...THEN, ...LATER]);
  const r = reading(evaluateMetric(sql, { ...SPENT, compare: 'none', group_by: 'state' }, asOf(AS_OF)));
  sql.close();
  assert.deepEqual(
    (r.groups ?? []).map((g) => [g.key, g.value]),
    [['cleared', 300_000]],
  );
});

test('a live read is left alone: a row dated tomorrow still counts today, as it did', async () => {
  /* The end is written only under `asOfMs`. Live, "up to now" has always included rows dated ahead,
     and changing that is a different question from this one. */
  const { k, sql } = await seeded(AS_OF, [...THEN, [1, 7_000_000]]);
  const live = reading(k.metric({ ...SPENT, compare: 'none' }));
  sql.close();
  assert.equal(live.value, 7_300_000);
});
