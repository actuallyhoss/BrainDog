/**
 * `/start?add=…`, and the sentence a dead button says about itself.
 *
 * THE MAPPING IS TESTED AGAINST THE REAL CHOICES, not a fixture: the whole defect was that the two
 * lists — what the tiles say and what the registers are called — had drifted, and a fixture that
 * repeated one of them would have passed while the screen stayed wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from './copy.ts';
import { firstRun } from './first-run.ts';
import { addKey, plain } from './start.ts';

const CHOICES = firstRun.firstChoices;

test('EVERY WORD ON A TILE RESOLVES, and so does every register id', () => {
  for (const c of CHOICES) {
    assert.equal(addKey(c.key, CHOICES), c.key, `?add=${c.key} did not resolve`);
    assert.equal(addKey(c.label, CHOICES), c.key, `?add=${c.label} — the word on the tile — did not resolve`);
  }

  /* THE THREE THAT USED TO FALL THROUGH, named rather than derived: a person reading the screen
     types the word, and `money`, `projects` and `work` all landed on the choice list. */
  assert.equal(addKey('money', CHOICES), 'obligations');
  assert.equal(addKey('projects', CHOICES), 'things');
  assert.equal(addKey('work', CHOICES), 'tasks');
});

test('AND THE SHAPE OF THE WORD DOES NOT MATTER, but the word does', () => {
  /* A link is typed, pasted and lower-cased by whatever passed it along. */
  for (const v of ['The estate', 'the-estate', 'THE ESTATE', 'estate', 'the_estate'])
    assert.equal(addKey(v, CHOICES), 'services', `?add=${v}`);

  /* AND A REGISTER THIS RECORD DOES NOT HAVE STILL GETS THE CHOICE LIST. `24` has no `decisions`
     register — a decision is what the gate writes — so this is the exact wrong answer to guess at. */
  for (const v of ['nonsense', 'decisions', '', 'obligation'])
    assert.equal(addKey(v, CHOICES), undefined, `?add=${v} resolved to something`);
});

test('`the` IS ONLY DROPPED FROM THE FRONT, and only when it is the word', () => {
  assert.equal(plain('things'), 'things', 'a key beginning "th" lost three letters');
  assert.equal(plain('The estate'), 'estate');
  assert.equal(plain('tasks'), 'tasks');
  assert.equal(plain('people'), 'people');
});

test('THE DEAD BUTTON SAYS WHICH FIELDS, and reads as English for one and for three', () => {
  assert.equal(copy.rowRequired(['Due']), 'Due cannot be left out. Fill it in, and the button turns on.');
  assert.equal(
    copy.rowRequired(['Description', 'Amount', 'Due']),
    'Description, Amount and Due cannot be left out. Fill them in, and the button turns on.',
  );

  /* AND IT POINTS AT THE FIELD RATHER THAN REPEATING IT. The money sentence is already under the
     input; printing it again in the footer put the same words on screen twice. */
  assert.equal(
    copy.rowFieldProblem(['Amount']),
    'Amount cannot be stored as typed — the reason is under the field.',
  );
  assert.match(copy.rowFieldProblem(['Amount', 'Paid']), /^Amount and Paid /);
});
