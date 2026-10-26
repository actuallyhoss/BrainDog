/**
 * One walk, three pictures of it: a figure over the walk cut into calendar months (the months ahead of a chart of what
 * moved), and a stat cell whose line is the walk ahead from today. Each reads the steps the forecast walks, so a part of
 * a plan due in a month ahead is in that month's bar and in the line's drop, on the day the runway runs out on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* Noon UTC on 20 October. The record has no zone, so its day is the UTC day. */
const NOW = Date.UTC(2026, 9, 20, 12);

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;
const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
]);
const LINES = register('lines', 'Every month', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'every', type: 'enum', values: ['monthly'], index: true },
  { id: 'next_due', type: 'day', index: true },
]);
const PARTS = register('parts', 'Parts', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'plan', type: 'text' },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'due', type: 'day', index: true },
]);

const LEGS = [
  { register: 'lines', on: 'next_due', amount: 'amount', incoming: { field: 'direction', is: 'in' }, every: { field: 'every', months: { monthly: 1 } } },
  { register: 'parts', on: 'due', amount: 'amount', incoming: { field: 'direction', is: 'in' }, group: 'plan' },
];

const CASH = { metric: 'cash', name: 'Cash', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };
const RUNWAY = { metric: 'runway', name: 'Runway', source: 'forecast.runway', legs: LEGS, opening: { metric: 'cash' }, value: { walk: 'days_to_zero', within: '365d' }, format: 'days', target: { gte: 365 }, window: '30d', compare: 'none' };
const ahead = (id: string, walk: 'in' | 'out', extra: Record<string, unknown> = {}) => ({
  metric: id,
  name: id,
  source: 'forecast.runway',
  legs: LEGS,
  value: { walk, within: '125d' },
  bucket: 'month',
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
  ...extra,
});

const egp = (amount: number) => ({ amount, currency: 'EGP' });

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, LINES, PARTS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const make = (list: string, fields: Record<string, unknown>) => assert.ok(k.create(list, fields, { actor: 'p_1' }).ok);
  make('accounts', { name: 'Current', balance: egp(100_000) });
  make('lines', { what: 'Pay', direction: 'in', amount: egp(50_000), every: 'monthly', next_due: '2026-10-31' });
  make('parts', { what: 'House, part 2 of 30', plan: 'House', direction: 'out', amount: egp(120_000), due: '2026-11-13' });
  make('parts', { what: 'Car, part 4 of 12', plan: 'Car', direction: 'out', amount: egp(30_000), due: '2027-01-05' });
  const figures = await k.install([metric(CASH), metric(RUNWAY), metric(ahead('in-ahead', 'in')), metric(ahead('out-ahead', 'out'))]);
  assert.ok(figures.ok, JSON.stringify(figures));
  return { k, sql };
}

const read = (k: Kernel, decl: object): Reading => {
  const out = k.metric(decl as never);
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};

const months = (r: Reading): Record<string, number | null> => Object.fromEntries((r.groups ?? []).map((g) => [g.key, g.value]));

test('A WALK CUT INTO MONTHS counts every part of a plan in the month it falls due, and what repeats on its days', async () => {
  const { k, sql } = await record();
  const out = read(k, ahead('out-ahead', 'out'));
  assert.equal(out.current, '2026-10');
  assert.equal(out.unit, 'EGP');
  /* EVERY MONTH THE WALK SAW WHOLE IS THERE, a month nothing moved in as nought; February, which the walk stops part
     way through, is not. */
  assert.deepEqual(months(out), { '2026-10': 0, '2026-11': 120_000, '2026-12': 0, '2027-01': 30_000 });
  /* THE PAY LANDS ON ITS DAY EACH MONTH, never at a monthly share spread over months it does not land in. */
  assert.deepEqual(months(read(k, ahead('in-ahead', 'in'))), { '2026-10': 50_000, '2026-11': 50_000, '2026-12': 50_000, '2027-01': 50_000 });
  /* AND THE WHOLE IS STILL THE WALK'S TOTAL over the span. */
  assert.equal(out.value, 150_000);
  sql.close();
});

test('ONLY MONEY IN OR OUT IS CUT INTO MONTHS: a crossing of zero has none, and a week is not a calendar month', async () => {
  const { k, sql } = await record();
  const refused = async (body: Record<string, unknown>): Promise<string> => {
    const out = await k.install([metric(body)]);
    return out.ok ? 'installed' : 'refusal' in out ? `${out.refusal.code} at ${String(out.refusal.at)}` : 'conflict';
  };
  assert.equal(await refused(ahead('weekly', 'out', { bucket: 'week' })), 'DECLARATION_INVALID at bucket');
  assert.equal(await refused({ ...RUNWAY, metric: 'runway-months', bucket: 'month' }), 'DECLARATION_INVALID at bucket');
  assert.equal(await refused({ ...ahead('grouped', 'out'), group_by: 'plan' }), 'DECLARATION_INVALID at group_by');
  sql.close();
});

test('A STAT CELL WITH ahead: DRAWS THE WALK FROM TODAY, a balance a day, and says its lowest point and day', async () => {
  const { k, sql } = await record();
  const page = { id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', blocks: [{ kind: 'stat', heading: 'Cash ahead', cells: [{ metric: 'cash', trend: '4w', ahead: 'runway' }] }] } };
  const made = await k.install([page as never]);
  assert.ok(made.ok, JSON.stringify(made));
  type Cell = { trend?: (number | null)[]; ahead?: { from: string; currency: string; low: { day: string; value: number } } };
  const out = k.page('desk') as { ok: boolean; value: { blocks: { readings?: Cell[]; refusals?: unknown[] }[] } };
  assert.ok(out.ok, JSON.stringify(out));
  const [cell] = out.value.blocks[0]!.readings!;
  assert.deepEqual(out.value.blocks[0]!.refusals ?? [], []);
  /* TODAY FIRST, then the end of each of the 28 days after it. */
  assert.equal(cell!.trend!.length, 29);
  assert.equal(cell!.trend![0], 100_000);
  /* +500.00 on the 31st (day 11), −1,200.00 on 13 November (day 24): the lowest, and the day it is. */
  assert.equal(cell!.trend![11], 150_000);
  assert.equal(cell!.trend![24], 30_000);
  assert.deepEqual(cell!.ahead, { from: '2026-10-20', currency: 'EGP', low: { day: '2026-11-13', value: 30_000 } });
  sql.close();
});
