/**
 * A walk that never goes under says how far it looked: `beyond` on the reading of `days_to_zero` and `zero_on`.
 *
 * "Lasts until" was a dash on a record whose money outlasts the walk, because no crossing was no value and nothing
 * else. The reading now carries `beyond`, the walk's last day and how many days it looked, BESIDE a value that is still
 * none: a count of days that is really the length of the walk would read as the day the money runs out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { beyondOf } from '../src/money-figures.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* Noon UTC on 20 September. The record has no zone, so its day is the UTC day. */
const NOW = Date.UTC(2026, 8, 20, 12);

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);

const TRANSACTIONS = register('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
]);

const RECURRING = register('recurring', 'Every month', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'every', type: 'enum', values: ['monthly', 'none'], index: true },
  { id: 'next_due', type: 'day', index: true },
]);

const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const CASH = {
  metric: 'cash',
  name: 'Cash now',
  source: 'register.accounts',
  value: { rolled: { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } } },
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};

const LEGS = [{ register: 'recurring', on: 'next_due', amount: 'amount', incoming: { field: 'direction', is: 'in' }, every: { field: 'every', months: { monthly: 1 } } }];

const walk = (id: string, value: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  metric: id,
  name: id,
  source: 'forecast.runway',
  legs: LEGS,
  value,
  format: value.walk === 'zero_on' ? 'day' : value.walk === 'days_to_zero' ? 'days' : 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
  opening: { metric: 'cash' },
  ...extra,
});

const money = (amount: number, currency = 'EGP') => ({ amount, currency });

/** A day as a `format: day` figure holds one: whole days since 1970. */
const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** A record holding one account, stated today, and what is to come. */
async function record(held: { amount: number; currency: string }, coming: Record<string, unknown>[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, TRANSACTIONS, RECURRING, metric(CASH)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('accounts', { name: 'Current', balance: held, as_of: '2026-09-20' }, { actor: 'p_1' }).ok);
  for (const row of coming) {
    const made = k.create('recurring', row, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
  }
  return { k, sql };
}

function read(k: Kernel, decl: Record<string, unknown>): Reading {
  const r = k.metric(decl as never);
  assert.ok(r.ok, r.ok ? '' : JSON.stringify(r));
  return r.value;
}

const COMING = [
  { what: 'Pay', direction: 'in', amount: money(1_000_000), every: 'monthly', next_due: '2026-09-25' },
  { what: 'Rent', direction: 'out', amount: money(400_000), every: 'monthly', next_due: '2026-10-01' },
  { what: 'Tax', direction: 'out', amount: money(20_000_000), every: 'none', next_due: '2026-10-10' },
];

test('A WALK THAT NEVER GOES UNDER says the last day it looked at and how many days that is, beside no value', async () => {
  /* 9,000,000.00 held against a tax of 200,000.00: nothing goes under inside the year this walks by default. */
  const { k, sql } = await record(money(900_000_000), COMING);
  const days = read(k, walk('lasts', { walk: 'days_to_zero' }));
  /* NEVER A NUMBER IN `value`: 365 there would read as the money running out in a year. */
  assert.equal(days.value, null);
  assert.equal(days.unit, null);
  assert.deepEqual(beyondOf(days), { day: '2027-09-20', days: 365 });
  assert.equal(days.why, 'the balance stays above zero for the 365 days this walks');

  /* THE DAY ITSELF IS THE SAME CROSSING SAID ANOTHER WAY, so it looks as far and says so the same. */
  const on = read(k, walk('runs-out', { walk: 'zero_on' }));
  assert.equal(on.value, null);
  assert.deepEqual(beyondOf(on), beyondOf(days));

  /* ITS OWN SPAN, when the figure names one: the tax on 10 October is past a walk of ten days. */
  const near = await record(money(16_800_000), COMING);
  const ten = read(near.k, walk('lasts', { walk: 'days_to_zero', within: '10d' }));
  assert.equal(ten.value, null);
  assert.deepEqual(beyondOf(ten), { day: '2026-09-30', days: 10 });
  near.sql.close();
  sql.close();
});

test('NOTHING COMING AT ALL is still a walk that never goes under', async () => {
  const { k, sql } = await record(money(100_000), []);
  const days = read(k, walk('lasts', { walk: 'days_to_zero' }));
  assert.equal(days.value, null);
  assert.deepEqual(beyondOf(days), { day: '2027-09-20', days: 365 });
  sql.close();
});

test('A WALK THAT GOES UNDER IS UNCHANGED: its value is the crossing and it carries no beyond', async () => {
  /* 168,000.00 held, +10,000.00 on the 25th, -4,000.00 on the 1st, -200,000.00 on the 10th: under on 10 October. */
  const { k, sql } = await record(money(16_800_000), COMING);
  const days = read(k, walk('lasts', { walk: 'days_to_zero' }));
  assert.equal(days.value, 20);
  assert.equal(beyondOf(days), null);
  assert.equal('beyond' in days, false);
  const on = read(k, walk('runs-out', { walk: 'zero_on' }));
  assert.equal(on.value, dayNumber('2026-10-10'));
  assert.equal(beyondOf(on), null);
  sql.close();
});

test('TWO CURRENCIES WITH NO RATE STILL HAVE NO VALUE AND SAY WHY, and that is not a walk that looked to its end', async () => {
  const { k, sql } = await record(money(900_000_000), [...COMING, { what: 'Hosting', direction: 'out', amount: money(5_000, 'USD'), every: 'monthly', next_due: '2026-09-28' }]);
  for (const kind of ['days_to_zero', 'zero_on']) {
    const r = read(k, walk(kind, { walk: kind }));
    assert.equal(r.value, null);
    assert.equal(r.why, 'the walk is in several currencies with no rate to add them');
    assert.equal(beyondOf(r), null);
  }
  sql.close();
});

test('A WALK THAT OPENS BELOW ZERO is under today: day 0, whatever comes later', async () => {
  /* 5,000.00 overdrawn, and the pay on the 25th would lift it: the money has already run out, today. */
  const { k, sql } = await record(money(-500_000), COMING.slice(0, 1));
  const days = read(k, walk('lasts', { walk: 'days_to_zero' }));
  assert.equal(days.value, 0);
  assert.equal(beyondOf(days), null);
  const on = read(k, walk('runs-out', { walk: 'zero_on' }));
  assert.equal(on.value, dayNumber('2026-09-20'));
  assert.equal(beyondOf(on), null);
  sql.close();

  /* AND WITH NOTHING COMING, where no step was there to go under. */
  const bare = await record(money(-500_000), []);
  assert.equal(read(bare.k, walk('lasts', { walk: 'days_to_zero' })).value, 0);
  assert.equal(beyondOf(read(bare.k, walk('lasts', { walk: 'days_to_zero' }))), null);
  bare.sql.close();

  /* NOTHING HELD IS NOT BELOW ZERO: it goes under on the first day money leaves, as it always did. */
  const none = await record(money(0), COMING.slice(1));
  assert.equal(read(none.k, walk('runs-out', { walk: 'zero_on' })).value, dayNumber('2026-10-01'));
  none.sql.close();
});

test('A FIGURE THAT ADDS MONEY UP carries no beyond: only the crossing has a day to be past', async () => {
  const { k, sql } = await record(money(900_000_000), COMING);
  const net = read(k, walk('net', { walk: 'net', within: '30d' }, { opening: undefined }));
  assert.equal(beyondOf(net), null);
  sql.close();
});
