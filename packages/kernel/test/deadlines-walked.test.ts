/**
 * What falls due is what the record's cash walk moves (the scope of 24 October, B4 and B5).
 *
 * His Today said a paused contractor fee was two weeks late, and named one premium twice in Due soon: once as the bill
 * that repeats monthly and once as its repeating line. The walk moves neither the paused line nor the repeating bill, so
 * `deadlines` now reads the legs over a list and its day, and a row no leg moves is not due. A list no walk reads keeps
 * every row that is not finished.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 24, 12);
const OWNER = { actor: 'p_1' };

const register = (id: string, body: Record<string, unknown>): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, ...body } }) as never;

const BILLS = register('obligations', {
  name: 'Bills',
  title: 'what',
  state: 'state',
  done: ['paid'],
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'due', type: 'day', index: true, deadline: true },
    { id: 'amount', type: 'money' },
    { id: 'repeats', type: 'enum', values: ['none', 'monthly'] },
    { id: 'state', type: 'enum', values: ['open', 'paid'], default: 'open' },
  ],
});

const LINES = register('recurring', {
  name: 'Repeating',
  title: 'what',
  state: 'state',
  done: ['ended'],
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'next_due', type: 'day', index: true, deadline: true },
    { id: 'amount', type: 'money' },
    { id: 'every', type: 'enum', values: ['monthly'], default: 'monthly' },
    { id: 'state', type: 'enum', values: ['live', 'paused', 'ended'], default: 'live' },
  ],
});

const TASKS = register('tasks', {
  name: 'Tasks',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'by', type: 'day', deadline: true },
  ],
});

const LEGS = [
  { register: 'obligations', on: 'due', amount: 'amount', where: 'state is open, repeats is not monthly' },
  { register: 'recurring', on: 'next_due', amount: 'amount', where: 'state is live', every: { field: 'every', months: { monthly: 1 } } },
];

const ACCOUNTS = register('accounts', { name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }] });

const CASH: Declaration = {
  id: 'metric.cash',
  kind: 'metric',
  body: { metric: 'cash', name: 'Cash now', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' },
} as never;

const WALK: Declaration = {
  id: 'metric.lasts',
  kind: 'metric',
  body: {
    metric: 'lasts',
    name: 'Lasts',
    source: 'forecast.runway',
    legs: LEGS,
    value: { walk: 'days_to_zero' },
    format: 'days',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    opening: { metric: 'cash' },
  },
} as never;

const money = (amount: number) => ({ amount, currency: 'USD' });

async function record(walked: boolean): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([BILLS, LINES, TASKS, ...(walked ? [ACCOUNTS, CASH, WALK] : [])]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (list: string, fields: Record<string, unknown>): void => {
    const out = k.create(list, fields, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
  };
  made('obligations', { what: 'Northwind Premiums', due: '2026-10-25', amount: money(28715), repeats: 'monthly' });
  made('obligations', { what: 'Accountant', due: '2026-10-28', amount: money(50000), repeats: 'none' });
  made('recurring', { what: 'Northwind Premiums', next_due: '2026-10-25', amount: money(28715) });
  made('recurring', { what: 'Prism contractor fee', next_due: '2026-10-08', amount: money(200000), state: 'paused' });
  made('tasks', { what: 'File the return', by: '2026-10-26' });
  return k;
}

const due = (k: Kernel): string[] =>
  (k.block({ kind: 'table', source: 'deadlines', horizon: 14 }).rows ?? []).map((r) => `${String(r.fields.day)} ${String(r.fields.title)} (${String(r.fields.row)})`);

test('A PAUSED LINE IS NOT LATE, AND A REPEATING BILL IS NAMED ONCE, ON ITS LINE, where the walk reads both lists', async () => {
  assert.deepEqual(due(await record(true)), [
    '2026-10-25 Northwind Premiums (recurring#1)',
    '2026-10-26 File the return (tasks#1)',
    '2026-10-28 Accountant (obligations#2)',
  ]);
});

test('A RECORD THAT WALKS NOTHING KEEPS EVERY ROW THAT IS NOT FINISHED, as it did', async () => {
  assert.deepEqual(due(await record(false)), [
    '2026-10-08 Prism contractor fee (recurring#2)',
    '2026-10-25 Northwind Premiums (obligations#1)',
    '2026-10-25 Northwind Premiums (recurring#1)',
    '2026-10-26 File the return (tasks#1)',
    '2026-10-28 Accountant (obligations#2)',
  ]);
});
