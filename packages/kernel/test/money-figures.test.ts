/**
 * Money figures in the record's own currency, cash rolled forward, and figures over the walk ahead.
 *
 * `loop/finish/modules.md` MOD-1: C1 (`format: money`), C3 (`value: { rolled }`), C4's walk-reading figure
 * (`source: forecast.runway`) and C7 (`home:`, `sellable:`). Every figure here is read through the kernel's `metric`,
 * the one door a tile, a page and the night's `snapshot` all use, and installed through `install`, where the
 * declaration is checked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* Noon UTC on 20 September. The record has no zone, so its day is the UTC day. */
const NOW = Date.UTC(2026, 8, 20, 12);

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
  { id: 'liquid', type: 'bool' },
]);

const BALANCES = register('balances', 'Balance checks', 'source', [
  { id: 'source', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'balance', type: 'money', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
]);

const TRANSACTIONS = register('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], index: true },
]);

const RECURRING = register('recurring', 'Every month', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'every', type: 'enum', values: ['monthly', 'none'], index: true },
  { id: 'next_due', type: 'day', index: true },
]);

const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const ROLLED = {
  rolled: {
    balance: 'balance',
    as_of: 'as_of',
    checks: [{ register: 'balances', by: 'account', balance: 'balance', on: 'as_of' }],
    moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out', where: 'state is cleared' },
  },
};

const CASH = {
  metric: 'cash',
  name: 'Cash now',
  source: 'register.accounts',
  where: 'liquid is true',
  value: ROLLED,
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
  home: 1,
  sellable: true,
};

const LEGS = [
  {
    register: 'recurring',
    on: 'next_due',
    amount: 'amount',
    incoming: { field: 'direction', is: 'in' },
    every: { field: 'every', months: { monthly: 1 } },
  },
];

const walk = (id: string, value: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  metric: id,
  name: id,
  source: 'forecast.runway',
  legs: LEGS,
  value,
  format: value.walk === 'days_to_zero' ? 'days' : 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
  ...extra,
});

const egp = (amount: number) => ({ amount, currency: 'EGP' });

async function record(): Promise<{ k: Kernel; sql: NodeSql; ids: Record<string, string> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, BALANCES, TRANSACTIONS, RECURRING]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const ids: Record<string, string> = {};
  for (const [key, row] of [
    /* STATED TEN DAYS AGO, and YESTERDAY. */
    ['a', { name: 'Current', balance: egp(10_000_000), as_of: '2026-09-10', liquid: true }],
    ['b', { name: 'Savings', balance: egp(5_000_000), as_of: '2026-09-19', liquid: true }],
    ['house', { name: 'House', balance: egp(900_000_000), as_of: '2026-09-01', liquid: false }],
  ] as const) {
    const made = k.create('accounts', row, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
    ids[key] = made.value.id;
  }
  const move = (account: string, on: string, amount: number, direction: 'in' | 'out', state: 'pending' | 'cleared') =>
    assert.ok(k.create('transactions', { what: `${direction} ${on}`, account: ids[account]!, on, amount: egp(amount), direction, state }, { actor: 'p_1' }).ok);
  /* FIVE CLEARED AND ONE PENDING. Before the current account's start, so not counted. */
  move('a', '2026-09-05', 1_000_000, 'out', 'cleared');
  move('a', '2026-09-12', 2_000_000, 'in', 'cleared');
  move('a', '2026-09-15', 500_000, 'out', 'cleared');
  /* Pending, so the figure's `moves.where` leaves it out. */
  move('a', '2026-09-18', 250_000, 'out', 'pending');
  /* On the savings account's own day, which its balance already holds. */
  move('b', '2026-09-19', 100_000, 'out', 'cleared');
  move('b', '2026-09-20', 300_000, 'in', 'cleared');
  return { k, sql, ids };
}

const read = (k: Kernel, decl: object): Reading => {
  const out = k.metric(decl as never);
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};

const refusedAt = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string } };
  return x.ok ? 'installed' : `${x.refusal!.code} at ${String(x.refusal!.at)}`;
};

