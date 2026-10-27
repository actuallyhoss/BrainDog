/**
 * A calendar of what falls due, with its money, is what Today's Due soon reads.
 *
 * His Today's Due soon named an insurance premium, a task and a salary coming in on 31 October, read across every
 * list (`sources/deadlines.ts`). Money's calendar of the next thirty days read Bills and invoices alone, so it marked 25
 * October and nothing else. A calendar over `deadlines` now
 * names a third column, the amount, signed by the way it goes, and draws only what the record's cash walk moves, as Due
 * soon does: a repeating bill once, on its line, and no paused line.
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
    { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], default: 'owed_by_me' },
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
    { id: 'direction', type: 'enum', values: ['in', 'out'], default: 'out' },
    { id: 'every', type: 'enum', values: ['monthly'], default: 'monthly' },
    { id: 'state', type: 'enum', values: ['live', 'paused', 'ended'], default: 'live' },
  ],
});

const TASKS = register('tasks', { name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'by', type: 'day', deadline: true }] });

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
    legs: [
      { register: 'obligations', on: 'due', amount: 'amount', where: 'state is open, repeats is not monthly', incoming: { field: 'direction', is: 'owed_to_me' } },
      { register: 'recurring', on: 'next_due', amount: 'amount', where: 'state is live', incoming: { field: 'direction', is: 'in' }, every: { field: 'every', months: { monthly: 1 } } },
    ],
    value: { walk: 'days_to_zero' },
    format: 'days',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    opening: { metric: 'cash' },
  },
} as never;

const usd = (amount: number) => ({ amount, currency: 'USD' });

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([BILLS, LINES, TASKS, ACCOUNTS, CASH, WALK]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (list: string, fields: Record<string, unknown>): void => {
    const out = k.create(list, fields, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
  };
  made('obligations', { what: 'Home insurance', due: '2026-10-25', amount: usd(28715), repeats: 'monthly' });
  made('recurring', { what: 'Home insurance', next_due: '2026-10-25', amount: usd(28715) });
  made('recurring', { what: 'Studio salary', next_due: '2026-10-31', amount: usd(401246), direction: 'in' });
  made('recurring', { what: 'Studio contractor fee', next_due: '2026-10-28', amount: usd(200000), state: 'paused' });
  made('obligations', { what: 'Accountant', due: '2026-11-06', amount: usd(50000), repeats: 'none' });
  made('tasks', { what: "Before the venue tour", by: '2026-10-26' });
  return k;
}

/** Money's calendar of the next thirty days, over every list. */
const BLOCK = {
  kind: 'calendar',
  source: 'deadlines',
  where: 'amount is set, day after yesterday, day before +31d',
  columns: [{ field: 'title' }, { field: 'day' }, { field: 'amount' }],
  back: 0,
  ahead: 1,
};

const drawn = (k: Kernel): string[] =>
  (k.block(BLOCK as never).rows ?? []).map((r) => {
    const m = r.fields.amount as { amount: number } | null;
    return `${String(r.fields.day)} ${String(r.fields.title)} ${String(r.fields.direction)} ${m ? m.amount : ''}`;
  });

test('THE CALENDAR OF THE NEXT THIRTY DAYS READS EVERY LIST, each line with its money and the way it goes, as Due soon reads them', async () => {
  const k = await record();
  const out = k.block(BLOCK as never);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(drawn(k), ['2026-10-25 Home insurance out 28715', '2026-10-31 Studio salary in 401246', '2026-11-06 Accountant out 50000']);
  /* THE SAME MONEY TODAY'S DUE SOON NAMES, over the same days: the task has no money and is the only line left out. */
  const soon = (k.block({ kind: 'table', source: 'deadlines', horizon: 30, where: 'day after yesterday' } as never).rows ?? []).map((r) => String(r.fields.title));
  assert.deepEqual(soon.filter((t) => t !== "Before the venue tour"), ['Home insurance', 'Studio salary', 'Accountant']);
});

test('A CALENDAR OVER DEADLINES TAKES THE AMOUNT AS ITS THIRD COLUMN AND NO OTHER', async () => {
  const k = await record();
  const said = (columns: string[]): string => k.block({ ...BLOCK, columns: columns.map((field) => ({ field })) } as never).refusals[0]?.fix ?? '';
  assert.equal(said(['title', 'day', 'amount']), '');
  assert.equal(said(['title', 'day']), '');
  assert.match(said(['title', 'day', 'row']), /title, day/u);
});
