/**
 * A balance's age is what the bank last said (REC-B03).
 *
 * A rolled cash figure with `read` set answers how old its balances are instead of how much they hold: the oldest day an
 * account was last confirmed (`as_of`), that day's age (`age`), or how many accounts are older than a window (`stale`).
 * The day is the newest statement the roll restarts from, the account's own typed day or a check's, so a bank message
 * that prints a balance after a movement makes the account new again without anybody touching the account.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* Noon UTC on 20 September. */
const NOW = Date.UTC(2026, 8, 20, 12);
const TODAY = '2026-09-20';
const epochDay = (d: string): number => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);

const BALANCES = register('balances', 'Balance checks', 'source', [
  { id: 'source', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'balance', type: 'money', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
]);

/* THE LEDGER, as money-core keeps it: a bank message files a row here and says the balance after it. */
const TRANSACTIONS = register('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], index: true },
  { id: 'balance_after', type: 'money' },
]);

const rolled = (extra: Record<string, unknown> = {}) => ({
  rolled: {
    balance: 'balance',
    as_of: 'as_of',
    checks: [
      { register: 'balances', by: 'account', balance: 'balance', on: 'as_of' },
      { register: 'transactions', by: 'account', balance: 'balance_after', on: 'on' },
    ],
    moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out', where: 'state is cleared' },
    ...extra,
  },
});

const figure = (metric: string, extra: Record<string, unknown>, format: string, more: Record<string, unknown> = {}) => ({
  metric,
  name: metric,
  source: 'register.accounts',
  value: rolled(extra),
  format,
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
  ...more,
});

const OLDEST = figure('cash-as-of', { read: 'as_of' }, 'day');
const AGE = figure('statement-oldest-days', { read: 'age' }, 'days');
const STALE = figure('balances-stale', { read: 'stale', after: '7d' }, 'int');

const usd = (amount: number) => ({ amount, currency: 'USD' });

