/**
 * A COLUMN'S SECOND FIELD REACHES A LIVE PAGE (audit 72 finding 2).
 *
 * WHAT WAS MEASURED. `toRows` read `or:` where the first field held nothing, and `api-column-or.test.ts` proved it with a
 * column made by hand. Every live page makes its columns in `columnsOf`, which copied six keys and dropped `or`, so the
 * Ledger's "Paid to or from" cell stayed empty on a line with no payee. This goes through `blockOf`, as a page does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { blockOf } from './page-live.ts';

const AT = Date.parse('2026-10-09T12:00:00.000Z');

const line = (seq: number, fields: Record<string, unknown>) => ({
  register: 'transactions',
  seq,
  fields: { on: '2026-10-08', direction: 'out', ...fields },
  version: 1,
  created: '2026-10-08T09:00:00.000Z',
  by: 'bank feed',
});

const ledger = (or?: string) => ({
  kind: 'table',
  source: 'register.transactions',
  columns: [{ field: 'payee', label: 'Paid to or from', ...(or === undefined ? {} : { or }) }],
  rows: [line(1, { what: 'POS purchase 4417' }), line(2, { payee: 'Chillout', what: 'POS purchase 9' })],
  matched: 2,
  refusals: [],
});

test('a block declared with or: reads the second field where the first holds nothing', () => {
  const block = blockOf(ledger('what') as never, new Map(), AT);
  assert.equal(block.cannot, undefined);
  assert.deepEqual(block.rows.map((r) => r.cells[0]), ['POS purchase 4417', 'Chillout']);
});

test('a block with no or: leaves the cell empty, as it did', () => {
  const block = blockOf(ledger() as never, new Map(), AT);
  assert.deepEqual(block.rows.map((r) => r.cells[0]), [null, 'Chillout']);
});
