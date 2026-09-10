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
  for (const v of ['Services', 'services', 'SERVICES', 'the-services', 'the_services'])
    assert.equal(addKey(v, CHOICES), 'services', `?add=${v}`);

  /**
   * AND THE WORD THAT USED TO BE ON THAT TILE IS NOT A WORD ANY MORE, WHICH IS A COST AND NOT AN
   * OVERSIGHT.
   *
   * These five vectors were `The estate`, `the-estate`, `THE ESTATE`, `estate` and `the_estate`,
   * because that is what the second tile said. One area of the record answered to four names —
   * the tile, the rail's section heading, the pack and the register — and the register's word won,
   * so the tile says *Services* and `?add=estate` reaches nothing.
   *
   * `addKey` compares against exactly two published names, the register id and the word on the
   * tile, and neither is `estate` now. That is a link somebody could have shared, and it is the
   * one thing this rename actually broke; nothing in the product writes the parameter, so there
   * is no link of ours to update. The choice list is the honest answer to a word this record's
   * tiles do not use, and it is the same answer `nonsense` gets.
   */
  for (const v of ['The estate', 'the-estate', 'estate'])
    assert.equal(addKey(v, CHOICES), undefined, `?add=${v} still resolves, so the tile still says it`);

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

/** Where a top-level function in a `<script>` block ends: a newline, two spaces, a brace. */
const BODY_END = `
  }`;

test('THE FIRST ROW REPORTS WHERE THE PERSON IS STANDING, and does not navigate', () => {
  /* THE WHOLE FUNCTION, not a fixed number of characters of it. This sliced 600 and the argument
     above the toast grew past that, so the assertion started reading a comment and failing about a
     line that had not moved. A slice measured in bytes is a slice that fails on prose. */
  const at = startPage.indexOf('function commit(');
  const commit = startPage.slice(at, startPage.indexOf(BODY_END, at));
  assert.match(commit, /toasts\.push\(copy\.notWritten/u, 'the honest toast is gone');
  assert.doesNotMatch(commit, /goto\(/u, 'commit navigates away from its own outcome again');

  /**
   * AND THE ROW IS MADE, which is the whole of what a friction pass ranked first of ten.
   *
   * Four clicks, twenty-five keystrokes, six decisions, three screens, and zero rows: this screen
   * asks for one true fact about somebody's own business, takes it, and the list it then offers
   * holds thirty-eight rows belonging to a fictional studio with theirs nowhere in it. It is not a
   * write and it does not claim to be. `pending` holds it for the life of the tab and the list
   * draws it wearing `Not saved`, which is the same receipt every other verb in this product
   * leaves.
   */
  assert.match(commit, /pending\.add\(choice\.key, taken\)/u, 'the row the person typed goes nowhere');
  assert.match(startPage, /bind:taken/u, 'the form holds what was typed and hands out nothing');

  /* AND THE OUTCOME IS ON THE SCREEN, not only in a toast that a later navigation can take with it. */
  assert.match(startPage, /firstRun\.keptNothing[^A-Za-z]/u, 'the outcome is not rendered');
  assert.match(startPage, /role="status"/u, 'the outcome is not announced');

  /* THE WAY ONWARD IS OFFERED AND NOT TAKEN. The list is still reachable; it is a control now. */
  assert.match(startPage, /firstRun\.seeTheList\(/u, 'there is no way onward');
  /* AND IT SAYS WHAT IS THERE. The sentence used to explain why somebody else's rows are on the
     screen and said nothing about the one thing the person had just done. */
  assert.match(startPage, /firstRun\.rowIsThere/u, 'the outcome does not say where the row went');
  assert.match(startPage, /\/r\/\$\{choice\.key\}\?first=1/u, 'the way onward lost its address');
});

test('and the answer is reset when the question changes', () => {
  /* Going Back and choosing a different list must not arrive pre-answered, which is the same bug
     the `picked === null` guard in that effect had in a different place. */
  const effect = startPage.slice(startPage.indexOf('honoured = asked;'), startPage.indexOf('honoured = asked;') + 400);
  assert.match(effect, /said = false/u, 'the outcome outlives the choice it belongs to');
});
