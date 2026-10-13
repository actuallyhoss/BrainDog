/**
 * THE RECORD'S LINE OF WHAT ACCEPTING CHANGES, ON EVERY CARD (`card.ts` `cardOf`): a card that changes what a list holds
 * says it wherever it stands in the queue, and a change the card cannot draw as a line is said by it too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { QueueQuestion } from '@braindog/kernel';

import { cardOf, saysChanges, shiftLinesOf } from './card.ts';

const now = Date.parse('2026-10-13T09:00:00Z');

const ask = (over: Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG9',
    who: 'agent:claude',
    at: '2026-10-13T07:00:00Z',
    kind: 'rowset',
    body_kind: 'rowset',
    question: 'Change Weekly review?',
    why: 'The steps moved.',
    cost: 'call',
    options: [
      { key: 'accept', label: 'Accept', because: '', recommended: true },
      { key: 'reject', label: 'Reject', because: '', recommended: false },
    ],
    ...over,
  }) as QueueQuestion;

/* A skill's text as an agent files it: long, and it names a file, so no card draws it as a line. */
const TEXT = 'Read the notes in docs/review.md, then list what moved this week.';
const skill = (over: Record<string, unknown> = {}): QueueQuestion =>
  ask({
    does: 'Changes Text, 4 lines added and 1 removed, and Revision from 3 to 4.',
    changes: [
      { field: 'body', before: `${TEXT} Old.`, after: `${TEXT} New.` },
      { field: 'rev', before: 3, after: 4 },
    ],
    ...over,
  });

test('A CARD THAT IS NOT THE LEAD SAYS WHAT ITS CHANGE DOES, as the lead does', () => {
  const lead = cardOf(skill(), { now, lead: true });
  const next = cardOf(skill(), { now });
  assert.equal(next.does, 'Changes Text, 4 lines added and 1 removed, and Revision from 3 to 4.');
  assert.equal(next.does, lead.does, 'the same question says less further down the queue');
  assert.equal(cardOf(skill(), { now, lead: false }).does, lead.does);
  assert.equal(saysChanges(next), true, 'nothing sits under What it changes');
});

test('A CHANGE THE CARD CANNOT DRAW IS SAID BY THE RECORD’S LINE, never by nothing', () => {
  const only = skill({ changes: [{ field: 'body', before: `${TEXT} Old.`, after: `${TEXT} New.` }] });
  assert.deepEqual(shiftLinesOf(only), [], 'a text that names a file is drawn as a line');
  const card = cardOf(only, { now });
  assert.equal(card.lines.length, 0);
  assert.notEqual(card.does, '');
  assert.equal(saysChanges(card), true);
  /* The line that could be drawn still is, beside the record's own. */
  const both = cardOf(skill(), { now });
  assert.deepEqual(
    both.lines.map((l) => [l.what, l.before, l.after]),
    [['rev', '3', '4']],
  );
  assert.deepEqual(both.shifts, [{ what: 'rev', before: '3', after: '4' }]);
});

test('ANY KIND FALLS BACK TO THE LINE WHERE A CHANGE WAS LEFT OUT, and keeps it for the lead where none was', () => {
  const does = 'Changes the Home page.';
  const path = ask({ kind: 'change', body_kind: 'change', does, before: 'apps/web/home.md', after: 'apps/web/today.md' });
  assert.equal(cardOf(path, { now }).does, does, 'a change dropped for holding a path left the card saying nothing');
  const id = ask({ kind: 'change', body_kind: 'change', does, changes: [{ field: 'owner', before: 'tasks#8', after: 'tasks#9' }] });
  assert.equal(cardOf(id, { now }).does, does);
  const plain = ask({ kind: 'change', body_kind: 'change', does, changes: [{ field: 'title', before: 'Home', after: 'Today' }] });
  assert.equal(cardOf(plain, { now }).does, '', 'a card that draws every change repeats it in a sentence');
  assert.equal(cardOf(plain, { now, lead: true }).does, does);
  /* A choice between options changes no list, so it says its line on the lead alone, as it did. */
  const choice = ask({ kind: 'options', body_kind: 'options', does: 'Records your choice and changes nothing else.' });
  assert.equal(cardOf(choice, { now }).does, '');
  /* A value that did not change is no line and no change left out. */
  const same = ask({ kind: 'change', body_kind: 'change', does, changes: [{ field: 'title', before: 'Home', after: 'Home' }] });
  assert.equal(cardOf(same, { now }).does, '');
});

test('NO ID, PATH OR ADDRESS REACHES THE LINE, and a card the record sent no line for says none', () => {
  const card = cardOf(skill({ does: 'Changes Text in skills#12 from apps/web/src/review.md and Revision from 3 to 4.' }), { now });
  assert.doesNotMatch(card.does, /#\d|\/|[0-9A-HJKMNP-TV-Z]{26}|—/u, card.does);
  assert.match(card.does, /^Changes Text/u);
  /* A line that ends on a field's own name keeps it: nothing in it was an id or an address. */
  assert.equal(cardOf(skill({ does: 'Changes Due on.' }), { now }).does, 'Changes Due on.');
  assert.equal(cardOf(skill({ does: 'Changes Due on.' }), { now, lead: true }).does, 'Changes Due on.');
  const silent = cardOf(skill({ does: undefined, changes: [{ field: 'body', before: `${TEXT} Old.`, after: `${TEXT} New.` }] }), { now });
  assert.equal(silent.does, '');
  assert.equal(saysChanges(silent), false);
});

test('ROWS ADDED TO A LIST ARE SAID ON EVERY CARD, where the record sends no before and after', () => {
  const adds = cardOf(ask({ question: 'Add three tasks?', does: 'Adds 3 to Tasks.' }), { now });
  assert.equal(adds.does, 'Adds 3 to Tasks.');
  assert.equal(adds.lines.length, 0);
});

test('AN ARRANGEMENT STILL SAYS ITS OWN SUMMARY, on a card that is not the lead', () => {
  const body = { enable: 'money' };
  const card = cardOf(ask({ kind: 'pack', body_kind: 'pack', does: 'Turns on Money.', arranged: body }), { now });
  assert.notEqual(card.does, '');
  assert.doesNotMatch(card.does, /—/u);
});
