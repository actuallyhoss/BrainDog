/**
 * A SUM SAYS WHICH ENTRIES IT ADDED (`backs` on `Reading`), so two figures of one amount can be told apart from one
 * entry read twice. Home's line said "EGP 900 was paid, and EGP 900 came in" about a single payment, because a reading
 * carried the amount and how many entries, and never which.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const LEDGER = {
  id: 'register.transactions',
  kind: 'register' as const,
  body: {
    id: 'transactions',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'direction', type: 'text' },
      { id: 'on', type: 'day', index: true },
    ],
  } as never,
};

const figure = (more: Record<string, unknown> = {}) =>
  ({
    metric: 'received-7d',
    name: 'Received, 7 days',
    source: 'register.transactions',
    where: 'direction is in, on after -7d, on before +1d',
    value: { sum: 'amount' },
    format: 'money',
    target: { gte: 0 },
    window: '7d',
    compare: 'none',
    ...more,
  }) as unknown as MetricDecl;

const open = async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([LEDGER])).ok);
  const add = (what: string, amount: number | null, direction = 'in', on = '2026-09-22') =>
    assert.ok(k.create('transactions', { what, ...(amount === null ? {} : { amount: { amount, currency: 'EGP' } }), direction, on }, { actor: 'p_1' }).ok);
  return { sql, k, add };
};

test('RECEIVED, 7 DAYS NAMES THE ENTRY IT ADDED, and none of the ones its where left out', async () => {
  const { sql, k, add } = await open();
  add('Rent', 40000, 'out');
  add('Nadia paid on InstaPay', 90000);
  add('An old one', 5000, 'in', '2026-08-01');

  const got = k.metric(figure());
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.value.value, 90000);
  assert.equal(got.value.unit, 'EGP');
  assert.equal(got.value.rows, 1);
  assert.deepEqual(got.value.backs, ['transactions#2']);
  assert.equal(got.value.backsMore, undefined, 'nothing is left over, so nothing says so');
  sql.close();
});

test('AN ENTRY THAT HOLDS NO AMOUNT WAS NOT ADDED, so it backs nothing though the where chose it', async () => {
  const { sql, k, add } = await open();
  add('A note with no amount', null);
  add('Deposit', 15000);

  const got = k.metric(figure());
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.value.rows, 2);
  assert.deepEqual(got.value.backs, ['transactions#2']);
  sql.close();
});

test('AT MOST FIFTY ARE NAMED, oldest first, AND THE REST ARE COUNTED', async () => {
  const { sql, k, add } = await open();
  for (let i = 1; i <= 53; i += 1) add(`Sale ${i}`, 100);

  const got = k.metric(figure());
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.value.value, 5300);
  assert.equal(got.value.backs?.length, 50);
  assert.equal(got.value.backs?.[0], 'transactions#1');
  assert.equal(got.value.backs?.[49], 'transactions#50');
  assert.equal(got.value.backsMore, 3);
  sql.close();
});

test('A SUM OF NOTHING AND A COUNT NAME NOTHING, and no other key of the reading moves', async () => {
  const { sql, k, add } = await open();
  const none = k.metric(figure());
  assert.ok(none.ok, JSON.stringify(none));
  assert.equal(none.value.value, 0);
  assert.equal('backs' in none.value, false);

  add('Deposit', 15000);
  const counted = k.metric(figure({ metric: 'received-count', value: { count: 'id' }, format: 'int' }));
  assert.ok(counted.ok, JSON.stringify(counted));
  assert.equal(counted.value.value, 1);
  assert.equal('backs' in counted.value, false);

  const summed = k.metric(figure());
  assert.ok(summed.ok, JSON.stringify(summed));
  const { backs, ...rest } = summed.value;
  assert.deepEqual(backs, ['transactions#1']);
  assert.deepEqual(Object.keys(rest).sort(), ['delta', 'held', 'met', 'refusals', 'rows', 'unit', 'value', 'why']);
  sql.close();
});
