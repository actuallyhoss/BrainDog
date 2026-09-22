/**
 * A window over a DEADLINE field that begins before the as-of day, read as of that day.
 *
 * `3858cb4e` DECIDED WHETHER AN AS-OF WINDOW GETS AN END BY ITS FIRST DAY, and that is the wrong
 * question for half the fields. What makes a row dated after the as-of day wrong to count is whether
 * the field says when something HAPPENED (`on`, `done_on`, `settled`) or when something is DUE: a
 * payment on the 10th had not happened on the 5th, and a bill due on the 10th was already owed on the
 * 5th. The audit (`loop/research-batch-twenty-one-audit.md` §6) wrote three open bills due 2 days
 * before and 3 and 12 days after the as-of day, 50,000, 100,000 and 200,000, and measured
 *
 *     state is open, due after -7d   live on the day: 350000 | as of that day, read 60 days later: 50000
 *     state is open, due after -2d   live on the day: 300000 | as of that day, read 60 days later: 0
 *
 * The register already says which kind of field `due` is: Bills, Obligations and five other shipped
 * registers declare it `deadline: true`, and that is the marker read here rather than a guess from
 * the window. A field without it keeps the end, so `on after -30d` still stops at the day
 * (`metrics-asof-end.test.ts`) and a happened-field read as of a past day is unchanged.
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

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'due', type: 'day', index: true, deadline: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

/* THE SCHEMA WITH AND WITHOUT THE MARKER, so the one thing that moves the answer is the declaration. */
const schema = (deadline: boolean): Schema => ({
  register: 'bills',
  state: 'state',
  fields: {
    what: { type: 'text' },
    amount: { type: 'money' },
    due: { type: 'day', ...(deadline ? { deadline: true } : {}) },
    state: { type: 'enum', values: ['open', 'paid'] },
  },
});

const owed = (where: string): MetricDecl => ({
  metric: 'owed',
  name: 'Owed',
  source: 'register.bills',
  where,
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1_000_000 },
  window: '30d',
  compare: 'none',
});

/* The audit's three bills. */
const BILLS_DUE: ReadonlyArray<[number, number]> = [[-2, 50_000], [3, 100_000], [12, 200_000]];

async function seeded(clockMs: number) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(clockMs));
  assert.ok((await k.install([BILLS])).ok);
  for (const [offset, amount] of BILLS_DUE)
    assert.ok(k.create('bills', { what: `bill ${offset}`, amount: { amount, currency: 'GBP' }, due: day(offset), state: 'open' }, { actor: 'p_1' }).ok);
  return { k, sql };
}

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const asOf = (deadline: boolean): EvalContext => ({
  nowMs: NOW,
  asOfMs: AS_OF,
  schemaOf: (register) => (register === 'bills' ? schema(deadline) : null),
});

for (const [where, live] of [['state is open, due after -7d', 350_000], ['state is open, due after -2d', 300_000]] as const) {
  test(`a deadline window that begins before the as-of day keeps its future: ${where}`, async () => {
    /* The live figure is measured here, not copied from the audit: the record opened on the as-of day. */
    const then = await seeded(AS_OF);
    const measured = reading(then.k.metric(owed(where))).value;
    then.sql.close();
    const later = await seeded(NOW);
    const backfilled = reading(evaluateMetric(later.sql, owed(where), asOf(true))).value;
    later.sql.close();
    assert.deepEqual({ live: measured, backfilled }, { live, backfilled: live });
  });
}

test('the same field without the marker still ends at the as-of day', async () => {
  /* The happened-field reading, which every shipped windowed metric relies on: only the bill due on
     or before the as-of day is inside. */
  const { sql } = await seeded(NOW);
  const r = reading(evaluateMetric(sql, owed('state is open, due after -7d'), asOf(false)));
  sql.close();
  assert.equal(r.value, 50_000);
});
