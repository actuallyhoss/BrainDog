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

test('THE LATE KNOB MARKS A FIGURE, and how near a crossing is said is a number of days', async () => {
  const k = await record();
  value(
    await k.install([
      {
        id: 'metric.bills-late',
        kind: 'metric',
        body: { metric: 'bills-late', name: 'Late', source: 'register.bills', value: { diff: { of: { avg: 'due' }, per: { avg: 'due' } } }, format: 'days', target: { lte: 14 }, window: '365d', compare: 'none' },
      } as Declaration,
    ]),
  );
  const forecast = { ...walk({ metric: 'cash-now' }), kind: 'forecast', knobs: ['late'], late: 'bills-late', under: 30 };
  const out = k.block(forecast);
  assert.deepEqual(out.refusals, []);
  assert.equal(out.lateness, 0);
  assert.equal(out.late_name, 'Late', 'the knob is called by the figure it marks, as the record holds it');
  assert.equal(out.under, 30);
  assert.equal(k.block({ ...forecast, late: 'weather' }).refusals[0]?.code, 'METRIC_UNKNOWN');
  assert.equal(k.block({ ...forecast, under: 0 }).refusals[0]?.at, 'under');
  assert.equal(k.block({ ...walk({ metric: 'cash-now' }), kind: 'forecast' }).lateness, undefined, 'no figure named, no mark');
});

test('OUT OF DATE NAMES A DAY AND A WINDOW, or the card grid says what it needs', async () => {
  const k = await record();
  const cards = { kind: 'cards', source: 'register.bills', columns: [{ field: 'what' }, { field: 'due', as: 'when' }], empty: 'None.' };
  assert.deepEqual(k.block({ ...cards, stale: { field: 'due', after: '7d' } }).refusals, []);
  assert.equal(k.block({ ...cards, stale: { field: 'what', after: '7d' } }).refusals[0]?.at, 'stale');
  assert.equal(k.block({ ...cards, stale: { field: 'due', after: 'a week' } }).refusals[0]?.at, 'stale');
});

