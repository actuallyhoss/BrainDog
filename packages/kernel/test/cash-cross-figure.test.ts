/**
 * `value: { crosscheck: { of } }` (the nightly half): Cash now less Cash now walked entry by entry from
 * each account's newest statement, a currency at a time. Nought on a record whose figure is right, and the difference
 * the moment one entry is read one minor unit apart.
 *
 * "Wrong money on a screen is the worst class of defect in this repo". The walk and the roll read the same
 * entries, so no honest entry sets them apart: the planted one is an entry the WALK is handed one minor unit heavier
 * than the record holds, through the `Sql` port, which is what a change to either reader's arithmetic looks like.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const OWNER = { actor: 'p_1' };
const day = (offset: number): string => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;
const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day' },
  { id: 'liquid', type: 'bool' },
]);
const BALANCES = register('balances', 'Balance checks', 'source', [
  { id: 'source', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts' },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day' },
]);
const TRANSACTIONS = register('transactions', 'Ledger', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts' },
  { id: 'on', type: 'day' },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'] },
  { id: 'cleared', type: 'bool' },
  { id: 'balance_after', type: 'money' },
]);

/** Cash rolled forward as money-core declares it: two lists restart an account, and only cleared moves count. */
const CASH_NOW = {
  metric: 'cash-now',
  name: 'Cash now',
  source: 'register.accounts',
  where: 'liquid is true',
  value: {
    rolled: {
      balance: 'balance',
      as_of: 'as_of',
      checks: [
        { register: 'balances', by: 'account', balance: 'balance', on: 'as_of' },
        { register: 'transactions', by: 'account', balance: 'balance_after', on: 'on' },
      ],
      moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out', where: 'cleared is true' },
    },
  },
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};
const CHECK = {
  metric: 'cash-cross-check',
  name: 'Cash now, checked against its entries',
  source: 'register.accounts',
  value: { crosscheck: { of: 'cash-now' } },
  format: 'money',
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
};

type Sql = ReturnType<typeof openSqlite>;
type Entry = { id: string; fields: string };

/**
 * The record, and a hand on what the walk is given: a move called "Read wrong" comes back to the walk one minor unit
 * heavier than the record holds. The walk's reads are the ones that select `id, fields` of one account's entries; the
 * roll never does, so the figure it checks is untouched.
 */
const WRONG = 'Read wrong';
async function record(): Promise<Kernel> {
  const real = openSqlite();
  const sql: Sql = Object.create(real) as Sql;
  sql.all = ((text: string, ...params: never[]) => {
    const rows = real.all(text, ...params) as Entry[];
    if (!text.startsWith('SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract') || params[0] !== 'transactions' || !text.includes('cleared')) return rows;
    return rows.map((row) => {
      const fields = JSON.parse(row.fields) as { what: string; amount: { amount: number; currency: string } };
      if (fields.what !== WRONG) return row;
      return { ...row, fields: JSON.stringify({ ...fields, amount: { ...fields.amount, amount: fields.amount.amount + 1 } }) };
    });
  }) as Sql['all'];
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, BALANCES, TRANSACTIONS, metric(CASH_NOW), metric(CHECK)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return k;
}

const money = (amount: number, currency: string) => ({ amount, currency });
const make = (k: Kernel, list: string, fields: Record<string, unknown>): string => {
  const made = k.create(list, fields, OWNER);
  assert.ok(made.ok, JSON.stringify(made));
  return made.value.id;
};

/**
 * A month of an owner's money: a balance check newer than the typed balance, a move before it (not counted), an
 * uncleared move and one dated ahead (neither counted), a transfer out of one account and into the other, an account
 * that is not cash and, with `dollars`, an account whose bank printed its balance after a payment. `wrong` names the
 * currencies with one counted move the walk will read wrong: 30,000 paid in in pounds, 1,000 paid out in dollars.
 */
function write(k: Kernel, dollars: boolean, wrong: string[] = []): void {
  const named = (currency: string) => (wrong.includes(currency) ? { what: WRONG } : {});
  const everyday = make(k, 'accounts', { name: 'Everyday account', liquid: true, balance: money(200_000, 'GBP'), as_of: day(-20) });
  const savings = make(k, 'accounts', { name: 'Savings', liquid: true, balance: money(100_000, 'GBP'), as_of: day(-30) });
  const deposit = make(k, 'accounts', { name: 'Deposit', liquid: false, balance: money(900_000, 'GBP'), as_of: day(-30) });
  make(k, 'balances', { source: 'Statement', account: everyday, balance: money(180_000, 'GBP'), as_of: day(-10) });
  const move = (account: string, on: string, direction: 'in' | 'out', amount: ReturnType<typeof money>, more: Record<string, unknown> = {}) =>
    make(k, 'transactions', { what: 'Movement', on, direction, amount, account, cleared: true, ...more });
  move(everyday, day(-15), 'out', money(5_000, 'GBP'));
  move(everyday, day(-5), 'in', money(30_000, 'GBP'), named('GBP'));
  move(everyday, day(-3), 'out', money(2_000, 'GBP'), { cleared: false });
  move(everyday, day(3), 'out', money(9_000, 'GBP'));
  move(everyday, day(-2), 'out', money(50_000, 'GBP'));
  move(savings, day(-2), 'in', money(50_000, 'GBP'));
  move(deposit, day(-1), 'in', money(1_000, 'GBP'));
  if (!dollars) return;
  const usd = make(k, 'accounts', { name: 'Dollar account', liquid: true, balance: money(120_000, 'USD'), as_of: day(-20) });
  move(usd, day(-7), 'out', money(5_000, 'USD'), { balance_after: money(117_000, 'USD') });
  move(usd, day(-1), 'out', money(1_000, 'USD'), named('USD'));
}

