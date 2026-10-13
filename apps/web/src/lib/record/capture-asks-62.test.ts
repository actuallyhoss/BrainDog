/**
 * WHAT A CAPTURE STILL HAS TO ASK.
 *
 * `capturedFields` fills a required field with the emptiest value of its type and says so afterwards. On a list
 * whose required fields are a figure, a day and a row in another list, that is a movement of nothing, today, into
 * no account: the record refuses it for the account and the two it accepted were never said by anybody. `askedOf`
 * names those fields so a capture can draw a box for each instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { askedOf, capturedFields } from './rows-write.ts';
import type { Entry } from './schema.ts';

const AT = Date.UTC(2026, 8, 3, 12);

test('a movement asks for its day, its amount and its account, in the order the list declares them', () => {
  const asked = askedOf('transactions', capturedFields('transactions', 'Coffee', [], AT));
  assert.deepEqual(asked, [
    { id: 'on', label: 'Date', type: 'day' },
    { id: 'amount', label: 'Amount', type: 'money' },
    { id: 'account', label: 'Account', type: 'ref', to: 'accounts' },
  ]);
});

test('a field the declaration answers with one of its own values is not asked', () => {
  const asked = askedOf('transactions', capturedFields('transactions', 'Coffee', [], AT));
  /* Which way and the status are each one of a declared few, filled and said as they always were. */
  assert.ok(!asked.some((f) => f.id === 'direction' || f.id === 'state'));
  /* The title is the line being typed. */
  assert.ok(!asked.some((f) => f.id === 'what'));
  /* What is not required is never asked. */
  assert.ok(!asked.some((f) => f.id === 'category' || f.id === 'note'));
});

test('the amount is asked whether or not the rows on screen gave it a currency', () => {
  const seen: Entry[] = [{ seq: 1, version: 1, fields: { amount: { amount: 480_000, currency: 'EUR' } } } as unknown as Entry];
  const captured = capturedFields('transactions', 'Coffee', [], AT, seen);
  /* Filled with nothing in the currency on screen, which is a figure nobody said. */
  assert.deepEqual(captured.fields.amount, { amount: 0, currency: 'EUR' });
  assert.deepEqual(askedOf('transactions', captured).map((f) => f.id), ['on', 'amount', 'account']);
});

test('a field the address pinned is an answer already given', () => {
  const pinned = capturedFields('transactions', 'Coffee', [{ field: 'direction', op: 'is', values: ['out'] }], AT);
  assert.equal(pinned.fields.direction, 'out');
  assert.deepEqual(askedOf('transactions', pinned).map((f) => f.id), ['on', 'amount', 'account']);

  /* A capture handed a required field by whoever built it (a pinned account, say) does not ask for it again. */
  const withAccount = { ...pinned, fields: { ...pinned.fields, account: 'accounts#1' } };
  assert.deepEqual(askedOf('transactions', withAccount).map((f) => f.id), ['on', 'amount']);
});

test('a list that needs only its title asks for nothing', () => {
  assert.deepEqual(askedOf('tasks', capturedFields('tasks', 'Chase Halden', [], AT)), []);
});

test('something owed asks for its amount and the day it is due', () => {
  const asked = askedOf('obligations', capturedFields('obligations', 'Rent, September', [], AT));
  assert.deepEqual(asked.map((f) => f.id), ['amount', 'due']);
});

test('a list the record has not described asks for nothing', () => {
  assert.deepEqual(askedOf('no_such_list', { fields: {}, filled: [] }), []);
});

test('capturedFields is as it was: it still fills and says what it filled', () => {
  const out = capturedFields('transactions', 'Coffee', [], AT);
  assert.deepEqual(Object.keys(out.fields), ['what', 'on', 'direction', 'amount', 'state']);
  assert.equal(out.filled.length, 4);
});
