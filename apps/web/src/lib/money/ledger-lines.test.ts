/**
 * The Ledger view of an add-on's table of ledger lines says who was paid as words, as the cards beside it do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linesSaid, titleSaid } from './ledger-lines.ts';

test('a bank line in capitals is said as the Ledger says it', () => {
  assert.equal(titleSaid('RAVENSWORTH LTD INV 2026-038'), 'Ravensworth Ltd');
  assert.equal(titleSaid('PAPERHAUS SUPPLIES'), 'Paperhaus Supplies');
});

test('words already written as words, an empty cell and a missing one are left as they are', () => {
  assert.equal(titleSaid('Studio rent'), 'Studio rent');
  assert.equal(titleSaid(''), '');
  assert.equal(titleSaid(null), null);
});

test('a link keeps its address and says its text as words', () => {
  assert.equal(titleSaid('[PAPERHAUS SUPPLIES](/r/transactions/12)'), '[Paperhaus Supplies](/r/transactions/12)');
});

test('only the title columns change, and a row with nothing to change is the same row', () => {
  const kept = { key: 'b', cells: ['2 Oct', 'Studio rent', 'GBP 900.00'] };
  const rows = [{ key: 'a', cells: ['1 Oct', 'PAPERHAUS SUPPLIES', 'GBP 24.00', 'PAPERHAUS SUPPLIES'] }, kept];
  const said = linesSaid(rows, [1]);
  assert.deepEqual(said[0]?.cells, ['1 Oct', 'Paperhaus Supplies', 'GBP 24.00', 'PAPERHAUS SUPPLIES']);
  assert.equal(said[1], kept);
  assert.deepEqual(rows[0]?.cells[1], 'PAPERHAUS SUPPLIES');
});
