/**
 * WHAT A CAPTURE STILL HAS TO ASK.
 *
 * `capturedFields` fills a required field with the emptiest value of its type and says so afterwards. On a list
 * whose required fields are a figure, a day and a row in another list, that is a movement of nothing, today, into
 * no account: the record refuses it for the account and the two it accepted were never said by anybody. `askedOf`
 * names those fields so a capture can draw a box for each instead.
 *
 * A FIGURE OR A DAY SOMEBODY HANDED IN IS AN ANSWER, the same as a text is: only what was filled on the reader's
 * behalf and is still as it was filled gets a box. And a list's own declaration answers a choice only where it
 * declares a default or the choice is the list's state, so which way a movement went is asked, never picked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { captureRow } from '../page/capture.ts';
import { askedOf, capturedFields } from './rows-write.ts';
import type { Entry } from './schema.ts';

const AT = Date.UTC(2026, 8, 3, 12);

test('a movement asks for its day, which way, its amount and its account, in the order the list declares them', () => {
  const asked = askedOf('transactions', capturedFields('transactions', 'Coffee', [], AT));
  assert.deepEqual(asked, [
    { id: 'on', label: 'Date', type: 'day' },
    { id: 'direction', label: 'Which way', type: 'enum' },
    { id: 'amount', label: 'Amount', type: 'money' },
    { id: 'account', label: 'Account', type: 'ref', to: 'accounts' },
  ]);
});

test('a field the declaration answers with its declared default is not asked', () => {
  const asked = askedOf('transactions', capturedFields('transactions', 'Coffee', [], AT));
  /* The status declares the one a movement starts with, filled and said as it always was. */
  assert.ok(!asked.some((f) => f.id === 'state'));
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
  assert.deepEqual(askedOf('transactions', captured).map((f) => f.id), ['on', 'direction', 'amount', 'account']);
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

test('something owed asks which way, its amount and the day it is due, and never its status', () => {
  const asked = askedOf('obligations', capturedFields('obligations', 'Rent, September', [], AT));
  /* The status declares no default, and a new one starts in the list's first state all the same. */
  assert.deepEqual(asked.map((f) => f.id), ['direction', 'amount', 'due']);
});

test('a day read off the typed line is an answer, today or any other day', () => {
  const read = captureRow('transactions', 'Coffee', { direction: 'out' }, AT, { on: '2026-09-04' });
  assert.ok(read);
  assert.deepEqual(askedOf('transactions', read).map((f) => f.id), ['amount', 'account']);
  /* The same day as today, when the line said it: it is the sentence that tells them apart, never the value. */
  const today = captureRow('transactions', 'Coffee', { direction: 'out' }, AT, { on: '2026-09-03' });
  assert.ok(today);
  assert.deepEqual(askedOf('transactions', today).map((f) => f.id), ['amount', 'account']);
});

test('a figure handed in is an answer, with or without the sentence that said it was filled', () => {
  const filled = capturedFields('transactions', 'Coffee', [{ field: 'direction', op: 'is', values: ['out'] }], AT);
  const paid = { amount: 450, currency: 'EUR' };
  /* Written over the fill by a caller that left `filled` as it was. */
  assert.deepEqual(askedOf('transactions', { ...filled, fields: { ...filled.fields, amount: paid } }).map((f) => f.id), ['on', 'account']);
  /* Handed in on a list that could fill no currency of its own, so no sentence was ever written. */
  assert.deepEqual(askedOf('transactions', { fields: { what: 'Coffee', amount: paid }, filled: [] }).map((f) => f.id), ['on', 'direction', 'account', 'state']);
  /* Nothing, still said to be filled, is nobody's figure. */
  assert.ok(askedOf('transactions', filled).some((f) => f.id === 'amount'));
});

test('which way is asked when it was picked for somebody, and not when the address said it', () => {
  /* "in" is the value written first, so the fill and a pin look the same: only `filled` says which it was. */
  const pinned = capturedFields('transactions', 'Refund', [{ field: 'direction', op: 'is', values: ['in'] }], AT);
  const picked = capturedFields('transactions', 'Refund', [], AT);
  assert.equal(pinned.fields.direction, picked.fields.direction);
  assert.ok(!askedOf('transactions', pinned).some((f) => f.id === 'direction'));
  assert.ok(askedOf('transactions', picked).some((f) => f.id === 'direction'));
});

test('a list the record has not described asks for nothing', () => {
  assert.deepEqual(askedOf('no_such_list', { fields: {}, filled: [] }), []);
});

test('capturedFields is as it was: it still fills and says what it filled', () => {
  const out = capturedFields('transactions', 'Coffee', [], AT);
  assert.deepEqual(Object.keys(out.fields), ['what', 'on', 'direction', 'amount', 'state']);
  assert.equal(out.filled.length, 4);
});
