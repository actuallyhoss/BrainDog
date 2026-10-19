/** `kept-row.ts`: a row's page is kept whole or not at all, and comes back with its names as the map the page reads. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keptRowOf, rowFrom, rowLists } from './kept-row.ts';
import type { Got } from '../../../../lib/record/row-live.ts';
import type { RegisterDecl } from '../../../../lib/record/schema.ts';

const entry = { seq: 4, fields: { name: 'Kiln' }, version: 2, created: '2026-10-01', by: '' };
const got: Got = { from: 'live', entry, names: Object.assign(new Map([['people#1', 'Ada']]), { marks: new Map() }) as never };
const told = { from: 'live' as const, lines: [{ by: 'Ada', note: 'created', at: '2026-10-01' }], now: 1 };
const linked = { from: 'live' as const, groups: [{ register: 'tasks' } as never], cursor: null };

test('KEPT WHOLE: the three answers, the names as pairs, and back as a map', () => {
  const kept = keptRowOf(got, told, linked)!;
  assert.deepEqual(JSON.parse(JSON.stringify(kept)).names, [['people#1', 'Ada']]);
  const back = rowFrom(kept);
  assert.equal(back.got.from === 'live' && back.got.names.get('people#1'), 'Ada');
  assert.deepEqual(back.told, told);
});

test('NOT KEPT: a refused read, a row the record does not hold, a merged number', () => {
  assert.equal(keptRowOf({ from: 'refused', fix: 'no' }, told, linked), null);
  assert.equal(keptRowOf(got, { from: 'refused', fix: 'no' }, linked), null);
  assert.equal(keptRowOf({ ...got, entry: null } as Got, told, linked), null);
  assert.equal(keptRowOf({ ...got, folded: 3 } as Got, told, linked), null);
});

test('THE LISTS: the row, what its refs name, and what points at it, once each', () => {
  const decl = { fields: [{ id: 'owner', type: 'ref', to: 'people' }, { id: 'name', type: 'text' }] } as unknown as RegisterDecl;
  assert.deepEqual(rowLists('projects', decl, { ...linked, groups: [{ register: 'tasks' }, { register: 'people' }] as never }), ['projects', 'people', 'tasks']);
});
