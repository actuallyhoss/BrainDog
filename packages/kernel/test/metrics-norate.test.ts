/**
 * A point in a line needs a rate of its own day (REC-B05, job 2).
 *
 * A ROW IN A SUM TAKES THE NEAREST RATE THERE IS AND SAYS HOW OLD IT IS. A point is drawn as that day's, so a point
 * priced at a rate weeks old, or at a later rate standing in, is a day's figure nobody measured on that day. `snapshot`
 * reads each day as a point (`EvalContext.point`): every amount needs a rate of its own day or the day before, else the
 * figure has no value, the night writes nothing, and the day is counted in `noRate`. The backfill writes every day
 * that holds no point, so the night after a rate arrives fills the gap in.
 *
 *     dollars of the 14th, one rate of the 1st     live: 6000, as of the 1st | the 14th, 15th and 16th: no point
 *     and a rate of the 13th, the night after      the 14th, 15th and 16th: 6000 each
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { evaluateMetric, openRecord, snapshot, type Declaration, type EvalContext, type MetricDecl, type Rate, type Reading } from '../src/index.ts';
import { farRates, pointSaid } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* Noon UTC on 17 September, so the last day a night writes is the 16th. */
const NOW = Date.UTC(2026, 8, 17, 12);

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
      { id: 'on', type: 'day', index: true },
    ],
  } as never,
};

const SCHEMA = { register: 'spending', fields: { what: { type: 'text' }, amount: { type: 'money' }, on: { type: 'day' } } } as Schema;

const SPENT: MetricDecl = {
  metric: 'spent-30d',
  name: 'Spent, 30 days',
  source: 'register.spending',
  where: 'on after -30d',
  value: { sum: 'amount' },
  format: 'money.EGP',
  target: { lte: 1_500_000 },
  window: '30d',
  compare: 'none',
};

const usd = (as_of: string, rate = 50): Rate => ({ currency: 'USD', base: 'EGP', rate, as_of });

/* Pounds on the 10th and a dollar on the 14th: 1000 piastres, and 100 cents that are 5000 piastres at 50. */
const ROWS: ReadonlyArray<[on: string, amount: number, currency: string]> = [
  ['2026-09-10', 1_000, 'EGP'],
  ['2026-09-14', 100, 'USD'],
];

async function spending(rows = ROWS): Promise<NodeSql> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([SPENDING])).ok);
  for (const [on, amount, currency] of rows) assert.ok(k.create('spending', { what: `spent ${on}`, amount: { amount, currency }, on }, { actor: 'p_1' }).ok);
  return sql;
}

const ctxWith = (rates: readonly Rate[]): EvalContext => ({ nowMs: NOW, schemaOf: (register) => (register === 'spending' ? SCHEMA : null), fx: () => ({ home: 'EGP', rates }) });

