/**
 * A ledger line still waiting to clear says so on Money home's Ledger tile (finish F3), as the Ledger lists it apart and
 * Budgets counts it: the tile drew the pending £2,500 like any cleared line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { WAITING_TO_CLEAR, pendingSaid } from './page-live.ts';
import type { Entry } from './schema.ts';

const COLUMNS = [{ field: 'on' }, { field: 'payee' }, { field: 'amount' }, { field: 'category' }, { field: 'account' }, { field: 'category' }];
const entry = (state: string): Entry => ({ id: state, register: 'transactions', seq: 1, fields: { state }, state, version: 1, created_at: '', updated_at: '', deleted_at: null }) as never;
const row = (account: string | null) => ({ cells: ['3 Sep', 'Grangemoor Events', '−£2,500', 'Production', account, 'Production'] });

test('A PENDING LINE SAYS "Waiting to clear" UNDER ITS NAME IN PLACE OF ITS ACCOUNT; a cleared line is left as it is', () => {
  const rows = [row('Studio current account'), row('Studio current account'), row(null)];
  pendingSaid('transactions', COLUMNS, [entry('pending'), entry('cleared'), entry('pending')], rows);
  assert.equal(rows[0]!.cells[4], WAITING_TO_CLEAR);
  assert.equal(rows[0]!.cells[3], 'Production', 'the category picks the chip, so it stays');
  assert.equal(rows[1]!.cells[4], 'Studio current account');
  assert.equal(rows[2]!.cells[4], WAITING_TO_CLEAR);
});

test('A LIST WITH NO ACCOUNT UNDER THE NAME IS NOT TOUCHED', () => {
  const rows = [row('Studio current account')];
  pendingSaid('transactions', COLUMNS.slice(0, 3), [entry('pending')], rows);
  assert.equal(rows[0]!.cells[4], 'Studio current account');
});
