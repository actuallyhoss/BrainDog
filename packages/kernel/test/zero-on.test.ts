/**
 * The day the money runs out: `walk: zero_on` over `forecast.runway`.
 *
 * `days_to_zero` counts the days to the crossing and `zero_on` names its day, so a tile can say "Runs out 10 Oct". Both
 * walk from the same `opening` and have no value in the same cases. A reading's value is a number, so the day is the
 * whole days since 1970 that name it, as `format: day` already holds the earliest or latest of a day field.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
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
  ...extra,
});

const OPENING = { opening: { metric: 'cash' } };

const money = (amount: number, currency = 'EGP') => ({ amount, currency });

/** A day as a `format: day` figure holds one: whole days since 1970. */
const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** A record holding one account, stated today, and the rows to come. */
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

const refusedAt = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string } };
  return x.ok ? 'installed' : `${x.refusal!.code} at ${String(x.refusal!.at)}`;
};

const COMING = [
  { what: 'Pay', direction: 'in', amount: money(1_000_000), every: 'monthly', next_due: '2026-09-25' },
  { what: 'Rent', direction: 'out', amount: money(400_000), every: 'monthly', next_due: '2026-10-01' },
  { what: 'Tax', direction: 'out', amount: money(20_000_000), every: 'none', next_due: '2026-10-10' },
];

test('THE DAY THE MONEY RUNS OUT is the day the walk first goes under, and the same crossing the count of days is', async () => {
  /* 168,000.00 held, +10,000.00 on the 25th, -4,000.00 on the 1st, -200,000.00 on the 10th: under on 10 October. */
  const { k, sql } = await record(money(16_800_000), COMING);
  const on = read(k, walk('runs-out', { walk: 'zero_on' }, OPENING));
  assert.equal(on.value, dayNumber('2026-10-10'));
  assert.equal(new Date(on.value! * 86_400_000).toISOString().slice(0, 10), '2026-10-10');
  /* A DAY HAS NO CURRENCY, as a count of days has none. */
  assert.equal(on.unit, null);

  const days = read(k, walk('lasts', { walk: 'days_to_zero' }, OPENING));
  assert.equal(days.value, 20);
  assert.equal(on.value, dayNumber('2026-09-20') + days.value!);
  assert.equal(on.rows, days.rows);
  sql.close();
});

test('THE SAME OPENING RULE: nothing held goes under on the first day money leaves', async () => {
  /* Nothing held and no pay coming, so the rent on the 1st is the crossing, nine days before the tax. */
  const { k, sql } = await record(money(0), COMING.slice(1));
  assert.equal(read(k, walk('runs-out', { walk: 'zero_on' }, OPENING)).value, dayNumber('2026-10-01'));
  sql.close();
});

test('NO VALUE WHEN IT NEVER GOES UNDER, as the count of days answers, with the sentence saying so', async () => {
  const { k, sql } = await record(money(900_000_000), COMING);
  const on = read(k, walk('runs-out', { walk: 'zero_on' }, OPENING));
  const days = read(k, walk('lasts', { walk: 'days_to_zero' }, OPENING));
  assert.equal(on.value, null);
  assert.equal(days.value, null);
  assert.deepEqual([on.why, on.unit, on.met], [days.why, days.unit, days.met]);
  assert.equal(on.why, 'the balance stays above zero for the 365 days this walks');

  /* INSIDE ITS OWN SPAN ONLY: the tax on the 10th is past a walk of ten days. */
  const near = await record(money(16_800_000), COMING);
  assert.equal(read(near.k, walk('runs-out', { walk: 'zero_on', within: '10d' }, OPENING)).value, null);
  assert.equal(read(near.k, walk('runs-out', { walk: 'zero_on', within: '30d' }, OPENING)).value, dayNumber('2026-10-10'));
  near.sql.close();
  sql.close();
});

test('TWO CURRENCIES WITH NO RATE HAVE NO DAY, and a walk in another currency than what is held is refused', async () => {
  const mixed = await record(money(16_800_000), [...COMING, { what: 'Hosting', direction: 'out', amount: money(5_000, 'USD'), every: 'monthly', next_due: '2026-09-28' }]);
  const on = read(mixed.k, walk('runs-out', { walk: 'zero_on' }, OPENING));
  assert.equal(on.value, null);
  assert.equal(on.why, 'the walk is in several currencies with no rate to add them');
  mixed.sql.close();

  const other = await record(money(16_800_000), [{ what: 'Hosting', direction: 'out', amount: money(5_000, 'USD'), every: 'monthly', next_due: '2026-09-28' }]);
  assert.equal(refusedAt(other.k.metric(walk('runs-out', { walk: 'zero_on' }, OPENING) as never)), 'MIXED_CURRENCY at opening');
  other.sql.close();
});

test('THE DECLARATION IS CHECKED as the count of days is: an opening, an optional span, and format day', async () => {
  const { k, sql } = await record(money(16_800_000), COMING);
  assert.equal(refusedAt(await k.install([metric(walk('runs-out', { walk: 'zero_on' }, OPENING))])), 'installed');
  assert.equal(refusedAt(await k.install([metric(walk('runs-out-soon', { walk: 'zero_on', within: '90d' }, OPENING))])), 'installed');
  assert.equal(refusedAt(await k.install([metric(walk('no-opening', { walk: 'zero_on' }))])), 'DECLARATION_INVALID at opening');
  assert.equal(refusedAt(await k.install([metric(walk('bad-span', { walk: 'zero_on', within: 'soon' }, OPENING))])), 'DECLARATION_INVALID at value');
  assert.equal(refusedAt(await k.install([metric(walk('no-such', { walk: 'zero_on' }, { opening: { metric: 'nosuch' } }))])), 'METRIC_UNKNOWN at opening');
  /* A WALK NEVER OPENS FROM A WALK, whichever way the crossing is said. */
  assert.equal(refusedAt(await k.install([metric(walk('from-a-walk', { walk: 'zero_on' }, { opening: { metric: 'runs-out' } }))])), 'DECLARATION_INVALID at opening');
  /* AND ONLY THE CROSSING WALKS FROM AN OPENING. */
  assert.equal(refusedAt(await k.install([metric(walk('arriving', { walk: 'in', within: '30d' }, OPENING))])), 'DECLARATION_INVALID at opening');
  /* A DAY IS DRAWN AS A DAY: as a count it is a number near twenty thousand, and a count drawn as a day is 1970. */
  assert.equal(refusedAt(await k.install([metric(walk('as-a-count', { walk: 'zero_on' }, { ...OPENING, format: 'days' }))])), 'DECLARATION_INVALID at format');
  assert.equal(refusedAt(await k.install([metric(walk('as-a-day', { walk: 'days_to_zero' }, { ...OPENING, format: 'day' }))])), 'DECLARATION_INVALID at format');
  sql.close();
});