const read = (k: Kernel, body: Record<string, unknown>): Reading => {
  const r = k.metric(body as never);
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

test('in one currency the cross-check reads nought, in that currency, and is met', async () => {
  const k = await record();
  write(k, false);
  /* 180,000 checked + 30,000 in - 50,000 out to Savings; 100,000 + 50,000 in from Everyday. */
  assert.deepEqual([read(k, CASH_NOW).value, read(k, CASH_NOW).unit], [310_000, 'GBP']);
  const check = read(k, CHECK);
  assert.deepEqual([check.value, check.unit, check.met, check.parts], [0, 'GBP', true, undefined]);
  assert.equal(check.rows, 2, 'the accounts walked are the ones Cash now adds up');
});

test('in two currencies it reads nought with no currency, and nothing is added across them', async () => {
  const k = await record();
  write(k, true);
  assert.equal(read(k, CASH_NOW).value, null, 'Cash now added pounds and dollars with no rate between them');
  const check = read(k, CHECK);
  assert.deepEqual([check.value, check.unit, check.met, check.parts], [0, null, true, undefined]);
});

test('one entry the walk reads a minor unit heavier is a difference in its own currency, and a miss', async () => {
  const k = await record();
  write(k, true, ['USD']);
  const check = read(k, CHECK);
  /* The figure less the walk: the walk paid out one cent more, and the pounds agree, so the pounds are not said. */
  assert.deepEqual([check.value, check.unit, check.met, check.parts], [1, 'USD', false, undefined]);
});

test('an entry out in each of two currencies is a part each, never one number', async () => {
  const k = await record();
  write(k, true, ['GBP', 'USD']);
  const check = read(k, CHECK);
  /* A penny under and a cent over: added, they would read nought and pass. */
  assert.deepEqual([check.value, check.unit, check.met], [null, null, false]);
  assert.deepEqual(check.parts, [{ currency: 'GBP', amount: -1 }, { currency: 'USD', amount: 1 }]);
});

test('a home currency changes nothing: the check is still a currency at a time, in whole minor units', async () => {
  const k = await record();
  k.rememberPack({ id: 'money-core', version: '1.0.0', source: 'local', ref: null, manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }), checksum: 'not-a-real-checksum' });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'USD' }, OWNER).ok);
  write(k, false, ['GBP']);
  const check = read(k, CHECK);
  assert.deepEqual([check.value, check.unit, check.met], [-1, 'GBP', false]);
});

test('a difference under nought is a miss, whatever the target says', async () => {
  const k = await record();
  write(k, false, ['GBP']);
  assert.deepEqual([read(k, CHECK).value, read(k, { ...CHECK, target: { gte: -5 } }).met], [-1, false]);
});

test('with no account it has no value, and says no account counts as cash', async () => {
  const k = await record();
  const check = read(k, CHECK);
  assert.deepEqual([check.value, check.unit, check.met, check.why], [null, null, null, 'No account counts as cash yet']);
});

test('with an account and none of them cash it has no value, and says the same sentence', async () => {
  const k = await record();
  make(k, 'accounts', { name: 'Deposit', liquid: false, balance: money(900_000, 'GBP'), as_of: day(-30) });
  const check = read(k, CHECK);
  assert.deepEqual([check.value, check.unit, check.met, check.why], [null, null, null, 'No account counts as cash yet']);
});

test('an account whose every statement is dated ahead is walked back from it, as the roll does', async () => {
  const k = await record();
  const ahead = make(k, 'accounts', { name: 'Opens next week', liquid: true, balance: money(70_000, 'GBP'), as_of: day(5) });
  make(k, 'transactions', { what: 'Paid in', on: day(2), direction: 'in', amount: money(20_000, 'GBP'), account: ahead, cleared: true });
  assert.equal(read(k, CASH_NOW).value, 50_000);
  assert.deepEqual([read(k, CHECK).value, read(k, CHECK).met], [0, true]);
});

test('install refuses a cross-check of no figure, of a figure that is not rolled cash, and one with rows of its own', async () => {
  const k = await record();
  const refused = async (body: Record<string, unknown>): Promise<string> => {
    const r = await k.install([metric({ ...CHECK, metric: 'another-check', ...body })]);
    assert.equal(r.ok, false, JSON.stringify(r));
    return JSON.stringify(r);
  };
  assert.match(await refused({ value: { crosscheck: { of: 'nothing-here' } } }), /METRIC_UNKNOWN/u);
  assert.match(await refused({ value: { crosscheck: { of: 'cash-cross-check' } } }), /is not that money/u);
  assert.match(await refused({ value: { crosscheck: {} } }), /names the figure it checks/u);
  assert.match(await refused({ where: 'liquid is true' }), /has no where/u);
  assert.match(await refused({ source: 'register.balances' }), /that is its source too/u);
  assert.match(await refused({ format: 'int' }), /its format is money/u);
});