test('A MONEY FIGURE IS IN THE HOME CURRENCY, else its rows’ one currency, and names no currency of its own', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([ACCOUNTS])).ok);
  for (const name of ['One', 'Two']) assert.ok(k.create('accounts', { name, balance: egp(2_909_277), as_of: '2026-09-19', liquid: true }, { actor: 'p_1' }).ok);
  const summed = { metric: 'held', name: 'Held', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };

  /* NO HOME CURRENCY, ONE CURRENCY IN THE ROWS: that currency. */
  const bare = read(k, summed);
  assert.deepEqual([bare.value, bare.unit], [5_818_554, 'EGP']);

  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  const home = read(k, summed);
  assert.deepEqual([home.value, home.unit, home.met], [5_818_554, 'EGP', true]);
  assert.ok(!JSON.stringify(home).includes('GBP'), JSON.stringify(home));
  sql.close();
});

test('CASH ROLLED FORWARD is each account’s latest balance plus its cleared moves since, as of the older start', async () => {
  const { k, sql } = await record();
  const cash = read(k, CASH);
  /* 100,000.00 on the 10th, then +20,000.00 and -5,000.00; 50,000.00 on the 19th, then +3,000.00. The house is not
     liquid, the pending move is not cleared, and the moves on or before each start are in its balance. */
  assert.equal(cash.value, 10_000_000 + 2_000_000 - 500_000 + (5_000_000 + 300_000));
  assert.equal(cash.unit, 'EGP');
  assert.equal(cash.as_of, '2026-09-10');
  assert.equal(cash.rows, 2);
  assert.equal(cash.met, true);
  sql.close();
});

