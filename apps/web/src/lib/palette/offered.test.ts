/**
 * Who the palette's add row is offered to once `boot` says the level held on each list (COL-13).
 *
 * `create.test.ts` holds the row to a caller who may add, on a host that sends no `me.levels`. This holds it to the
 * list-by-list answer: a list the caller reads and cannot add to is not named by the row, whatever they hold elsewhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../record/fixtures/fill.ts';
import { offered } from './create.ts';

const LISTS = [
  { id: 'tasks', name: 'Tasks' },
  { id: 'obligations', name: 'Money owed' },
];
const ids = (me: Parameters<typeof offered>[0]['me']) => offered({ lists: LISTS, ...(me ? { me } : {}) }).map((l) => l.id);

test('A LIST THE CALLER ONLY READS IS NOT OFFERED, and one they edit or add to is', () => {
  /* A BOOKKEEPER WITH EDITS ON ONE LIST AND READS ON THE OTHER: `create` would refuse the second, so the row is absent. */
  assert.deepEqual(ids({ level: 'read', lists: ['tasks', 'obligations'], levels: { tasks: 'write', obligations: 'read' } }), ['tasks']);
  /* ADDS ONLY IS THE RUNG THAT ADDS AND READS NOTHING, and the palette is how they add without a list to open. */
  assert.deepEqual(ids({ level: 'append', lists: null, levels: { tasks: 'append', obligations: 'append' } }), ['tasks', 'obligations']);
  /* A LIST THE RECORD NAMED NOTHING FOR IS ONE THE CALLER HOLDS NOTHING ON, whatever the record-wide word says. */
  assert.deepEqual(ids({ level: 'owner', lists: null, levels: { tasks: 'owner' } }), ['tasks']);
  assert.deepEqual(ids({ level: 'read', lists: null, levels: { tasks: 'read', obligations: 'read' } }), []);
});
