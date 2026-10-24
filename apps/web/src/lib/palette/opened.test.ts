import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openedKept, questionsOf, titleIn, withOpened, TODAY_QUESTIONS } from './opened.ts';

const BAR = [
  { key: 'today', href: '/', label: 'Today' },
  { key: 'work', href: '/p/work', label: 'Work' },
  { key: 's-money', href: '/s/money', label: 'Money' },
  { key: 's-agents', href: '/agents', label: 'Agents' },
];

test('THE EMPTY PALETTE OFFERS THREE QUESTIONS: asked with a model, else the place that answers each (E55)', () => {
  const asked = questionsOf(true, BAR);
  assert.equal(asked.length, 3);
  assert.deepEqual(asked.map((a) => a.ask), TODAY_QUESTIONS.map((q) => q.title));
  const opened = questionsOf(false, BAR);
  assert.deepEqual(opened.map((a) => a.href), ['/p/work', '/agents', '/s/money']);
  assert.ok(opened.every((a) => a.ask === null));
  /* A PLACE THE BAR DOES NOT DRAW IS NO ANSWER, so its question is not offered. */
  assert.equal(questionsOf(false, BAR.slice(0, 2)).length, 1);
});

test('RECENT IS WHERE HE WENT, newest first, once each, and never the way in or Today', () => {
  const a = { href: '/p/encore', title: 'Encore', at: 1 };
  const b = { href: '/s/money', title: 'Money', at: 2 };
  let list = withOpened([], a);
  list = withOpened(list, b);
  list = withOpened(list, { ...a, at: 3 });
  assert.deepEqual(list.map((o) => o.href), ['/p/encore', '/s/money']);
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
