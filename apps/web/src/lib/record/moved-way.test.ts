/**
 * MONEY OUT AND MONEY IN READ DIFFERENTLY ON A TIMELINE (moved-way-60).
 *
 * The money add-on signs the Ledger's one amount by Which way, and the reader (`markColumns`) writes the minus and the
 * plus on the cell. A table kept them. A timeline said each cell again from the raw field (`projectRows` in
 * `blocks.ts`), which is never handed the second field the sign is read from, so two movements of one amount on one day,
 * one out and one in, were drawn as the same line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { markColumns, toRows } from './api.ts';
import type { Entry } from './schema.ts';
import { toSegments } from './blocks.ts';

const COLUMNS = [{ field: 'on' }, { field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }];

const moved = (seq: number, direction: 'in' | 'out'): Entry =>
  ({
    seq,
    version: 1,
    created: '2026-09-01T09:00:00.000Z',
    by: 'you',
    fields: { what: direction === 'out' ? 'Rent' : 'Refund', on: '2026-09-01', direction, amount: { amount: 90000, currency: 'GBP' }, state: 'cleared' },
  }) as unknown as Entry;

test('A TIMELINE KEEPS THE SIGN ITS READER WROTE: one amount out and in on one day are two different lines', () => {
  const entries = [moved(901, 'out'), moved(902, 'in')];
  const rows = toRows('transactions', entries, COLUMNS as never);
  markColumns('transactions', COLUMNS, entries, rows, () => null);
  assert.match(String(rows[0]!.cells[2]), /^−/u);
  assert.match(String(rows[1]!.cells[2]), /^\+/u);

  const drawn = JSON.stringify(toSegments({ kind: 'timeline', register: 'transactions', columns: COLUMNS, entries, rows, matched: entries, shown: 2, total: 2 } as never));
  assert.ok(drawn.includes(String(rows[0]!.cells[2])), `the money out lost its minus: ${drawn}`);
  assert.ok(drawn.includes(String(rows[1]!.cells[2])), `the money in lost its plus: ${drawn}`);
});
