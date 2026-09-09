/**
 * `/start?add=…`, and the sentence a dead button says about itself.
 *
 * THE MAPPING IS TESTED AGAINST THE REAL CHOICES, not a fixture: the whole defect was that the two
 * lists — what the tiles say and what the registers are called — had drifted, and a fixture that
 * repeated one of them would have passed while the screen stayed wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    'Amount cannot be stored as typed. The reason is under the field.',
  );
  assert.match(copy.rowFieldProblem(['Amount', 'Paid']), /^Amount and Paid /);
});

/**
 * FIRST RUN DOES NOT NAVIGATE AWAY FROM ITS OWN OUTCOME.
 *
 * `commit` pushed the honest toast and called `goto` in the same tick, and the toast did not
 * survive. Measured on the deployed build: at 700ms the sentence is in the DOM and the URL is still
 * `/start`; at 2,200ms the URL is `/r/obligations?first=1`, the live region is present and empty,
 * and a marker set before the click survived, so the store was never reloaded. The mechanism was
 * never identified, and the fix does not depend on identifying it: the highest-stakes control in
 * the product must report where the person is standing.
 *
 * A SOURCE READ, AND THAT IS THE HONEST SHAPE FOR IT. There is no behaviour to drive here without a
 * browser, and the browser gates cannot see it because the outcome only exists after a submit they
 * do not perform. What went wrong was one call in one function, so one call in one function is what
 * this checks.
 */
const startPage = readFileSync(fileURLToPath(new URL('../routes/start/+page.svelte', import.meta.url)), 'utf8');

test('THE FIRST ROW REPORTS WHERE THE PERSON IS STANDING, and does not navigate', () => {
  const commit = startPage.slice(startPage.indexOf('function commit('), startPage.indexOf('function commit(') + 600);
  assert.match(commit, /toasts\.push\(copy\.notWritten/u, 'the honest toast is gone');
  assert.doesNotMatch(commit, /goto\(/u, 'commit navigates away from its own outcome again');

  /* AND THE OUTCOME IS ON THE SCREEN, not only in a toast that a later navigation can take with it. */
  assert.match(startPage, /firstRun\.keptNothing[^A-Za-z]/u, 'the outcome is not rendered');
  assert.match(startPage, /role="status"/u, 'the outcome is not announced');

  /* THE WAY ONWARD IS OFFERED AND NOT TAKEN. The list is still reachable; it is a control now. */
  assert.match(startPage, /firstRun\.seeTheList\(/u, 'there is no way onward');
  assert.match(startPage, /\/r\/\$\{choice\.key\}\?first=1/u, 'the way onward lost its address');
});

test('and the answer is reset when the question changes', () => {
  /* Going Back and choosing a different list must not arrive pre-answered, which is the same bug
     the `picked === null` guard in that effect had in a different place. */
  const effect = startPage.slice(startPage.indexOf('honoured = asked;'), startPage.indexOf('honoured = asked;') + 400);
  assert.match(effect, /said = false/u, 'the outcome outlives the choice it belongs to');
});
