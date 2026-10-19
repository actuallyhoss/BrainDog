/**
 * The shelf: how a kept component is stored, replaced and read back. Never rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SHELF_MOST, declaredOf, listOf, shelve, shelvedOf, unshelve } from './shelf.ts';

const BLOCK = {
  kind: 'bar',
  source: 'register.boats',
  columns: [{ field: 'owner', label: 'Owner', width: '9ch', align: 'end' }, { field: 'cost' }],
  authored: 'a | 1',
  rows: [1],
};

test('A KEPT BLOCK LOSES ITS ROWS AND ITS DRAWING HINTS, and keeps how it is built', () => {
  const out = declaredOf(BLOCK);
  assert.deepEqual(out, { kind: 'bar', source: 'register.boats', columns: [{ field: 'owner', label: 'Owner' }, { field: 'cost' }] });
});

test('SHELVING THE SAME NAME TWICE REPLACES, and a full shelf says so with null', () => {
  const one = shelve([], ' Boat costs ', BLOCK, 'a1')!;
  assert.equal(one[0]!.name, 'Boat costs');
  const two = shelve(one, 'boat COSTS', { ...BLOCK, kind: 'split' }, 'b2')!;
  assert.equal(two.length, 1);
  assert.equal(two[0]!.id, 'a1', 'a replaced item changed its id');
  assert.equal(two[0]!.block.kind, 'split');
  const full = Array.from({ length: SHELF_MOST }, (_, i) => ({ id: `i${i}`, name: `n${i}`, block: { kind: 'bar' } }));
  assert.equal(shelve(full, 'one more', BLOCK, 'z'), null);
  assert.equal(shelve(one, '   ', BLOCK, 'z'), null);
});

test('TAKING ONE OFF AND READING THE RECORDS ANSWER BACK', () => {
  const list = shelve([], 'Boat costs', BLOCK, 'a1')!;
  assert.deepEqual(unshelve(list, 'a1'), []);
  assert.deepEqual(shelvedOf(list), list);
  assert.deepEqual(shelvedOf([{ id: 1 }, null, { id: 'x', name: 'y', block: { nokind: 1 } }, 'z']), []);
  assert.deepEqual(shelvedOf(undefined), []);
});

test('A SHELVED BLOCK NAMES THE LIST IT READS, or none', () => {
  assert.equal(listOf({ kind: 'bar', source: 'register.boats' }), 'boats');
  assert.equal(listOf({ kind: 'note' }), null);
});
