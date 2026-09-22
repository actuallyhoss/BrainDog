/**
 * A comparison read AS OF a day in the past, which is how `snapshot` reads every day it backfills.
 *
 * THE WINDOW BEFORE WAS MOVED FROM THE WRONG CLOCK, AND THEN NOT MOVED AT ALL. `evaluateMetric` moved
 * the clock back from `ctx.nowMs` and handed the moved clock over as `nowMs`, but `predicateOf` reads
 * `asOfMs ?? nowMs`, so with `asOfMs` set the moved clock was never looked at: the window before
 * resolved to exactly the predicate the current window did. The structural check then saw two equal
 * trees and said so. Measured on this file's seed before the repair, sixty days back, with 300,000
 * spent in the thirty days to that day and 150,000 in the thirty before:
 *
 *     delta: null, why: 'the predicate does not mention time, so the window moves nothing'
 *
 * where the same rows read live at that day say `delta: 1`. Had the check not been there, the window
 * before would have been the current one and every backfilled comparison would have read flat.
 *
 * `snapshot` stores the value and not the delta today, so no stored series was wrong. The reading it
 * computes is the one `EvalContext.asOfMs` promises, "the question this metric asks, asked on
 * Tuesday", and a comparison is part of that question.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { deltaFrom, evaluateMetric, openRecord, type Declaration, type EvalContext, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
/* Sixty days back, so the as-of day and its window before are both well clear of the live clock. */
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

/* The shape `index.ts` builds for this register, written out because the kernel hands its own
   `schemaOf` only to the evaluator it calls, and `asOfMs` is only reachable through the evaluator. */
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

/** The Ledger's lead tile, as `metrics-window.test.ts` holds it. */
const SPENT: MetricDecl = {
  metric: 'spent-30d',
  name: 'Spent, 30 days',
  source: 'register.spending',
  where: 'state is cleared, direction is out, on after -31d',
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

/* Twice the spending in the thirty days to the as-of day as in the thirty before it. */
const ROWS: ReadonlyArray<[number, number]> = [[-5, 200_000], [-20, 100_000], [-40, 100_000], [-50, 50_000]];

test('A COMPARISON READ AS OF A PAST DAY MOVES ITS WINDOW BACK FROM THAT DAY', async () => {
  const { sql } = await seeded(NOW, ROWS);
  const r = reading(evaluateMetric(sql, SPENT, asOf(AS_OF)));
  assert.equal(r.value, 300_000, 'the current window is not what is in question');
  assert.equal(r.why, '', `the comparison was refused under asOfMs: ${r.why}`);
  assert.equal(r.delta, deltaFrom(150_000, 300_000));
  assert.equal(r.delta, 1);
  sql.close();
});

test('and it is the reading the same rows give live on that day', async () => {
  /* The parity the task is about: a figure asked as of a day is the figure asked on it. */
  const { k, sql } = await seeded(AS_OF, ROWS);
  const live = reading(k.metric(SPENT));
  sql.close();
  const past = await seeded(NOW, ROWS);
  const backfilled = reading(evaluateMetric(past.sql, SPENT, asOf(AS_OF)));
  past.sql.close();
  assert.deepEqual({ value: backfilled.value, delta: backfilled.delta, why: backfilled.why }, { value: live.value, delta: live.delta, why: live.why });
});

test('`year_ago` under asOfMs reads the year before the as-of day, not the year before now', async () => {
  /* The same rows a year before the as-of day as in the window to it, and nine times as much a year
     before the LIVE clock's window, so a year moved back from `nowMs` cannot read flat. */
  const { sql } = await seeded(NOW, [[-5, 100_000], [-20, 50_000], [-370, 100_000], [-380, 50_000], [60 - 370, 900_000], [60 - 380, 450_000]]);
  const r = reading(evaluateMetric(sql, { ...SPENT, compare: 'year_ago' }, asOf(AS_OF)));
  assert.equal(r.value, 150_000);
  assert.equal(r.why, '', `the comparison was refused under asOfMs: ${r.why}`);
  assert.equal(r.delta, 0, `the same window a year before the as-of day held the same money, and the reading was ${r.delta}`);
  sql.close();
});
