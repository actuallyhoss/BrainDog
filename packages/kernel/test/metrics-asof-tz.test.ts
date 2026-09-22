/**
 * A snapshot of a record's local yesterday, in a zone either side of UTC.
 *
 * `snapshot` NAMED THE DAY LOCALLY AND ASKED THE QUESTION IN UTC. It handed `evaluateMetric` the last
 * instant of the local day as `asOfMs`, and every reader of `asOfMs` downstream (`resolveDay` for the
 * start, `endedAt` for the end, the fx day) takes the UTC date of that instant. West of UTC the last
 * instant of a local day is the next UTC day: in `America/New_York` the end of 4 September is
 * 03:59:59 UTC on the 5th. So the point stored under 2026-09-04 was the thirty days to the 5th, and
 * with one row on each edge it measured
 *
 *     {"at":"2026-09-04","value":1100}
 *
 * where the thirty days to the 4th hold 110: the row dated the 5th was counted, and the row on the
 * window's first day was dropped. East of UTC the end of a local day is always on the same UTC date,
 * which is why `Asia/Tokyo` was right before the repair; it is held here so the repair cannot move it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { openRecord, snapshot, type Declaration, type EvalContext, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* Noon UTC on 5 September: eight in the morning in New York and nine at night in Tokyo, so local
   yesterday is 4 September in both. */
const NOW = Date.UTC(2026, 8, 5, 12);
const YESTERDAY = '2026-09-04';

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

const SPENT: MetricDecl = {
  metric: 'spent-30d',
  name: 'Spent, 30 days',
  source: 'register.spending',
  where: 'state is cleared, direction is out, on after -30d',
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1_500_000 },
  window: '30d',
  compare: 'none',
};

/* One row on each side of each edge of the thirty days to 4 September, which are 6 August to
   4 September. Each amount is a different power of ten, so the figure names the rows it counted. */
const ROWS: ReadonlyArray<[on: string, amount: number]> = [
  ['2026-08-05', 1],
  ['2026-08-06', 10],
  ['2026-09-04', 100],
  ['2026-09-05', 1_000],
];

async function pointFor(tz: string): Promise<{ at: string; value: number } | undefined> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([SPENDING])).ok);
  for (const [on, amount] of ROWS)
    assert.ok(k.create('spending', { what: `spent ${on}`, direction: 'out', amount: { amount, currency: 'GBP' }, on, state: 'cleared' }, { actor: 'p_1' }).ok);
  const ctx: EvalContext = { nowMs: NOW, schemaOf: (register) => (register === 'spending' ? SCHEMA : null) };
  const out = snapshot(sql, SPENT, ctx, { nowAt: new Date(NOW).toISOString(), tz }, 0);
  assert.ok(out.ok, JSON.stringify(out));
  const point = sql.one<{ at: string; value: number }>("SELECT at, value FROM metric_point WHERE series = 'spent-30d' AND grain = 'day'");
  sql.close();
  /* A plain object, because the row comes back without Object's prototype and `deepEqual` counts that. */
  return point && { at: point.at, value: point.value };
}

test('A RECORD WEST OF UTC STORES ITS LOCAL DAY, NOT THE UTC DAY AFTER IT', async () => {
  assert.deepEqual(await pointFor('America/New_York'), { at: YESTERDAY, value: 110 });
});

test('and a record east of UTC stores the same thirty days', async () => {
  assert.deepEqual(await pointFor('Asia/Tokyo'), { at: YESTERDAY, value: 110 });
});

test('and a record on UTC, which was never wrong, still agrees', async () => {
  assert.deepEqual(await pointFor('UTC'), { at: YESTERDAY, value: 110 });
});