test('A TABLE SAYS WHO CHANGED EACH ROW LAST, and a sign is read from an enum or refused', async () => {
  const k = await record();
  value(k.update('bills', 'bills#1', { what: 'Rent, September' }, { actor: 'rule:rename' }));
  const table = { kind: 'table', source: 'register.bills', columns: [{ field: 'what' }, { field: 'changed' }], empty: 'None.' };
  const out = k.block(table);
  assert.deepEqual(out.refusals, []);
  assert.equal(out.changes?.length, 1);
  assert.equal(out.changes?.[0]?.by, 'rule');
  assert.equal(out.changes?.[0]?.who, 'rule:rename');
  assert.equal(k.block({ kind: 'table', source: 'register.bills', columns: [{ field: 'what' }], empty: 'None.' }).changes, undefined, 'nobody asked');
  const signed = k.block({ ...table, columns: [{ field: 'amount', sign: { field: 'what', minus: 'Rent' } }] });
  assert.equal(signed.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(signed.refusals[0]?.at, 'columns');
});

test('A BAR OR A SPLIT MAY READ A FIGURE GROUPED BY A WORD, and nothing else reads one', async () => {
  const k = await record();
  value(
    await k.install([
      {
        id: 'metric.by-bill',
        kind: 'metric',
        body: { metric: 'by-bill', name: 'By bill', source: 'register.bills', value: { sum: 'amount' }, group_by: 'what', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
      } as Declaration,
      {
        id: 'metric.by-month',
        kind: 'metric',
        body: { metric: 'by-month', name: 'By month', source: 'register.bills', value: { sum: 'amount' }, group_by: 'due', bucket: 'month', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
      } as Declaration,
    ]),
  );
  const split = k.block({ kind: 'split', source: 'metric.by-bill', unset: 'Unnamed', empty: 'None.' });
  assert.deepEqual(split.refusals, []);
  assert.equal(split.readings?.[0]?.reading?.groups?.[0]?.key, 'Rent');
  assert.equal(split.readings?.[0]?.reading?.value, 600_000);
  assert.equal(k.block({ kind: 'table', source: 'metric.by-bill', empty: 'None.' }).refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(k.block({ kind: 'split', source: 'metric.by-month', empty: 'None.' }).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(k.block({ kind: 'bar', source: 'metric.nonesuch', empty: 'None.' }).refusals[0]?.code, 'METRIC_UNKNOWN');
});

test('A PROGRESS BUDGET READS ITS ROWS AND THE FIGURE IT SPENT, which groups by a word or is refused', async () => {
  const k = await record();
  value(
    await k.install([
      {
        id: 'metric.by-bill',
        kind: 'metric',
        body: { metric: 'by-bill', name: 'By bill', source: 'register.bills', value: { sum: 'amount' }, group_by: 'what', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
      } as Declaration,
      {
        id: 'metric.by-month',
        kind: 'metric',
        body: { metric: 'by-month', name: 'By month', source: 'register.bills', value: { sum: 'amount' }, group_by: 'due', bucket: 'month', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
      } as Declaration,
    ]),
  );
  const budget = { kind: 'progress', source: 'register.bills', columns: [{ field: 'what' }, { field: 'amount' }], limit: 1, empty: 'None.' };
  const out = k.block({ ...budget, spent: 'by-bill' });
  assert.deepEqual(out.refusals, []);
  assert.equal(out.rows.length, out.matched, 'a progress block reduces, so limit: counts bars and every row is read');
  assert.equal(out.readings?.[0]?.metric, 'by-bill');
  assert.equal(out.readings?.[0]?.reading?.groups?.[0]?.key, 'Rent');
  assert.equal(k.block(budget).readings, undefined, 'a goal names no figure');
  assert.equal(k.block({ ...budget, spent: 'nonesuch' }).refusals[0]?.code, 'METRIC_UNKNOWN');
  assert.equal(k.block({ ...budget, spent: 'by-month' }).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(k.block({ ...budget, spent: 3 as unknown as string }).refusals[0]?.at, 'spent');
  /* A GOAL SETS ITS ROWS AGAINST WHAT WAS LOGGED TOWARD THEM, read the same way beside them. */
  const goal = k.block({ ...budget, toward: 'by-bill' });
  assert.deepEqual(goal.refusals, []);
  assert.equal(goal.readings?.[0]?.metric, 'by-bill');
  assert.equal(k.block({ ...budget, toward: 'by-month' }).refusals[0]?.at, 'toward');
  /* A LIMIT IN ONE CURRENCY IS NEVER SET AGAINST A FIGURE IN ANOTHER. */
  value(k.create('bills', { what: 'Ferry', amount: { amount: 9_000, currency: 'EUR' }, due: '2026-09-22' }, OWNER));
  value(await k.install([{ id: 'metric.gbp-by-bill', kind: 'metric', body: { metric: 'gbp-by-bill', name: 'GBP by bill', source: 'register.bills', where: 'what is Rent', value: { sum: 'amount' }, group_by: 'what', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } } as Declaration]));
  const refused = k.block({ kind: 'progress', source: 'register.bills', where: 'what is Ferry', columns: [{ field: 'what' }, { field: 'amount' }], spent: 'gbp-by-bill', empty: 'None.' });
  assert.equal(refused.refusals[0]?.code, 'MIXED_CURRENCY');
  assert.equal(refused.readings, undefined);
});

test("A PAGE SAYS WHAT THE RECORD'S CLOCK READ, so a host draws today from the record", async () => {
  const k = await record();
  value(await k.install([{ id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', requires: ['register.bills'], blocks: [{ kind: 'table', source: 'register.bills', columns: [{ field: 'what' }], empty: 'None.' }] } } as Declaration]));
  const page = value<{ read_at?: string }>(k.page('desk'));
  assert.equal(page.read_at, new Date(NOW).toISOString());
});
