/**
 * Renaming a list that no use case gives a word for (the audit of 25 October, Y21): Words and money listed 13 lists
 * of a record holding 29, because only the speaking use case's lists had a box.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listNameOf, othersOf, renamedBody } from './list-name.ts';

const LISTS = [
  { id: 'kilns', name: 'Kilns' },
  { id: 'glazes', name: 'Glazes' },
  { id: 'firing_logs', name: 'Firing logs' },
];

test('the lists a use case names nothing for are every other list the record holds, in its order', () => {
  assert.deepEqual(othersOf(['glazes'], LISTS).map((l) => l.id), ['kilns', 'firing_logs']);
  assert.deepEqual(othersOf([], LISTS).map((l) => l.id), ['kilns', 'glazes', 'firing_logs']);
});

test('a new name is trimmed, and an empty, unchanged or taken one is said', () => {
  assert.deepEqual(listNameOf(LISTS, 'kilns', '  Kiln   rooms '), { ok: true, name: 'Kiln rooms' });
  assert.equal(listNameOf(LISTS, 'kilns', 'Kilns').ok, false);
  assert.equal(listNameOf(LISTS, 'kilns', '   ').ok, false);
  const taken = listNameOf(LISTS, 'kilns', 'glazes');
  assert.equal(taken.ok, false);
  assert.match(taken.ok ? '' : taken.fix, /Glazes/u);
});

test('only the name moves: the id, the fields and what one is called stay', () => {
  const body = { id: 'kilns', name: 'Kilns', one: 'kiln', fields: [{ id: 'name', type: 'text' }] };
  assert.deepEqual(renamedBody(body, 'Kiln rooms'), { ...body, name: 'Kiln rooms' });
});
