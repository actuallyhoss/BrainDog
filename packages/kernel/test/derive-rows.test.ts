/**
 * A page of rows leaving the kernel with each derived field filled: `via` resolved once a page with the reader's
 * sight, nothing stored, and the figures the unit's done-when names (3 and 4.00 read 12.00; two currencies read none).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Json } from '../src/coerce.ts';
import { oneWithDerived, withDerived, type DeriveResolve } from '../src/derive-rows.ts';
import type { DeriveField } from '../src/derive.ts';

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const FIELDS: DeriveField[] = [
  { id: 'price', type: 'money', currency_fixed: true },
  { id: 'fee', type: 'money', currency_fixed: true },
  { id: 'quantity', type: 'int' },
  { id: 'account', type: 'ref', to: 'accounts' },
  { id: 'total', type: 'money', derive: { product: ['price', 'quantity'] } },
  { id: 'charged', type: 'money', derive: { sum: ['price', 'fee'] } },
  { id: 'holder', type: 'text', derive: { via: { ref: 'account', field: 'name' } } },
];

type Row = { id: string; version: number; fields: Record<string, Json> };
const row = (id: string, fields: Record<string, Json>): Row => ({ id, version: 1, fields });

/** A resolver that counts its calls and answers only the accounts in `open`, as the reader's sight would. */
function sight(open: Record<string, string>) {
  const calls: { list: string; ids: readonly string[]; field: string }[] = [];
  const resolve: DeriveResolve = (list, ids, field) => {
    calls.push({ list, ids, field });
    return new Map(ids.filter((i) => Object.hasOwn(open, i)).map((i) => [i, open[i]!]));
  };
  return { calls, resolve };
}

test('a row with 3 and 4.00 reads 12.00 for product(price, quantity)', () => {
  const { resolve } = sight({});
  const [r] = withDerived([row('r1', { price: gbp(400), quantity: 3 })], FIELDS, resolve);
  assert.deepEqual(r!.fields.total, gbp(1200));
  assert.equal(r!.id, 'r1', 'the rest of the row passes through');
  assert.equal(r!.version, 1);
});

test('fifty rows with one via field call the resolver once, with the distinct links', () => {
  const { calls, resolve } = sight({ A1: 'Juniper Lane', A2: 'Harbour Mill' });
  const rows = Array.from({ length: 50 }, (_, i) => row(`r${i}`, { account: i % 2 ? 'A1' : 'A2', quantity: i }));
  const out = withDerived(rows, FIELDS, resolve);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.list, 'accounts');
  assert.equal(calls[0]!.field, 'name');
  assert.deepEqual([...calls[0]!.ids].sort(), ['A1', 'A2']);
  assert.equal(out[1]!.fields.holder, 'Juniper Lane');
  assert.equal(out[2]!.fields.holder, 'Harbour Mill');
});

test('a link the reader cannot open derives null', () => {
  const { resolve } = sight({ A1: 'Juniper Lane' });
  const out = withDerived([row('r1', { account: 'A1' }), row('r2', { account: 'HIDDEN' })], FIELDS, resolve);
  assert.equal(out[0]!.fields.holder, 'Juniper Lane');
  assert.equal(out[1]!.fields.holder, null);
});

test('money in two currencies under sum gives null', () => {
  const { resolve } = sight({});
  const [r] = withDerived([row('r1', { price: gbp(400), fee: { amount: 50, currency: 'EUR' } })], FIELDS, resolve);
  assert.equal(r!.fields.charged, null);
});

test('nothing is stored: the rows given are untouched, and a value under a derived name is written over', () => {
  const { resolve } = sight({});
  const given = row('r1', { price: gbp(400), quantity: 3, total: gbp(1) });
  const [r] = withDerived([given], FIELDS, resolve);
  assert.deepEqual(r!.fields.total, gbp(1200));
  assert.deepEqual(given.fields.total, gbp(1), 'the row read is not changed');
  assert.equal(Object.hasOwn(given.fields, 'holder'), false);
});

test('a page that links nowhere asks the resolver nothing, and a list with no derived field is handed back', () => {
  const { calls, resolve } = sight({});
  withDerived([row('r1', { quantity: 2 })], FIELDS, resolve);
  assert.equal(calls.length, 0);
  const plain = [row('r1', { quantity: 2 })];
  const out = withDerived(plain, [{ id: 'quantity', type: 'int' }], resolve);
  assert.equal(out[0], plain[0]);
});

test('one row goes through the same door', () => {
  const { calls, resolve } = sight({ A1: 'Juniper Lane' });
  const r = oneWithDerived(row('r1', { account: 'A1', price: gbp(250), quantity: 2 }), FIELDS, resolve);
  assert.equal(r.fields.holder, 'Juniper Lane');
  assert.deepEqual(r.fields.total, gbp(500));
  assert.equal(calls.length, 1);
});
