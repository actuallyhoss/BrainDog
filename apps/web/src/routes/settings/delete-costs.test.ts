/**
 * The two sentences `/settings/delete` puts above the field, against what deleting actually does.
 *
 * WHAT WAS MEASURED, AND IT IS WHY THIS FILE EXISTS. `copy.deleteCosts` read *"A final copy is kept
 * for the rest of today, in case you change your mind within the hour. Within thirty days nothing
 * of this record is left anywhere."* Three claims, and the code says otherwise on all three.
 *
 *   - THE NAME IS BURNED, AND NEITHER SENTENCE SAID SO. `Directory.prepare` in
 *     `apps/worker/src/index.ts` refuses a slug whose claim reads `released` with *"was the name of
 *     another record and is never given out again"*, and `destroyRecord` releases every name the
 *     record had (`apps/worker/src/destroy.ts`). So changing your mind and making the record again
 *     at the same name, which is the one reversal the sentence invited, is the one the host has
 *     already decided it will refuse for ever.
 *   - NO FINAL COPY IS TAKEN. `deleteRecord` (`packages/record/src/index.ts`) calls `destroy()`
 *     and nothing else; the Worker's `destroy` deletes the alarm, deletes every byte the object
 *     holds and closes the names. The nightly R2 copy that landed this batch
 *     (`apps/worker/src/snapshots.ts`) is written by the cron and read by nobody in the app: the
 *     Worker hands the record no `snapshots` port, so `listSnapshots` and `restore` answer
 *     `NOT_IN_THIS_BUILD`. There is nothing on this deployment a person can restore from.
 *   - AND "NOTHING IS LEFT ANYWHERE" IS NOT SOMETHING THIS SCREEN CAN PROMISE. Pruning happens
 *     inside `take`, which only runs for records the Directory still lists, so a deleted record's
 *     nightly objects are no longer walked. Whatever the retention truth turns out to be, the
 *     screen should not be the place it is asserted.
 *
 * So what is left to say is the cost he can act on before he presses the button: the name goes, and
 * the export is the only copy there will be.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../../lib/copy.ts';

test('THE DELETE SCREEN SAYS THE NAME IS GONE FOR GOOD, which is the cost the host enforces for ever', () => {
  assert.match(copy.deleteCosts, /name/iu, 'the one permanent cost of deleting is not mentioned');
  /* MEASURED AGAINST A SENTENCE THAT SAID THE OPPOSITE AND PASSED. This check read `/never|again/iu`,
     and *"The name is released, and another record here can take it again. Nothing is kept to go back
     to, so export a copy first if you want the rows."* passed it and all four other tests in this file,
     because "again" is the word the rule and its exact reversal both use. The permanence now has to be
     matched on a word only the rule uses, and a sentence that hands the name to a second record is
     refused on its own. */
  assert.match(copy.deleteCosts, /for good|for ever|forever|never|permanent/iu, 'the name rule is stated without saying it is permanent');
  assert.doesNotMatch(copy.deleteCosts, /(another|any|a new|someone else|somebody else)[^.]*\bagain\b/iu, '`Directory.prepare` refuses a released slug for ever, so no second record is offered the name');
});

test('and it does not invite a change of mind the host refuses for ever', () => {
  assert.doesNotMatch(copy.deleteCosts, /change (your|his) mind/iu, 'remaking the record at this name is refused for ever');
  assert.doesNotMatch(copy.deleteCosts, /within the hour|rest of today|same day/iu, 'no window exists: `destroy()` is the whole of deletion');
});

test('and it promises no copy this deployment does not keep', () => {
  assert.doesNotMatch(copy.deleteCosts, /final copy|copy is kept|last copy/iu, 'the app is handed no snapshots port, so nothing is kept for him');
  assert.doesNotMatch(copy.deleteCosts, /restore|bring .* back/iu, 'there is no restore on this deployment');
  assert.doesNotMatch(copy.deleteCosts, /thirty days|30 days/iu, 'a deleted record is no longer walked, so retention is not this screen to promise');
});

test('and it names the one thing he can still do about it, which is the export', () => {
  assert.match(copy.deleteCosts, /export/iu, 'the sentence states a cost and no act');
});

test('and neither sentence repeats the other, nor leaves the house voice', () => {
  /* `deleteWhat` carries "It cannot be undone" one line above this on the screen, and the
     section's own comment condemns three lines that are two sentences. */
  assert.match(copy.deleteWhat('The Studio'), /cannot be undone/iu);
  assert.doesNotMatch(copy.deleteCosts, /cannot be undone|no undo/iu, 'it repeats the line above it');
  for (const said of [copy.deleteCosts, copy.deleteWhat('The Studio'), copy.deleteRecord('The Studio')])
    assert.doesNotMatch(said, /—|!|sorry|simply|just |Are you sure/u, `"${said}" is not the house voice`);
});
