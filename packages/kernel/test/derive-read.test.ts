/**
 * A field worked out from other fields (SHL-B18), on a real record: it installs, it reads right on every way a row
 * leaves the kernel (one row, a page, a search hit), it is never stored, and it cannot be written or sorted on. A
 * `via` page of fifty rows costs one lookup, and a link the reader cannot open derives null.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMPANIES } from '../../../fixtures/names.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const ORDERS: Declaration = {
  id: 'register.orders',
  kind: 'register',
  body: {
    id: 'orders',
    name: 'Orders',
    title: 'item',
    fields: [
      { id: 'item', type: 'text', required: true, search: true },
      { id: 'price', type: 'money', currency_fixed: true },
      { id: 'fee', type: 'money', currency_fixed: true },
      { id: 'quantity', type: 'int' },
      { id: 'account', type: 'ref', to: 'accounts' },
      { id: 'total', type: 'money', derive: { product: ['price', 'quantity'] } },
      { id: 'charged', type: 'money', derive: { sum: ['price', 'fee'] } },
      { id: 'holder', type: 'text', derive: { via: { ref: 'account', field: 'name' } } },
    ],
  } as never,
};

/** A record with both lists, and a count of the lookups a `via` makes: one `id IN (...)` read of the far list each. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; lookups: () => number }> {
  const sql = openSqlite();
  let n = 0;
  const all = sql.all.bind(sql);
  sql.all = ((text: string, ...params: never[]) => {
    if (text.includes('AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))')) n += 1;
    return all(text, ...params);
  }) as typeof sql.all;
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, ORDERS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql, lookups: () => n };
}

const made = (k: Kernel, register: string, fields: Record<string, unknown>): Entry => {
  const out = k.create(register, fields as never, { actor: 'p_1' }) as { ok: boolean; value: Entry; refusal?: unknown };
  assert.ok(out.ok, JSON.stringify(out.refusal));
  return out.value;
};

const page = (r: unknown): Entry[] => {
  const x = r as { ok: boolean; value: { rows: Entry[] }; refusal?: unknown };
  assert.ok(x.ok, JSON.stringify(x.refusal));
  return x.value.rows;
};

test('3 times GBP 4.00 reads GBP 12.00 through one row, a page and a search hit', async () => {
  const { k } = await record();
  const lamp = made(k, 'orders', { item: 'Desk lamp', price: gbp(400), quantity: 3 });
  assert.deepEqual(k.get(lamp.id)?.fields.total, gbp(1200), 'one row');
  assert.deepEqual(page(k.list({ register: 'orders' }))[0]?.fields.total, gbp(1200), 'a page');
  const hits = k.search('lamp');
  assert.equal(hits.length, 1);
  assert.deepEqual(k.get(hits[0]!.id)?.fields.total, gbp(1200), 'a search hit');
});

test('nothing is stored under a derived field', async () => {
  const { k, sql } = await record();
  const lamp = made(k, 'orders', { item: 'Desk lamp', price: gbp(400), quantity: 3 });
  const stored = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', lamp.id)!;
  assert.equal(Object.hasOwn(JSON.parse(stored.fields), 'total'), false);
  assert.equal(Object.hasOwn(lamp.fields, 'total'), false, 'the write answers what it stored');
});

test('a write to a derived field is refused, on a create and on an edit', async () => {
  const { k } = await record();
  const created = k.create('orders', { item: 'Desk lamp', total: gbp(1) } as never, { actor: 'p_1' }) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(created.ok, false);
  assert.equal(created.refusal?.code, 'IMMUTABLE_FIELD');
  assert.equal(created.refusal?.at, 'total');
  const lamp = made(k, 'orders', { item: 'Desk lamp', price: gbp(400), quantity: 3 });
  const edited = k.update('orders', lamp.id, { total: gbp(1) } as never, { actor: 'p_1' }) as { ok: boolean; refusal?: { code: string } };
  assert.equal(edited.ok, false);
  assert.equal(edited.refusal?.code, 'IMMUTABLE_FIELD');
});

test('two currencies derive null, and a missing source null, never zero', async () => {
  const { k } = await record();
  const two = made(k, 'orders', { item: 'Shelf', price: gbp(400), fee: { amount: 100, currency: 'EUR' } });
  const one = made(k, 'orders', { item: 'Chair', price: gbp(400), fee: gbp(150) });
  assert.equal(k.get(two.id)?.fields.charged, null);
  assert.deepEqual(k.get(one.id)?.fields.charged, gbp(550));
  assert.equal(k.get(one.id)?.fields.total, null, 'no quantity written, so no total');
});

test('a via page of fifty rows makes one lookup, and a page with no link makes none', async () => {
  const { k, lookups } = await record();
  const accounts = COMPANIES.slice(0, 3).map((name) => made(k, 'accounts', { name }));
  for (let i = 0; i < 50; i += 1) made(k, 'orders', { item: `Order ${i + 1}`, account: accounts[i % 3]!.id });
  const before = lookups();
  const rows = page(k.list({ register: 'orders', limit: 50 }));
  assert.equal(rows.length, 50);
  assert.equal(lookups() - before, 1, 'one query for the page');
  for (const r of rows) assert.ok((COMPANIES as readonly string[]).includes(String(r.fields.holder)));
  const plain = await record();
  made(plain.k, 'orders', { item: 'Unlinked' });
  const was = plain.lookups();
  page(plain.k.list({ register: 'orders' }));
  assert.equal(plain.lookups() - was, 0);
});

test('a link the reader cannot open derives null, on a page and on one row', async () => {
  const { k } = await record();
  const account = made(k, 'accounts', { name: COMPANIES[1]! });
  const lamp = made(k, 'orders', { item: 'Desk lamp', account: account.id });
  const notAccounts = (register: string) => register !== 'accounts';
  assert.equal(page(k.list({ register: 'orders', reads: notAccounts }))[0]?.fields.holder, null);
  assert.equal(page(k.list({ register: 'orders', hops: notAccounts }))[0]?.fields.holder, null);
  assert.equal(k.get(lamp.id, { reads: notAccounts })?.fields.holder, null);
  assert.equal(k.get(lamp.id)?.fields.holder, COMPANIES[1], 'the record itself sees it');
});

test('a sort or a filter on a derived field is refused in one sentence', async () => {
  const { k } = await record();
  const out = k.list({ register: 'orders', order: [{ field: 'total', dir: 'desc' }] }) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(out.refusal?.fix, 'total is worked out at read and never stored, so it cannot be filtered or sorted on.');
  const filtered = k.list({ register: 'orders', where: { field: 'quantity', present: true } as never }) as { ok: boolean };
  assert.equal(filtered.ok, true, 'a stored field beside it still filters');
  const over = k.list({ register: 'orders', where: { field: 'holder', empty: true } as never }) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(over.ok, false);
  assert.equal(over.refusal?.code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(over.refusal?.fix, 'holder is worked out at read and never stored, so it cannot be filtered or sorted on.');
});

test('a malformed derive is refused at install, by the field it is on', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const bad = (derive: unknown) => ({
    ...ORDERS,
    body: { ...(ORDERS.body as object), fields: [{ id: 'item', type: 'text' }, { id: 'price', type: 'money', currency_fixed: true }, { id: 'total', type: 'money', derive }] },
  });
  for (const derive of [{ times: ['price', 'item'] }, { product: ['price'] }, { product: ['price', 'nosuch'] }]) {
    const out = (await k.install([bad(derive) as Declaration])) as { ok: boolean; refusal?: { code: string; fix: string } };
    assert.equal(out.ok, false, JSON.stringify(derive));
    assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
    assert.match(out.refusal!.fix, /^total /u, 'the sentence names the field');
  }
});
