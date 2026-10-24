/**
 * The two sentences `/settings/delete` puts above the field, against what deleting actually does.
 *
 * WHAT WAS MEASURED, AND IT IS WHY THIS FILE EXISTS. `copy.deleteCosts` read *"A final copy is kept
 * for the rest of today, in case you change your mind within the hour. Within thirty days nothing
 * of this record is left anywhere."* Three claims, and the code said otherwise on all three then.
 *
 *   - THE NAME IS BURNED, AND NEITHER SENTENCE SAID SO. `Directory.prepare` in
 *     `apps/worker/src/index.ts` refuses a slug whose claim reads `released` with *"was the name of
 *     another record and is never given out again"*, and `destroyRecord` releases every name the
 *     record had (`apps/worker/src/destroy.ts`). So changing your mind and making the record again
 *     at the same name, which is the one reversal the sentence invited, is the one the host has
 *     already decided it will refuse for ever.
 *   - A FINAL COPY IS TAKEN, KEPT `FINAL_KEPT_DAYS` (30) AND THEN GONE. `destroyRecord`
 *     (`apps/worker/src/destroy.ts`) writes it before the sweep, and `apps/worker/src/index.ts`'s
 *     `destroy` hands it a swept copies port wherever `BLOBS` and the snapshots port are bound,
 *     which production is: the sentence Settings shows before a delete has to say the same number
 *     `destroy.ts`'s own comment asks for. The Worker still hands the record no `snapshots` port, so
 *     `listSnapshots` and `restore` still answer `NOT_IN_THIS_BUILD`: the copy exists, and nothing on
 *     this deployment can open it from here.
 *   - AND "NOTHING IS LEFT ANYWHERE" IS STILL NOT SOMETHING THIS SCREEN CAN PROMISE. Pruning happens
 *     inside `take`, which only runs for records the Directory still lists, so a deleted record's
 *     nightly objects are no longer walked. What the retention truth is beyond the final copy is not
 *     this screen's to assert.
 *
 * So what is left to say is the cost he can act on before he presses the button: the name goes, one
 * copy outlives it for 30 days with no way back to it from here, and the export is the copy he keeps.
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

test('and it names the one copy this deployment does keep, and the day it goes', () => {
  /* `apps/worker/src/index.ts`'s `destroy` HANDS `destroyRecord` A SWEPT COPIES PORT wherever `BLOBS` and the
     snapshots port are bound, which production is, so the final copy `destroy.ts` describes is written on every
     delete this deployment does today, not only later. `FINAL_KEPT_DAYS` (`destroy.ts:38`) is the day it
     expires, and the sentence here must say the same number, as that constant's own comment requires. */
  assert.match(copy.deleteCosts, /final copy|copy is kept|last copy/iu, 'a final copy really is kept, and Settings said otherwise');
  assert.match(copy.deleteCosts, /30 days/iu, 'the retention window must match `FINAL_KEPT_DAYS`');
  /* STILL NO RESTORE. The Worker hands the record no `snapshots` port, so `listSnapshots` and `restore` still answer
     `NOT_IN_THIS_BUILD`: the copy exists in the bucket, and nothing on this deployment can open it from the app. */
  assert.doesNotMatch(copy.deleteCosts, /restore|bring .* back/iu, 'there is no restore on this deployment');
});

test('and it names the one thing he can still do about it, which is the export', () => {
  assert.match(copy.deleteCosts, /export/iu, 'the sentence states a cost and no act');
});

test('and neither sentence repeats the other, nor leaves the house voice', () => {
  /* `deleteWhat` carries "It cannot be undone" one line above this on the screen, and the
     section's own comment condemns three lines that are two sentences. */
  assert.match(copy.deleteWhat('The Studio'), /cannot be undone/iu);
  assert.doesNotMatch(copy.deleteCosts, /cannot be undone|no undo/iu, 'it repeats the line above it');
  for (const said of [copy.deleteCosts, copy.deleteWhat('The Studio'), copy.deleteRecord])
    assert.doesNotMatch(said, /—|!|sorry|simply|just |Are you sure/u, `"${said}" is not the house voice`);
});
