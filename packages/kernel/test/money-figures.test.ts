/**
 * Money figures in the record's own currency, cash rolled forward, and figures over the walk ahead.
 *
 * The shapes held here: `format: money`, `value: { rolled }`, the walk-reading figure (`source: forecast.runway`) and
 * `home:` and `sellable:`. Every figure here is read through the kernel's `metric`, the one door a tile, a page and the
 * night's `snapshot` all use, and installed through `install`, where the declaration is checked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { CROSSCHECK_ENTRIES_MOST, jcs, openRecord, snapshot, type Declaration, type EvalContext, type Kernel, type MetricDecl, type Rate, type Reading } from '../src/index.ts';
import { CROSSCHECK_TOO_MANY, pointedIn } from '../src/money-figures.ts';
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

/* ── at least, a kept point, and a check past its bound (REC-B05) ──────────── */

const FX = register('fx', 'Rates', 'currency', [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
]);

/** The record above with a home currency of pounds Egyptian, a dollar account, and a list of rates to fill. */
async function abroad(): Promise<{ k: Kernel; sql: NodeSql; ids: Record<string, string> }> {
  const made = await record();
  const { k } = made;
  assert.ok((await k.install([FX])).ok);
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('accounts', { name: 'Mercury', balance: { amount: 100_000, currency: 'USD' }, as_of: '2026-09-19', liquid: true }, { actor: 'p_1' }).ok);
  return made;
}

test('CASH ROLLED FORWARD WITH ONE RATE MISSING IS AT LEAST: what converts is added, the rest is listed, and nothing is a value', async () => {
  const { k, sql } = await abroad();
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-20' }, { actor: 'p_1' }).ok);
  /* 168,000.00 pounds and 1,000.00 dollars at 50. */
  const whole = read(k, CASH);
  assert.deepEqual([whole.value, whole.unit, whole.atLeast], [16_800_000 + 5_000_000, 'EGP', undefined]);

  const dirhams = k.create('accounts', { name: 'Dubai', balance: { amount: 120_000, currency: 'AED' }, as_of: '2026-09-19', liquid: true }, { actor: 'p_1' });
  assert.ok(dirhams.ok);
  const least = read(k, CASH);
  assert.equal(least.atLeast, true);
  assert.deepEqual([least.value, least.unit, least.met, least.delta], [null, null, null, null], 'a lower bound was judged or compared');
  assert.deepEqual(least.noRate, [{ currency: 'AED', amount: 120_000 }]);
  assert.deepEqual(least.parts, [
    { currency: 'EGP', amount: 21_800_000 },
    { currency: 'AED', amount: 120_000 },
  ]);
  assert.deepEqual(least.fx?.missing, ['AED to EGP']);

  /* THE WALK OPENS FROM THE SAME ANSWER, so it has no day to give and says which rate it lacks. */
  assert.ok((await k.install([metric(CASH)])).ok);
  const days = read(k, walk('runway', { walk: 'days_to_zero' }, { opening: { metric: 'cash' } }));
  assert.equal(days.value, null);
  assert.equal(days.why, 'the figure it walks from has no rate for AED, so it is only at least');
  assert.deepEqual(days.fx?.missing, ['AED to EGP']);

  /* AN AMOUNT LEFT OUT UNDER NOUGHT COULD PULL THE TOTAL DOWN, so it is one amount a currency and never at least. */
  assert.ok(k.update('accounts', dirhams.value.id, { balance: { amount: -120_000, currency: 'AED' } }, { actor: 'p_1' }).ok);
  const apart = read(k, CASH);
  assert.equal(apart.atLeast, undefined);
  assert.equal(apart.noRate, undefined);
  assert.deepEqual(apart.parts?.map((p) => p.currency), ['AED', 'EGP', 'USD']);
  sql.close();
});

/** A list's schema as the kernel hands one to a reader, from the declaration above. */
const schemaOf = (decl: Declaration): Schema => {
  const body = decl.body as unknown as { id: string; fields: { id: string }[] };
  return { register: body.id, fields: Object.fromEntries(body.fields.map(({ id, ...field }) => [id, field])) } as unknown as Schema;
};
const SCHEMAS = new Map([ACCOUNTS, BALANCES, TRANSACTIONS].map((d) => [schemaOf(d).register, schemaOf(d)]));

