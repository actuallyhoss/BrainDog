/**
 * The half of a refusal a person can act on, and the two ways it stopped being one.
 *
 * `copy.test.ts` covers the sentences this file BUILDS from a declaration's own nouns. This covers
 * the one that builds a refusal's second half out of a list, because a list is the argument nothing
 * upstream promises anything about: `/v/<key>` hands it whatever `client.views()` answered, which on
 * a record with no saved views is nothing at all, and `/p/<slug>` hands it every pack's page titles,
 * which are not unique. Both were measured from a browser within five minutes of a fresh record.
 *
 * A separate file rather than a case in `copy.test.ts` because the subject is different: not whether
 * a generated sentence is English, but whether a refusal still has a usable second half when the
 * list it is built from is empty or repetitive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from './copy.ts';

test('A REFUSAL WHOSE HELPFUL HALF IS A FULL STOP. `/v/nothing` on a live record with no saved views', () => {
  /* `addressOf` answers null for a keyless address, `client.views()` answers `[]`, and
     `v/[view]/+page.svelte:264` handed those zero addresses straight to this sentence. What the
     screen printed under "There is no saved view called nothing." was "Saved views on this record:
     ." and nothing else: a refusal that trails off reads as a broken product rather than an answer,
     on the one screen whose entire job is to teach. */
  assert.equal(copy.theseExist('Saved views', []), 'This record has no saved views yet.');
  assert.doesNotMatch(copy.theseExist('Saved views', []), /:\s*\.$/u, 'the sentence ends in a bare full stop again');

  /* THE SAME BRANCH IS REACHED BY THREE OTHER SCREENS, and each names its own noun, so the sentence
     is built from `kind` rather than written out four times. `/r/<unknown>` on a record whose lists
     are all at zero rows is the one a mistyped list address reaches. */
  assert.equal(copy.theseExist('Lists', []), 'This record has no lists yet.');
  assert.equal(copy.theseExist('Pages', []), 'This record has no pages yet.');
});

test('and it does not repeat a name, because five entries called Overview are not a list anybody reads', () => {
  /* The second half. After `Clear the examples` the rail keeps entries for pages that no
     longer exist, and following one gave "Pages on this record: Overview · People · Home · Overview
     · Ledger · Overview · Board · Overview · Dashboard." Nine names of which five are one word
     repeated, because a page title is per-pack and this list is every pack's. The duplicate carries
     nothing a reader can use: two pages called Overview are told apart by which pack they sit in,
     and this sentence has no room for that. */
  const titles = ['Overview', 'People', 'Home', 'Overview', 'Ledger', 'Overview', 'Board', 'Overview', 'Dashboard'];
  assert.equal(copy.theseExist('Pages', titles), 'Pages on this record: Overview · People · Home · Ledger · Board · Dashboard.');

  /* AND THE ORDER IS THE ORDER IT ARRIVED IN. The caller's order is the rail's order, so sorting
     here would make the sentence disagree with the screen the reader just came from. */
  assert.equal(copy.theseExist('Lists', ['Money', 'Work', 'Money']), 'Lists on this record: Money · Work.');
  /* One name is still one name, which is the common case on a nearly empty record. */
  assert.equal(copy.theseExist('Lists', ['Money']), 'Lists on this record: Money.');
});

test('A DEAD NETWORK IS ONE SENTENCE, whichever control was pressed', () => {
  /**
   * A GUARD RATHER THAN A REPAIR, AND IT WAS GREEN BEFORE THE CHANGE UNDER IT. `recordNotReached`
   * (lanes C and D) and `writeNotReached` (lane A) were two identical literals eight lines apart in
   * `copy.ts`, fifteen call sites between them, and nothing could have caught them drifting: both
   * keys are rendered, so `dead-copy` is content, and every test above asserts against the key
   * rather than the words. They are one `notReached` now, and this is what says they stay one.
   */
  assert.equal(copy.recordNotReached, copy.writeNotReached);
  assert.equal(copy.recordNotReached, 'The record could not be reached, so nothing was saved. Try again in a moment.');
  /* AND IT NAMES WHAT DID NOT HAPPEN, which is the half a person acts on: nothing was saved, so
     pressing again is safe. A refusal that only says the request failed leaves them guessing. */
  assert.match(copy.recordNotReached, /nothing was saved/u);
});

test('and neither half of it sells, apologises or uses a word out of the schema', () => {
  /**
   * The third question: nothing that requires knowing what a "register", a "declaration" or
   * a "projection" is in order to use it. `access.test.ts` walks every value in this file against a
   * banned-word list with several argument shapes; this pins the two shapes that matter for THIS
   * sentence, because the empty branch is a string `access.test.ts` reaches only by luck of which
   * shape it happens to try first.
   */
  for (const said of [copy.theseExist('Lists', []), copy.theseExist('Lists', ['Money'])])
    assert.doesNotMatch(said, /register|declaration|projection|predicate|!|sorry|simply|just |easy/u, `"${said}" is not the house voice`);
});