test('A BALANCE CHECK NEWER THAN THE ACCOUNT’S OWN DAY RESTARTS IT, and an older one does not', async () => {
  const { k, sql, ids } = await record();
  assert.ok(k.create('balances', { source: 'statement', account: ids.a!, balance: egp(12_000_000), as_of: '2026-09-16' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('balances', { source: 'old statement', account: ids.b!, balance: egp(1), as_of: '2026-09-01' }, { actor: 'p_1' }).ok);
  const cash = read(k, CASH);
  /* The current account restarts at 120,000.00 on the 16th, after every cleared move it had; savings is unchanged. */
  assert.equal(cash.value, 12_000_000 + (5_000_000 + 300_000));
  assert.equal(cash.as_of, '2026-09-16');
  sql.close();
});

test('A DAY BEFORE AN ACCOUNT WAS STATED IS ROLLED BACK from the statement after it', async () => {
  const { k, sql } = await record();
  /* NINE DAYS BACK IS THE 11TH. The current account stood at its own 100,000.00, stated on the 10th with nothing
     cleared since. The savings account was first stated on the 19th, at 50,000.00 after the 1,000.00 that left it
     that day, so on the 11th it held that 1,000.00 too: 51,000.00. Now the figure is 168,000.00. */
  const back = k.metric({ ...CASH, compare: 'previous', window: '9d' } as never);
  assert.ok(back.ok, JSON.stringify(back));
  assert.equal(back.value.value, 16_800_000);
  assert.equal(back.value.delta, (16_800_000 - 15_100_000) / 15_100_000);
  sql.close();
});

test('A FIGURE OVER THE WALK AHEAD adds up the same movements the forecast walks', async () => {
  const { k, sql } = await record();
  for (const row of [
    { what: 'Pay', direction: 'in', amount: egp(1_000_000), every: 'monthly', next_due: '2026-09-25' },
    { what: 'Rent', direction: 'out', amount: egp(400_000), every: 'monthly', next_due: '2026-10-01' },
    { what: 'Tax', direction: 'out', amount: egp(20_000_000), every: 'none', next_due: '2026-10-10' },
  ])
    assert.ok(k.create('recurring', row, { actor: 'p_1' }).ok);

  const within = { within: '30d' };
  const arriving = read(k, walk('in', { walk: 'in', ...within }));
  assert.deepEqual([arriving.value, arriving.unit], [1_000_000, 'EGP']);
  /* Money leaving is a magnitude; the net is signed. */
  assert.equal(read(k, walk('out', { walk: 'out', ...within })).value, 20_400_000);
  assert.equal(read(k, walk('net', { walk: 'net', ...within })).value, 1_000_000 - 20_400_000);

  /* THE DAYS UNTIL ZERO walk from the cash figure, which has to be installed to be named. 168,000.00, then +10,000.00
     on the 25th, -4,000.00 on the 1st and -200,000.00 on the 10th: under on 10 October, twenty days from the 20th. */
  const installed = await k.install([metric(CASH)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const days = read(k, walk('runway', { walk: 'days_to_zero' }, { opening: { metric: 'cash' } }));
  assert.equal(days.value, 20);
  assert.equal(days.unit, null);
  sql.close();
});

test('THE DECLARATION IS CHECKED: money, rolled, a walk, home and sellable install, and their mistakes are refused by key', async () => {
  const { k, sql } = await record();
  assert.equal(refusedAt(await k.install([metric(CASH)])), 'installed');
  assert.equal(refusedAt(await k.install([metric(walk('arriving', { walk: 'in', within: '30d' }))])), 'installed');
  assert.equal(refusedAt(await k.install([metric({ ...CASH, home: 10 })])), 'DECLARATION_INVALID at home');
  assert.equal(refusedAt(await k.install([metric({ ...CASH, sellable: false })])), 'DECLARATION_INVALID at sellable');
  assert.equal(refusedAt(await k.install([metric({ ...CASH, value: { rolled: { balance: 'balance' } } })])), 'DECLARATION_INVALID at value');
  assert.equal(refusedAt(await k.install([metric({ ...CASH, value: { rolled: { ...ROLLED.rolled, balance: 'nosuch' } } })])), 'FIELD_UNKNOWN at value');
  assert.equal(refusedAt(await k.install([metric(walk('arriving', { walk: 'sideways', within: '30d' }))])), 'DECLARATION_INVALID at value');
  assert.equal(refusedAt(await k.install([metric(walk('arriving', { walk: 'in' }))])), 'DECLARATION_INVALID at value');
  assert.equal(refusedAt(await k.install([metric(walk('arriving', { walk: 'in', within: '30d' }, { where: 'what is Pay' }))])), 'DECLARATION_INVALID at where');
  assert.equal(refusedAt(await k.install([metric(walk('lasts', { walk: 'days_to_zero' }))])), 'DECLARATION_INVALID at opening');
  assert.equal(refusedAt(await k.install([metric({ ...CASH, legs: LEGS })])), 'DECLARATION_INVALID at legs');
  /* EVERY LIST AND FIELD BEYOND THE SOURCE IS ASKED FOR AT INSTALL, so a figure that could never be read is not installed. */
  const rolledWith = (rolled: Record<string, unknown>) => metric({ ...CASH, value: { rolled: { ...ROLLED.rolled, ...rolled } } });
  assert.equal(refusedAt(await k.install([rolledWith({ moves: { ...ROLLED.rolled.moves, register: 'nosuch' } })])), 'REGISTER_UNKNOWN at value');
  assert.equal(refusedAt(await k.install([rolledWith({ moves: { ...ROLLED.rolled.moves, on: 'nosuch' } })])), 'FIELD_UNKNOWN at value');
  assert.equal(refusedAt(await k.install([rolledWith({ checks: [{ register: 'balances', by: 'account', balance: 'nosuch', on: 'as_of' }] })])), 'FIELD_UNKNOWN at value');
  assert.equal(refusedAt(await k.install([metric(walk('arriving', { walk: 'in', within: '30d' }, { legs: [{ ...LEGS[0], register: 'nosuch' }] }))])), 'REGISTER_UNKNOWN at legs[0]');
  assert.equal(refusedAt(await k.install([metric(walk('arriving', { walk: 'in', within: '30d' }, { legs: [{ ...LEGS[0], every: { field: 'nosuch', months: { monthly: 1 } } }] }))])), 'FIELD_UNKNOWN at legs[0]');
  assert.equal(refusedAt(await k.install([metric(walk('lasts', { walk: 'days_to_zero' }, { opening: { metric: 'nosuch' } }))])), 'METRIC_UNKNOWN at opening');
  assert.equal(refusedAt(await k.install([metric(walk('lasts', { walk: 'days_to_zero' }, { opening: { metric: 'arriving' } }))])), 'DECLARATION_INVALID at opening');
  sql.close();
});