const night = (sql: NodeSql, rates: readonly Rate[], days = 3) => {
  const out = snapshot(sql, SPENT, ctxWith(rates), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, days);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

const points = (sql: NodeSql): Record<string, number> =>
  Object.fromEntries(sql.all<{ at: string; value: number }>("SELECT at, value FROM metric_point WHERE series = 'spent-30d' AND grain = 'day' ORDER BY at").map((p) => [p.at, p.value]));

const live = (sql: NodeSql, rates: readonly Rate[]): Reading => {
  const out = evaluateMetric(sql, SPENT, ctxWith(rates));
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('A RATE IS NEAR ENOUGH FOR A POINT when it is of the amount’s own day or the day before, and never a later one', () => {
  const dollar = [{ currency: 'USD', amount: 100, day: '2026-09-14' }];
  assert.deepEqual(farRates(dollar, 'EGP', [usd('2026-09-14')], '2026-09-16'), []);
  assert.deepEqual(farRates(dollar, 'EGP', [usd('2026-09-13')], '2026-09-16'), []);
  assert.deepEqual(farRates(dollar, 'EGP', [usd('2026-09-12')], '2026-09-16'), ['USD to EGP'], 'two days old is not that day’s rate');
  assert.deepEqual(farRates(dollar, 'EGP', [usd('2026-09-15')], '2026-09-16'), ['USD to EGP'], 'a later rate stood in');
  assert.deepEqual(farRates(dollar, 'EGP', [], '2026-09-16'), ['USD to EGP']);
  /* AN AMOUNT WITH NO DAY IS DATED THE DAY ASKED ABOUT, and one already in the currency needs no rate at all. */
  assert.deepEqual(farRates([{ currency: 'USD', amount: 100, day: null }], 'EGP', [usd('2026-09-15')], '2026-09-16'), []);
  assert.deepEqual(farRates([{ currency: 'EGP', amount: 100, day: '2026-09-14' }], 'EGP', [], '2026-09-16'), []);
  /* AN AMOUNT DATED AFTER THE POINT, a bill due on the 30th read on the 16th, has no rate of its own day to wait for:
     the newest there can be is the point's, so it is judged against the point's day and not against the 30th. */
  const due = [{ currency: 'USD', amount: 100, day: '2026-09-30' }];
  assert.deepEqual(farRates(due, 'EGP', [usd('2026-09-16')], '2026-09-16'), [], 'a bill not yet due could never be a point');
  assert.deepEqual(farRates(due, 'EGP', [usd('2026-09-15')], '2026-09-16'), []);
  assert.deepEqual(farRates(due, 'EGP', [usd('2026-09-14')], '2026-09-16'), ['USD to EGP']);

  assert.equal(pointSaid(dollar, 'EGP', 'EGP', [usd('2026-09-14')], '2026-09-16'), null);
  assert.equal(pointSaid(dollar, null, null, [], '2026-09-16'), null, 'with no currency to add up in there is no rate to lack');
  assert.deepEqual(pointSaid(dollar, 'EGP', 'EGP', [usd('2026-09-01')], '2026-09-16'), {
    value: null,
    unit: null,
    parts: [{ currency: 'USD', amount: 100 }],
    fx: { into: 'EGP', home: 'EGP', asOf: null, forward: false, stale: false, missing: ['USD to EGP'] },
  });
});

test('A POINT PRICED AT A RATE WEEKS OLD IS NOT WRITTEN, and is written the night after a rate of its day arrives', async () => {
  const sql = await spending();
  const old = [usd('2026-09-01')];

  /* THE TILE STILL ADDS IT UP, and says how old the rate is: a row in a sum takes the nearest rate there is. */
  const tile = live(sql, old);
  assert.equal(tile.value, 6_000);
  assert.equal(tile.fx?.asOf, '2026-09-01');

  /* THE LINE DOES NOT. The 14th, 15th and 16th each hold the dollar, and the 13th holds pounds alone. */
  const first = night(sql, old);
  assert.deepEqual({ wrote: first.wrote, backfilled: first.backfilled, missing: first.missing, noRate: first.noRate }, { wrote: 0, backfilled: 1, missing: 3, noRate: 3 });
  assert.deepEqual(points(sql), { '2026-09-13': 1_000 });

  /* THE NIGHT AFTER A RATE ARRIVES, the days that held no point are filled in and the one that held one keeps it. */
  const second = night(sql, [...old, usd('2026-09-13')]);
  assert.deepEqual({ wrote: second.wrote, backfilled: second.backfilled, missing: second.missing, noRate: second.noRate }, { wrote: 1, backfilled: 2, missing: 0, noRate: 0 });
  assert.deepEqual(points(sql), { '2026-09-13': 1_000, '2026-09-14': 6_000, '2026-09-15': 6_000, '2026-09-16': 6_000 });
  sql.close();
});

test('A LATER RATE STANDING IN WRITES NO POINT, though the tile converts with it and says so', async () => {
  const sql = await spending();
  const later = [usd('2026-09-16')];
  const tile = live(sql, later);
  assert.equal(tile.value, 6_000);
  assert.equal(tile.fx?.forward, true);
  const out = night(sql, later);
  assert.equal(out.noRate, 3);
  assert.deepEqual(points(sql), { '2026-09-13': 1_000 });
  sql.close();
});

test('AN AT-LEAST FIGURE IS NO POINT: the night writes no number for a day a rate did not reach, and counts it', async () => {
  const sql = await spending([...ROWS, ['2026-09-14', 700, 'AED']]);
  const rates = [usd('2026-09-14')];

  /* LIVE, it is at least the pounds and the dollars, with the dirhams listed and no `value`. */
  const tile = live(sql, rates);
  assert.equal(tile.atLeast, true);
  assert.equal(tile.value, null);
  assert.deepEqual(tile.noRate, [{ currency: 'AED', amount: 700 }]);
  assert.deepEqual(tile.parts?.[0], { currency: 'EGP', amount: 6_000 });

  const out = night(sql, rates);
  assert.deepEqual({ wrote: out.wrote, missing: out.missing, noRate: out.noRate }, { wrote: 0, missing: 3, noRate: 3 });
  assert.deepEqual(points(sql), { '2026-09-13': 1_000 }, 'a lower bound was written as the day’s number');
  sql.close();
});

test('A FIGURE IN ONE CURRENCY, AND ONE WITH NO HOME CURRENCY, are kept as before: no rate is asked of either', async () => {
  const pounds = await spending([ROWS[0]!]);
  const one = night(pounds, []);
  assert.deepEqual({ wrote: one.wrote, missing: one.missing, noRate: one.noRate }, { wrote: 1, missing: 0, noRate: 0 });
  pounds.close();

  /* TWO CURRENCIES AND NO HOME CURRENCY: parts, so no point, and the reason is not a rate. */
  const sql = await spending();
  const ctx: EvalContext = { nowMs: NOW, schemaOf: (register) => (register === 'spending' ? SCHEMA : null) };
  const out = snapshot(sql, SPENT, ctx, { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 3);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual({ missing: out.value.missing, noRate: out.value.noRate }, { missing: 3, noRate: 0 });
  sql.close();
});
