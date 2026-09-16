/**
 * A cash walk that starts from a declared figure rather than from a typed number.
 *
 * `opening: { metric }` is what keeps a Money page's Cash now tile and its walk on one declaration: the
 * account rows move, the figure moves, and the walk starts from where the figure now is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const OWNER = { actor: 'p_1' };

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'balance', type: 'money', required: true },
      { id: 'liquid', type: 'bool', default: true },
    ],
  },
};

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', required: true },
    ],
  },
};

const CASH: Declaration = {
  id: 'metric.cash-now',
  kind: 'metric',
  body: {
    metric: 'cash-now',
    name: 'Cash now',
    source: 'register.accounts',
    where: 'liquid is true',
    value: { sum: 'balance' },
    format: 'money.GBP',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([ACCOUNTS, BILLS, CASH]));
  value(k.create('accounts', { name: 'Current', balance: { amount: 300_000, currency: 'GBP' } }, OWNER));
  value(k.create('accounts', { name: 'Reserve', balance: { amount: 200_000, currency: 'GBP' } }, OWNER));
  value(k.create('accounts', { name: 'Card', balance: { amount: -50_000, currency: 'GBP' }, liquid: false }, OWNER));
  value(k.create('bills', { what: 'Rent', amount: { amount: 600_000, currency: 'GBP' }, due: '2026-09-20' }, OWNER));
  return k;
}

const walk = (opening: unknown) => ({
  kind: 'table',
  source: 'forecast.runway',
  opening: opening as never,
  from: [{ register: 'bills', on: 'due', amount: 'amount' }],
  empty: 'Nothing dated.',
});

test('A WALK STARTS FROM THE FIGURE IT NAMES, and the figure reads only what counts as cash', async () => {
  const k = await record();
  const out = k.block(walk({ metric: 'cash-now' }));
  assert.deepEqual(out.refusals, []);
  assert.equal(out.walk?.from, 500_000, 'the card is not cash, so it is not in the opening');
  assert.equal(out.walk?.crossed?.label, 'Rent');
  assert.equal(out.walk?.crossed?.balance, -100_000);
});

test('and when an account moves, the walk moves with it, with nothing typed twice', async () => {
  const k = await record();
  value(k.update('accounts', 'accounts#2', { balance: { amount: 400_000, currency: 'GBP' } }, OWNER));
  const out = k.block(walk({ metric: 'cash-now' }));
  assert.equal(out.walk?.from, 700_000);
  assert.equal(out.walk?.crossed, null, 'GBP 7,000 less GBP 6,000 does not go under');
});

test('a typed opening still walks, so a page written before this reads as it did', async () => {
  const k = await record();
  assert.equal(k.block(walk(1_000_000)).walk?.from, 1_000_000);
});

test('A FIGURE NOBODY DECLARED IS SAID, not walked from zero', async () => {
  const k = await record();
  const out = k.block(walk({ metric: 'cash-later' }));
  assert.equal(out.walk, undefined);
  assert.equal(out.refusals[0]?.code, 'METRIC_UNKNOWN');
  assert.equal(out.refusals[0]?.at, 'opening');
});

test('A BALANCE IN ONE CURRENCY AND BILLS IN ANOTHER ARE NOT ONE WALK', async () => {
  const k = await record();
  value(k.create('bills', { what: 'Hosting', amount: { amount: 1_000, currency: 'USD' }, due: '2026-09-10' }, OWNER));
  value(k.update('bills', 'bills#1', { amount: { amount: 600_000, currency: 'USD' } }, OWNER));
  const out = k.block(walk({ metric: 'cash-now' }));
  assert.equal(out.walk, undefined);
  assert.equal(out.refusals[0]?.code, 'MIXED_CURRENCY');
});

/* ── how a figure moved ──────────────────────────────────────────────────── */

test('A TREND IS ONE VALUE A DAY FROM THE FIGURE\'S SERIES, and a day with no point is a gap', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([ACCOUNTS, CASH]));
  value(k.create('accounts', { name: 'Current', balance: { amount: 300_000, currency: 'GBP' } }, OWNER));
  const put = (at: string, v: number) =>
    sql.exec(
      "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES ('cash-now', 'day', ?, ?, 'GBP', 1, 'register.accounts', ?)",
      at,
      v,
      '2026-09-03T00:05:00Z',
    );
  /* Six days, 28 August to 2 September; the 30th has no point, and a point outside the window is not read. */
  put('2026-08-20', 1);
  put('2026-08-28', 500_000);
  put('2026-08-29', 450_000);
  put('2026-08-31', 400_000);
  put('2026-09-01', 350_000);
  put('2026-09-02', 300_000);
  const out = k.block({ kind: 'stat', cells: [{ metric: 'cash-now', label: 'Cash now', trend: '6d' }], lead: true });
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.readings?.[0]?.trend, [500_000, 450_000, null, 400_000, 350_000, 300_000]);
  assert.equal(out.readings?.[0]?.reading?.value, 300_000);
});

test('a figure with no points has no trend, and a trend that is not a window is said', async () => {
  const k = await record();
  const none = k.block({ kind: 'stat', cells: [{ metric: 'cash-now', trend: '12w' }] });
  assert.equal(none.readings?.[0]?.trend, undefined, 'no line is drawn from nothing');
  assert.equal(none.readings?.[0]?.reading?.value, 500_000, 'and the figure still reads');
  const bad = k.block({ kind: 'stat', cells: [{ metric: 'cash-now', trend: 'a while' }] });
  assert.equal(bad.readings?.[0]?.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(bad.readings?.[0]?.refusal?.at, 'trend');
});

/* ── a forecast's remembered half ────────────────────────────────────────── */

test('A FORECAST DRAWS THE OPENING FIGURE AS IT WAS REMEMBERED, and only that figure', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([ACCOUNTS, BILLS, CASH]));
  value(k.create('accounts', { name: 'Current', balance: { amount: 300_000, currency: 'GBP' } }, OWNER));
  const put = (at: string, v: number) =>
    sql.exec(
      "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES ('cash-now', 'day', ?, ?, 'GBP', 1, 'register.accounts', ?)",
      at,
      v,
      '2026-09-03T00:05:00Z',
    );
  put('2026-05-01', 1);
  put('2026-08-31', 280_000);
  put('2026-09-02', 300_000);
  put('2026-09-03', 999);
  const forecast = { ...walk({ metric: 'cash-now' }), kind: 'forecast', recorded: 'cash-now', knobs: ['horizon', 'late'] };
  const out = k.block(forecast);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.past?.map((p) => ({ at: p.at, value: p.value })), [{ at: '2026-08-31', value: 280_000 }, { at: '2026-09-02', value: 300_000 }], 'ninety days before today, and not today');
  assert.equal(out.walk?.from, 300_000);

  assert.equal(k.block({ ...forecast, recorded: 'series.cash-now' }).refusals.length, 0, 'the series spelling is the same series');
  assert.equal(k.block({ ...forecast, recorded: 'overdue' }).refusals[0]?.at, 'recorded', 'another figure would join two measures at today');
  assert.equal(k.block({ ...forecast, knobs: ['weather'] }).refusals[0]?.at, 'knobs');
});
