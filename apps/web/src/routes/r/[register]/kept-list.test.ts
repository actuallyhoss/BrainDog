/** `kept-list.ts`: a list's first page goes into the local copy as plain JSON and comes back as the same names map. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keptOf, listsOf, namesOf } from './kept-list.ts';
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
