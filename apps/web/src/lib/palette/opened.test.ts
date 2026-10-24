import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openedKept, questionsOf, titleIn, withOpened, TODAY_QUESTIONS } from './opened.ts';

test('THE EMPTY PALETTE OFFERS THREE QUESTIONS: asked with a model, else the shell screen that answers each (E55)', () => {
  const asked = questionsOf(true);
  assert.equal(asked.length, 3);
  assert.deepEqual(asked.map((a) => a.ask), TODAY_QUESTIONS.map((q) => q.title));
  const opened = questionsOf(false);
  assert.deepEqual(opened.map((a) => a.href), ['/decide', '/agents', '/audit']);
  assert.ok(opened.every((a) => a.ask === null));
});

test('RECENT IS WHERE HE WENT, newest first, once each, and never the way in or Today', () => {
  const a = { href: '/p/kiln', title: 'Kiln', at: 1 };
  const b = { href: '/s/money', title: 'Money', at: 2 };
  let list = withOpened([], a);
  list = withOpened(list, b);
  list = withOpened(list, { ...a, at: 3 });
  assert.deepEqual(list.map((o) => o.href), ['/p/kiln', '/s/money']);
  for (const href of ['/', '/signin', '/start?x=1', '/invite/abc']) assert.equal(withOpened(list, { href, title: 'X', at: 4 }).length, 2, href);
  const many = Array.from({ length: 9 }, (_, i) => ({ href: `/r/tasks/${i}`, title: `Task ${i}`, at: i })).reduce((l, o) => withOpened(l, o), [] as ReturnType<typeof withOpened>);
  assert.equal(many.length, 5);
  assert.equal(many[0]!.title, 'Task 8');
});

test('THE NAME IS THE SCREEN\'S OWN, from its tab title, and what was kept reads back or is nothing', () => {
  assert.equal(titleIn('Invoice 41 · Obligations · BrainDog', 'BrainDog'), 'Invoice 41');
  assert.equal(titleIn('BrainDog', 'BrainDog'), null);
  assert.equal(openedKept('not json').length, 0);
  assert.equal(openedKept(null).length, 0);
  assert.deepEqual(openedKept(JSON.stringify([{ href: '/a', title: 'A', at: 1 }, { href: 2 }])), [{ href: '/a', title: 'A', at: 1 }]);
});

/* THE AUDIT OF 25 OCTOBER, Z24 (`add-390-light.png`): Recent listed "SG240", the handle a question's tab said before
   the question named itself. A handle is never kept as a name, and one kept before is not read back. */
test('RECENT NEVER NAMES A PLACE BY ITS HANDLE: SG240, S42 or tasks#4', () => {
  assert.equal(titleIn('SG240 · BrainDog', 'BrainDog'), null);
  assert.equal(titleIn('S42 · Agent runs · BrainDog', 'BrainDog'), null);
  assert.equal(titleIn('tasks#4 · BrainDog', 'BrainDog'), null);
  assert.equal(titleIn('Add Profiles · BrainDog', 'BrainDog'), 'Add Profiles');
  assert.deepEqual(withOpened([], { href: '/decide/SG240', title: 'SG240', at: 1 }), []);
  assert.deepEqual(openedKept(JSON.stringify([{ href: '/decide/SG240', title: 'SG240', at: 1 }, { href: '/p/people', title: 'People', at: 2 }])).map((o) => o.title), ['People']);
});
