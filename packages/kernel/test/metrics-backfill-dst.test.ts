/**
 * The backfill's thirty days, walked across a day the clocks change on.
 *
 * THE CHECKER OF `d254715a` REASONED THAT THE LOOP COULD SKIP OR DOUBLE A DAY, AND NOBODY HAD RUN IT.
 * `snapshot` found the last instant of local today and stepped back in fixed 24-hour strides, then
 * named each stride's local date. A 25-hour day breaks that: 24 hours back from 23:59:59.999 on the
 * day after it lands at 00:59:59.999 on the same local date as the stride before. So the series never
 * skips a day but names one twice and stops a day short, and on the 25-hour day itself the first
 * stride from its own end is still that day, which stores TODAY's moving figure as if it were
 * yesterday's settled one. The comment above `snapshot` says why that is the one point it must not
 * write: a stored point that later disagrees with the same question asked again is worse than none.
 *
 * A 23-HOUR DAY IS HELD TOO, because the stride goes the other way there and landed an hour early in
 * the right day: it was right, and it has to stay right.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { openRecord, snapshot, type Declaration, type EvalContext, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const SPENDING: Declaration = {
  id: 'register.spending',
  kind: 'register',
  body: {
    id: 'spending',
    name: 'Spending',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', index: true },
    ],
  } as never,
};

const SCHEMA: Schema = { register: 'spending', fields: { what: { type: 'text' }, amount: { type: 'money' } } } as Schema;

/* NO DATE IN THE QUESTION, so every day has the same answer and only the day a point is filed under
   is being measured. */
const SPENT: MetricDecl = {
  metric: 'spent',
  name: 'Spent',
  source: 'register.spending',
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1_500_000 },
  window: '30d',
  compare: 'none',
};

async function run(nowMs: number, tz: string) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(nowMs));
  assert.ok((await k.install([SPENDING])).ok);
  assert.ok(k.create('spending', { what: 'rent', amount: { amount: 100, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  const ctx: EvalContext = { nowMs, schemaOf: (register) => (register === 'spending' ? SCHEMA : null) };
  const out = snapshot(sql, SPENT, ctx, { nowAt: new Date(nowMs).toISOString(), tz }, 30);
  assert.ok(out.ok, JSON.stringify(out));
  const days = sql.all<{ at: string }>("SELECT at FROM metric_point WHERE series = 'spent' AND grain = 'day' ORDER BY at").map((r) => r.at);
  sql.close();
  return { days, wrote: out.value.wrote, backfilled: out.value.backfilled };
}

/** The thirty-one local days ending on `last`, oldest first: yesterday and the thirty before it. */
const expected = (last: string): string[] =>
  Array.from({ length: 31 }, (_, i) => new Date(Date.parse(`${last}T12:00:00Z`) - (30 - i) * 86_400_000).toISOString().slice(0, 10));

const CASES: [label: string, nowMs: number, tz: string, yesterday: string][] = [
  /* Five past midnight GMT on 26 October: yesterday was the 25th, which had 25 hours. */
  ['London, the morning after the 25-hour day', Date.UTC(2026, 9, 26, 0, 5), 'Europe/London', '2026-10-25'],
  /* Noon on the 25-hour day itself: yesterday is the 24th, and nothing may be filed under the 25th. */
  ['London, on the 25-hour day', Date.UTC(2026, 9, 25, 12), 'Europe/London', '2026-10-24'],
  ['New York, the morning after the 25-hour day', Date.UTC(2026, 10, 2, 5, 5), 'America/New_York', '2026-11-01'],
  ['New York, on the 25-hour day', Date.UTC(2026, 10, 1, 17), 'America/New_York', '2026-10-31'],
  /* Five past midnight BST on 30 March: yesterday was the 29th, which had 23 hours. */
  ['London, the morning after the 23-hour day', Date.UTC(2026, 2, 29, 23, 5), 'Europe/London', '2026-03-29'],
];

for (const [label, nowMs, tz, yesterday] of CASES)
  test(`the backfill files one point on each of the thirty-one days: ${label}`, async () => {
    const got = await run(nowMs, tz);
    assert.deepEqual(got.days, expected(yesterday));
    assert.deepEqual([got.wrote, got.backfilled], [1, 30]);
  });
