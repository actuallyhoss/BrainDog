/**
 * A COLUMN'S SECOND FIELD (`or`), read by `toRows` when the first holds nothing.
 *
 * The Ledger tile's name column is who was paid, and most lines of a bank feed name nobody: the cell was empty beside a
 * date and an amount, so a line said nothing about what it was. A column declared `{ field: 'payee', or: 'what' }` says
 * the description there instead. Each test of the fallback fails on a `toRows` that reads `field` alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { toRows } from './api.ts';
import type { Entry, Fields } from './schema.ts';

const AT = Date.parse('2026-10-09T12:00:00.000Z');

const line = (seq: number, fields: Fields): Entry => ({
  seq,
  fields: { on: '2026-10-08', direction: 'out', ...fields },
  version: 1,
  created: '2026-10-08T09:00:00.000Z',
  by: 'bank feed',
});

const column = (field: string, label: string, or?: string) => ({ field, label, width: '1fr', ...(or === undefined ? {} : { or }) });

const NAMED = [column('payee', 'Paid to or from', 'what')];
const PLAIN = [column('payee', 'Paid to or from')];

const cell = (fields: Fields, columns = NAMED) => toRows('transactions', [line(1, fields)], columns, AT)[0]!.cells[0];

test('an empty first field reads the second', () => {
  assert.equal(cell({ what: 'POS purchase 4417' }), 'POS purchase 4417');
  assert.equal(cell({ payee: null, what: 'POS purchase 4417' }), 'POS purchase 4417');
  assert.equal(cell({ payee: '', what: 'POS purchase 4417' }), 'POS purchase 4417');
});

test('a first field that holds something wins', () => {
  assert.equal(cell({ payee: 'Chillout', what: 'POS purchase 4417' }), 'Chillout');
});

test('both empty is the empty cell', () => {
  assert.equal(cell({}), null);
  assert.equal(cell({ payee: null, what: '' }), null);
});

test('a column with no second field is unchanged', () => {
  assert.equal(cell({ what: 'POS purchase 4417' }, PLAIN), null);
  assert.equal(cell({ payee: 'Chillout', what: 'POS purchase 4417' }, PLAIN), 'Chillout');
});

test('the second field is drawn as its own type, not the first field\'s', () => {
  /* `direction` is an enum and `payee` is text: the fallback reads in sentence case, as the enum's own column would. */
  const columns = [column('payee', 'Paid to or from', 'direction')];
  const own = toRows('transactions', [line(1, {})], [column('direction', 'Direction')], AT)[0]!.cells[0];
  assert.equal(cell({}, columns), own);
  assert.notEqual(own, null);
});

test('the other columns of a line stay where they were', () => {
  const columns = [column('on', 'Date'), ...NAMED, column('what', 'Description')];
  const [row] = toRows('transactions', [line(7, { what: 'Rent' })], columns, AT);
  assert.equal(row!.cells.length, 3);
  assert.equal(row!.cells[1], 'Rent');
  assert.equal(row!.cells[2], 'Rent');
  assert.equal(row!.key, 'transactions#7');
});
