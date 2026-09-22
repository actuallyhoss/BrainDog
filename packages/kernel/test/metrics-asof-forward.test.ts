/**
 * A FORWARD window read as of a past day, over rows that already existed on that day.
 *
 * `5ae403ff` ENDED EVERY AS-OF WINDOW WITH A START AND NO END AT THE AS-OF DAY, and that is right only
 * for a window that looks back. `on after -30d` is thirty days up to the day asked about, and a row
 * dated after it had not happened yet. `due after today` is the other way round: its whole content
 * is dated after the day, so an end at the day leaves `due > asOf and due < asOf + 1`, which holds
 * nothing. Measured in `loop/research-batch-nineteen-audit.md` §5 over two open bills due 3 and 12
 * days after the as-of day, both written before it:
 *
 *     state is open, due after today   live on the day: 300000 | as of that day, read 60 days later: 0
 *     state is open, due after -1d     live on the day: 300000 | as of that day, read 60 days later: 0
 *
 * `snapshot` writes its series this way, so a person's own "owed from today" figure backfilled as a
 * line of zeros. The rule is now that the end is written only where the window's first day is before
 * the as-of day; a window that begins on the day or later is a question about what is coming, and a
 * live read on that day counted what was coming.
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
      { id: 'due', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

const SCHEMA: Schema = {
  register: 'bills',
  state: 'state',
  fields: {
    what: { type: 'text' },
    amount: { type: 'money' },
    due: { type: 'day' },
    state: { type: 'enum', values: ['open', 'paid'] },
  },
} as Schema;

const owed = (where: string): MetricDecl => ({
  metric: 'owed-ahead',
  name: 'Owed ahead',
  source: 'register.bills',
  where,
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1_000_000 },
  window: '30d',
  compare: 'none',
});

/* Two open bills due 3 and 12 days after the as-of day: 100,000 and 200,000, the audit's 300,000. */
const AHEAD: ReadonlyArray<[number, number]> = [[3, 100_000], [12, 200_000]];

async function seeded(clockMs: number, rows: ReadonlyArray<[offset: number, amount: number]>) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(clockMs));
  assert.ok((await k.install([BILLS])).ok);
  for (const [offset, amount] of rows)
    assert.ok(k.create('bills', { what: `bill ${offset}`, amount: { amount, currency: 'GBP' }, due: day(offset), state: 'open' }, { actor: 'p_1' }).ok);
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
  schemaOf: (register) => (register === 'bills' ? SCHEMA : null),
});

for (const where of ['state is open, due after today', 'state is open, due after -1d'])
  test(`a forward window read as of a past day is what a live read gave on that day: ${where}`, async () => {
    const { k, sql } = await seeded(AS_OF, AHEAD);
    const live = reading(k.metric(owed(where)));
    sql.close();
    const past = await seeded(NOW, AHEAD);
    const backfilled = reading(evaluateMetric(past.sql, owed(where), asOf(AS_OF)));
    past.sql.close();
    assert.deepEqual({ live: live.value, backfilled: backfilled.value }, { live: 300_000, backfilled: 300_000 });
  });

test('a window that begins before the as-of day still ends at it', async () => {
  /* The other side of the line: `due after -2d` begins the day before the as-of day, so it looks back
     and keeps the end `5ae403ff` gave it. The bill due on the as-of day is inside; the two ahead are
     not, exactly as `on after -30d` stops at the day in `metrics-asof-end.test.ts`. */
  const { sql } = await seeded(NOW, [[0, 1_000], ...AHEAD]);
  const r = reading(evaluateMetric(sql, owed('state is open, due after -2d'), asOf(AS_OF)));
  sql.close();
  assert.equal(r.value, 1_000);
});