test('A KEPT POINT OF CASH NEEDS A RATE OF ITS OWN DAY OR THE DAY BEFORE, or the quiet days before that: a night without one is a gap, filled the night after', async () => {
  const { sql } = await abroad();
  const dollar = (as_of: string): Rate => ({ currency: 'USD', base: 'EGP', rate: 50, as_of });
  const night = (rates: readonly Rate[]) => {
    const ctx: EvalContext = { nowMs: NOW, schemaOf: (id) => SCHEMAS.get(id) ?? null, fx: () => ({ home: 'EGP', rates }) };
    const out = snapshot(sql, CASH as unknown as MetricDecl, ctx, { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 0);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value;
  };
  const kept = () => sql.all<{ at: string; value: number; unit: string }>("SELECT at, value, unit FROM metric_point WHERE series = 'cash' ORDER BY at").map((p) => ({ ...p }));

  /* THE 19TH, WITH A RATE NINE DAYS OLD, and then with a later one standing in: no number either way. */
  assert.deepEqual(night([dollar('2026-09-10')]), { series: 'cash', wrote: 0, backfilled: 0, rewrote: 0, missing: 1, noRate: 1 });
  assert.deepEqual(night([dollar('2026-09-20')]), { series: 'cash', wrote: 0, backfilled: 0, rewrote: 0, missing: 1, noRate: 1 });
  assert.deepEqual(kept(), []);

  /* A RATE OF THE DAY BEFORE: 165,000.00 pounds as the 19th closed, and 1,000.00 dollars at 50. */
  assert.deepEqual(night([dollar('2026-09-10'), dollar('2026-09-18')]), { series: 'cash', wrote: 1, backfilled: 0, rewrote: 0, missing: 0, noRate: 0 });
  assert.deepEqual(kept(), [{ at: '2026-09-19', value: 16_500_000 + 5_000_000, unit: 'EGP' }]);
  sql.close();
});

test('A CROSS-CHECK OVER MORE ENTRIES THAN IT READS SAYS SO, with no value and no verdict, and is not a refusal', async () => {
  const { k, sql, ids } = await record();
  const check = { metric: 'cash-check', name: 'Cash now, checked', source: 'register.accounts', value: { crosscheck: { of: 'cash' } }, format: 'money', target: { lte: 0 }, window: '30d', compare: 'none' };
  assert.ok((await k.install([metric(CASH)])).ok);
  const right = read(k, check);
  assert.deepEqual([right.value, right.met], [0, true]);

  /* ONE MORE CLEARED MOVE THAN THE BOUND, written straight in and dated before the account's own day, so the figure
     counts none of them and is the same number: only the check has more to read than it reads. */
  const fields = JSON.stringify({ what: 'old', account: ids.a, on: '2026-09-01', amount: egp(1), direction: 'out', state: 'cleared' });
  sql.exec(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i <= ?)
     INSERT INTO entry (id, register, seq, fields, created_at, updated_at) SELECT printf('zz%024d', i), 'transactions', 1000 + i, ?, ?, ? FROM n`,
    CROSSCHECK_ENTRIES_MOST,
    fields,
    new Date(NOW).toISOString(),
    new Date(NOW).toISOString(),
  );
  assert.equal(read(k, CASH).value, 16_800_000);
  const many = read(k, check);
  assert.equal(many.why, CROSSCHECK_TOO_MANY);
  assert.equal(many.why, 'too many to check');
  assert.deepEqual([many.value, many.unit, many.met, many.parts], [null, null, null, undefined], 'a check that did not run found something');
  sql.close();
});

test('THE LISTS A PREDICATE HOPS INTO are named however deep, and a sentence hops nowhere', () => {
  assert.deepEqual(pointedIn('state is open'), []);
  assert.deepEqual(pointedIn({ field: 'state', is: 'open' }), []);
  const hop = { pointed: { register: 'accounts', where: { any: [{ pointed: { register: 'books' } }, { field: 'liquid', is: true }] } } };
  assert.deepEqual(pointedIn({ all: [hop, { none: [{ pointed: { register: 'people' } }] }] }), ['accounts', 'books', 'people']);
});
