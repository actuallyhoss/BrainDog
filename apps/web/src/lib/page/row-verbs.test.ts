/**
 * A declared page's verbs on one row (`row-verbs.ts`): which row a drawn key names, the panel's one write, the menu's
 * days and states, and Just changed emptying itself after ten minutes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, RegisterDecl } from '../record/schema.ts';
import { shapeOf } from '../work/board.ts';
import { daysFor, dirty, dueWords, entryIn, formOf, JUST_MS, justNow, keyOf, movesFor, patchOf, rowOfKey, titleOf, type Touch } from './row-verbs.ts';

/** A list with every part the panel can change, declared as a pack would declare it: nothing here is named Tasks. */
const decl = {
  id: 'chores',
  name: 'Chores',
  one: 'chore',
  title: 'what',
  mobile: ['what', 'state', 'by'],
  state: 'state',
  done: ['done'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'state', type: 'enum', values: ['open', 'doing', 'done'], default: 'open' },
    { id: 'thing', type: 'ref', to: 'homes', label: 'Project' },
    { id: 'by', type: 'day', label: 'Due' },
    { id: 'tier', type: 'enum', values: ['top', 'second', 'low'], label: 'Tier' },
  ],
} as unknown as RegisterDecl;
const shape = shapeOf(decl);

const entry = (fields: Entry['fields'], seq = 4, version = 2): Entry => ({ seq, version, fields, created: '', by: '' }) as Entry;

test('A DRAWN KEY NAMES THE ROW OF THE RECORD IT IS, and a question or a place in a fence names none', () => {
  assert.deepEqual(rowOfKey('chores#4'), { register: 'chores', seq: 4 });
  assert.deepEqual(rowOfKey('money_in:12'), { register: 'money_in', seq: 12 });
  assert.equal(rowOfKey('q:SG3'), null, 'a question is answered, not edited');
  assert.equal(rowOfKey('3'), null, 'a place in an author-typed fence is no row');
  assert.equal(rowOfKey(undefined), null);
  assert.equal(keyOf({ register: 'chores', seq: 4 }), 'chores#4');
});

test('THE ROW IS FOUND IN WHICHEVER BLOCK DREW IT, by its list and its number', () => {
  const blocks = [
    { register: 'homes', entries: [entry({ name: 'Flat' }, 4)] },
    { register: 'chores', entries: [entry({ what: 'Bins' }, 4)] },
  ];
  assert.equal(entryIn(blocks, { register: 'chores', seq: 4 })?.fields.what, 'Bins', 'the same number in another list is another row');
  assert.equal(entryIn(blocks, { register: 'chores', seq: 9 }), undefined);
});

test('THE PANEL SAVES EVERY FIELD IT CHANGED IN ONE PATCH, and nothing it did not touch', () => {
  const e = entry({ what: 'Bins', state: 'open', thing: 2, by: '2026-10-05', tier: 'low' });
  const form = formOf(e, shape);
  assert.deepEqual(form, { title: 'Bins', state: 'open', project: '2', due: '2026-10-05', tier: 'low' });
  assert.deepEqual(patchOf(form, e, shape), {}, 'a form saved as it opened writes nothing');
  assert.equal(dirty(form, e, shape), false);

  const changed = { ...form, title: ' Bins out ', state: 'doing', project: '', due: '2026-10-07', tier: 'top' };
  assert.deepEqual(patchOf(changed, e, shape), { what: 'Bins out', state: 'doing', thing: null, by: '2026-10-07', tier: 'top' });
  assert.equal(dirty(changed, e, shape), true);
});

test('A ROW ITS WORDS ARE EMPTIED FROM KEEPS THEM, and an emptied day is the day cleared', () => {
  const e = entry({ what: 'Bins', state: 'open', by: '2026-10-05' });
  assert.deepEqual(patchOf({ ...formOf(e, shape), title: '   ', due: '' }, e, shape), { by: null });
});

test('A ROW WITH NO WORDS IS CALLED BY ITS NUMBER', () => {
  assert.equal(titleOf(entry({ what: '' }, 7), shape), '#7');
  assert.equal(titleOf(entry({ what: 'Bins' }, 7), null), '#7', 'a list this build was never told about has no title field to read');
});

test('THE MENU MOVES A ROW TO EVERY STATE BUT ITS OWN, and offers today, tomorrow and next week', () => {
  assert.deepEqual(movesFor(entry({ state: 'doing' }), shape), ['open', 'done']);
  assert.deepEqual(
    daysFor('2026-10-02').map((d) => d.day),
    ['2026-10-02', '2026-10-03', '2026-10-05'],
    'a Friday: next week is the Monday after it',
  );
  assert.deepEqual(dueWords('Bins', null, '2026-10-02'), { mark: 'No due day', said: '“Bins” has no due day now.' });
  assert.equal(dueWords('Bins', '2026-10-03', '2026-10-02').mark, 'Due Tomorrow');
});

test('JUST CHANGED HOLDS A ROW FOR TEN MINUTES, the latest first, and lets it go after', () => {
  const t = (at: number, mark: string): Touch => ({ at, mark, title: mark, gone: false });
  const touched = new Map([
    ['chores#1', t(1_000, 'Done')],
    ['chores#2', t(5_000, 'Deleted')],
    ['q:SG1', t(5_000, 'not a row')],
  ]);
  assert.deepEqual(
    justNow(touched, 6_000).map((l) => l.key),
    ['chores#2', 'chores#1'],
  );
  assert.deepEqual(
    justNow(touched, 1_000 + JUST_MS).map((l) => l.key),
    ['chores#2'],
    'ten minutes on, the first has gone and the second has not',
  );
});
