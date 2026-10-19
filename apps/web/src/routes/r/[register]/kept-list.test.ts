/** `kept-list.ts`: a list's first page goes into the local copy as plain JSON and comes back as the same names map. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countsOf, keptOf, listsOf, namesOf, servedWhole, spotOf } from './kept-list.ts';
import type { RegisterDecl } from '../../../lib/record/schema.ts';

const decl = {
  id: 'tasks',
  name: 'Tasks',
  one: 'task',
  title: 'title',
  mobile: ['title', 'state', 'project'],
  fields: [
    { id: 'title', type: 'text' },
    { id: 'project', type: 'ref', to: 'projects' },
    { id: 'people', type: 'list', of: 'ref', to: 'people' },
    { id: 'parent', type: 'ref', to: 'tasks' },
  ],
} as unknown as RegisterDecl;

test('THE LISTS AN ANSWER IS READ FROM: the list, then each list a ref points at, once', () => {
  assert.deepEqual(listsOf('tasks', decl), ['tasks', 'projects', 'people']);
});

test('THE NAMES GO AS PAIRS AND COME BACK AS A MAP, marks and all', () => {
  const names = Object.assign(new Map([['projects#1', 'Kiln']]), { marks: new Map([['projects#1', { mark: 'K' }]]) });
  const kept = keptOf(decl, [], 0, names as never);
  assert.deepEqual(JSON.parse(JSON.stringify(kept)).names, [['projects#1', 'Kiln']]);
  const back = namesOf(kept);
  assert.equal(back.get('projects#1'), 'Kiln');
  assert.deepEqual(back.marks?.get('projects#1'), { mark: 'K' });
  assert.equal(namesOf({ names: [], marks: null }).marks, undefined);
});

test('THE CURSOR AND THE COUNTS ARE KEPT, and only a copy holding both is drawn without asking', () => {
  const counted = new Map([['state', new Map([['open', 3]])]]);
  const kept = keptOf(decl, [], 3, new Map() as never, { cursor: 'c1', counted });
  assert.deepEqual(kept.counted, [['state', [['open', 3]]]]);
  assert.deepEqual(countsOf(kept.counted!).get('state')?.get('open'), 3);
  assert.equal(servedWhole(kept, true), true);
  assert.equal(servedWhole(keptOf(decl, [], 3, new Map() as never, { cursor: 'c1', counted: null }), true), false, 'counts the record withheld');
  assert.equal(servedWhole(keptOf(decl, [], 3, new Map() as never, { cursor: null, counted: null }), false), true, 'no bar, no counts needed');
  assert.equal(servedWhole(keptOf(decl, [], 3, new Map() as never), false), false, 'a copy kept before the cursor was');
});

test("THE PAGE'S SPOT: asked by its chips, its sort and its counted pills; a search is every field; no sort is the record's order", () => {
  const ask = { filters: [{ field: 'state', op: 'in', values: ['open'] }], q: '', sort: { field: 'due' }, twice: false };
  assert.deepEqual(spotOf('tasks', ask, ['priority']), { list: 'tasks', at: ['entries'], by: ['state', 'due', 'priority'] });
  assert.equal(spotOf('tasks', { ...ask, q: 'bank' }, []).by, null);
  assert.equal(spotOf('tasks', { ...ask, twice: true }, []).by, null);
  assert.equal(spotOf('tasks', { ...ask, sort: undefined }, []).newest, true);
});
