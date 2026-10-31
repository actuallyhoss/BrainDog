/**
 * The Orders box reads its line as Tell reads an order (audit 31 Oct m, AM11).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstPartyDocument } from '@braindog/seed/packs';

import type { FieldDecl } from '../record/schema.ts';
import { orderLine } from './order-line.ts';
import type { TellList } from './read.ts';

const people = ((firstPartyDocument('people' as never)?.declarations ?? []) as { register?: string; name: string; title: string; fields: FieldDecl[] }[]).find((d) => d.register === 'people')!;
const PEOPLE: TellList = { id: 'people', name: people.name, title: people.title, fields: people.fields };
const ORDERS: TellList = {
  id: 'orders',
  name: 'Orders',
  one: 'order',
  title: 'what',
  fields: [
    { id: 'who', type: 'ref', to: 'people' },
    { id: 'what', type: 'text', required: true },
    { id: 'how_many', label: 'How many', type: 'int' },
    { id: 'due', type: 'day', deadline: true },
    { id: 'state', type: 'enum', values: ['new', 'ready', 'sent', 'paid'], default: 'new', required: true },
  ],
};
const TODAY = '2026-10-07';

test('the box and Tell make the same order: what, how many, who and the day', () => {
  const box = orderLine('20 candles for Salma by Friday', ORDERS, PEOPLE, [], TODAY)!;
  assert.deepEqual(box.fields, { what: 'Candles', how_many: 20, due: '2026-10-09' });
  assert.deepEqual(box.person?.fields, { name: 'Salma', role: 'client' });
  assert.equal(box.whoField, 'who');
  const told = orderLine('Salma ordered 20 lavender candles for Friday', ORDERS, PEOPLE, [{ seq: 4, name: 'Salma' }], TODAY)!;
  assert.deepEqual(told.fields, { what: 'Lavender candles', how_many: 20, due: '2026-10-09', who: 'people#4' });
  assert.equal(told.person, null);
});

test('a line that is no order, or more than one, is left to the box as it was', () => {
  assert.equal(orderLine('lavender candles', ORDERS, PEOPLE, [], TODAY), null);
  assert.equal(orderLine('20 candles for Salma', { ...ORDERS, name: 'Products', one: 'product' }, PEOPLE, [], TODAY), null);
});