async function record(): Promise<{ k: Kernel; sql: NodeSql; ids: Record<string, string> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, BALANCES, TRANSACTIONS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const ids: Record<string, string> = {};
  /* HSBC WAS TYPED THIRTY DAYS AGO. Mercury was typed yesterday. */
  for (const [key, row] of [
    ['hsbc', { name: 'HSBC (USD)', balance: usd(500_000), as_of: '2026-08-21' }],
    ['mercury', { name: 'Mercury', balance: usd(900_000), as_of: '2026-09-19' }],
  ] as const) {
    const made = k.create('accounts', row, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
    ids[key] = made.value.id;
  }
  return { k, sql, ids };
}

const read = (k: Kernel, decl: object): Reading => {
  const out = k.metric(decl as never);
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};

const byName = (r: Reading): Record<string, number | null> => Object.fromEntries((r.groups ?? []).map((g) => [g.label ?? g.key, g.value]));

test('A TYPED DAY THIRTY DAYS OLD IS THIRTY DAYS OLD, and one account past seven days is stale', async () => {
  const { k, sql } = await record();
  assert.deepEqual([read(k, OLDEST).value, read(k, OLDEST).unit], [epochDay('2026-08-21'), null]);
  assert.equal(read(k, AGE).value, 30);
  assert.equal(read(k, STALE).value, 1);
  /* THE MONEY IS STILL THE MONEY when nothing asks for an age. */
  assert.deepEqual([read(k, figure('cash', {}, 'money')).value, read(k, figure('cash', {}, 'money')).unit], [1_400_000, 'USD']);
  sql.close();
});

test('A LEDGER ROW’S BALANCE AFTER, FILED TODAY, MAKES THE ACCOUNT TODAY’S, and nobody touches the account', async () => {
  const { k, sql, ids } = await record();
  assert.ok(
    k.create('transactions', { what: 'Card payment', account: ids.hsbc!, on: TODAY, amount: usd(2_000), direction: 'out', state: 'cleared', balance_after: usd(498_000) }, { actor: 'p_1' }).ok,
  );
  /* MERCURY, YESTERDAY, IS NOW THE OLDEST. */
  assert.equal(read(k, OLDEST).value, epochDay('2026-09-19'));
  assert.equal(read(k, AGE).value, 1);
  assert.equal(read(k, STALE).value, 0);
  /* AND THE ACCOUNT'S OWN TYPED DAY IS AS IT WAS. */
  assert.equal((k.get(ids.hsbc!)?.fields as Record<string, unknown> | undefined)?.as_of, '2026-08-21');
  sql.close();
});

test('AN ACCOUNT WITH NO STATEMENT IS STALE, never confirmed, and has no day to say', async () => {
  const { k, sql } = await record();
  /* A BALANCE WITH NO DAY, AND AN ACCOUNT WITH NOTHING: neither was ever confirmed. Its first move is not a statement. */
  assert.ok(k.create('accounts', { name: 'Wise', balance: usd(100) }, { actor: 'p_1' }).ok);
  const empty = k.create('accounts', { name: 'Old savings' }, { actor: 'p_1' });
  assert.ok(empty.ok);
  assert.ok(k.create('transactions', { what: 'Interest', account: empty.value.id, on: TODAY, amount: usd(5), direction: 'in', state: 'cleared' }, { actor: 'p_1' }).ok);
  assert.equal(read(k, STALE).value, 3);
  /* THE OLDEST DAY IS STILL HSBC'S: a never-confirmed account has none, and is counted by the stale figure instead. */
  assert.equal(read(k, AGE).value, 30);
  sql.close();
});

test('A STATEMENT DATED AFTER THE DAY ASKED ABOUT HAD NOT CONFIRMED IT YET, so the account counts stale, not fresh', async () => {
  const { k, sql } = await record();
  /* THE NIGHT'S SNAPSHOT READS DAYS BEFORE AN ACCOUNT'S FIRST STATEMENT: here a balance typed for five days from now. */
  assert.ok(k.create('accounts', { name: 'Wise', balance: usd(100), as_of: '2026-09-25' }, { actor: 'p_1' }).ok);
  assert.equal(read(k, STALE).value, 2);
  assert.equal(read(k, AGE).value, 30);
  sql.close();
});

test('GROUPED BY NAME, EACH ACCOUNT SAYS ITS OWN DAY, AGE AND STALENESS, the oldest first', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('accounts', { name: 'Wise' }, { actor: 'p_1' }).ok);
  const days = read(k, { ...OLDEST, group_by: 'name' });
  assert.deepEqual(
    (days.groups ?? []).map((g) => [g.key, g.value, g.rows]),
    [
      ['Wise', null, 1],
      ['HSBC (USD)', epochDay('2026-08-21'), 1],
      ['Mercury', epochDay('2026-09-19'), 1],
    ],
  );
  assert.deepEqual(byName(read(k, { ...AGE, group_by: 'name' })), { 'HSBC (USD)': 30, Mercury: 1, Wise: null });
  assert.deepEqual(byName(read(k, { ...STALE, group_by: 'name' })), { 'HSBC (USD)': 1, Mercury: 0, Wise: 1 });
  sql.close();
});

test('A STALE COUNT WITH NO WINDOW IS REFUSED AT INSTALL, in one sentence, and so is a read nobody knows', async () => {
  const { k, sql } = await record();
  const install = (id: string, extra: Record<string, unknown>) =>
    k.install([{ id: `metric.${id}`, kind: 'metric', body: figure(id, extra, 'int', { home: 1, sellable: true }) } as never]);
  const bare = await install('stale-bare', { read: 'stale' });
  assert.ok(!bare.ok);
  assert.match(JSON.stringify(bare), /after: 7d/u);
  assert.ok(!(await install('stale-odd', { read: 'newest' })).ok);
  assert.ok(!(await install('stale-window', { read: 'stale', after: 'a week' })).ok);
  assert.ok(!(await install('age-window', { read: 'age', after: '7d' })).ok);
  const fine = await install('stale-ok', { read: 'stale', after: '7d' });
  assert.ok(fine.ok, JSON.stringify(fine));
  /* AND READ WITHOUT INSTALL, THE SAME SENTENCE. */
  const asked = k.metric(figure('stale-bare', { read: 'stale' }, 'int') as never);
  assert.ok(!asked.ok);
  sql.close();
});
