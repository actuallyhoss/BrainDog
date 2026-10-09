/**
 * `{{<figure>.first_<field>}}`: one field of the first row a figure counts, the row `.first` names, so a shop's page can
 * say "Salma still owes EGP 1,350" where it said "1 unpaid".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };
const egp = (amount: number) => ({ amount, currency: 'EGP' });

const ORDERS: Declaration = {
  id: 'register.orders',
  kind: 'register',
  body: {
    id: 'orders',
    name: 'Orders',
    title: 'customer',
    state: 'state',
    fields: [
      { id: 'customer', type: 'text', required: true },
      { id: 'owed', type: 'money' },
      { id: 'placed', type: 'day' },
      { id: 'notes', type: 'document' },
      { id: 'state', type: 'enum', values: ['unpaid', 'paid'], required: true },
    ],
  },
};

const OWING: Declaration = {
  id: 'metric.orders-owing',
  kind: 'metric',
  body: { metric: 'orders-owing', name: 'Still owing', source: 'register.orders', where: 'state is unpaid, placed before today', value: { count: 'customer' }, format: 'int', target: { lte: 0 }, window: '30d', compare: 'none' } as never,
};

const BODY = '{{orders-owing.first}} still owes {{money:orders-owing.first_owed}}, since {{date:orders-owing.first_placed}}. {{orders-owing.first_notes}} {{orders-owing.first_ownd}}';

const PAGE: Declaration = {
  id: 'page.orders',
  kind: 'page',
  body: { page: 'orders', title: 'Orders', requires: ['register.orders'], blocks: [{ kind: 'note', lead: true, body: BODY }] } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ORDERS, OWING, PAGE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

type Note = { values?: Record<string, unknown>; unnamed?: string[] };
const noteOf = (k: Kernel): Note => {
  const out = k.page('orders');
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.blocks[0] as Note;
};

test('THE FIRST ROW’S FIELD IS THE SAME ROW AS ITS NAME: Salma still owes EGP 1,350', async () => {
  const { k, sql } = await record();
  for (const [customer, owed, placed, state] of [
    ['Omar', 40_000, '2026-09-28', 'unpaid'],
    ['Salma', 135_000, '2026-09-20', 'unpaid'],
    ['Nour', 9_000, '2026-09-10', 'paid'],
  ] as const)
    assert.ok(k.create('orders', { customer, owed: egp(owed), placed, state, notes: 'A long paragraph.' }, OWNER).ok, customer);
  const note = noteOf(k);
  /* Salma's order is the one owed longest, so she leads, and her amount and day come with her. */
  assert.equal(note.values?.['orders-owing.first'], 'Salma');
  assert.deepEqual(note.values?.['orders-owing.first_owed'], egp(135_000));
  assert.equal(note.values?.['orders-owing.first_placed'], '2026-09-20');
  assert.ok(!('orders-owing.first_notes' in (note.values ?? {})), 'a document of the first row was answered');
  sql.close();
});

test('a field the list does not declare is the author’s word, and a long one is named but never read', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('orders', { customer: 'Salma', owed: egp(135_000), placed: '2026-09-20', state: 'unpaid' }, OWNER).ok);
  const note = noteOf(k);
  assert.deepEqual(note.unnamed, ['orders-owing.first_ownd']);
  sql.close();
});

test('with nothing owed the first row’s field is nothing, and the clause is dropped as any figure’s is', async () => {
  const { k, sql } = await record();
  const note = noteOf(k);
  assert.ok(!('orders-owing.first_owed' in (note.values ?? {})));
  assert.ok(!(note.unnamed ?? []).includes('orders-owing.first_owed'), 'a declared field read as a typo');
  sql.close();
});
