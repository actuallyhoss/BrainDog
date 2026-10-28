/**
 * The sentence a dead button says about itself.
 *
 * `/start?add=…` AND ITS TILES WENT WITH THE ONE-ROW FIRST RUN, and the
 * tests of their mapping went with them. What the first run proposes is held by `first-run.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from './copy.ts';

test('THE DEAD BUTTON SAYS WHICH FIELDS, and reads as English for one and for three', () => {
  assert.equal(copy.rowRequired(['Due']), 'Due needed.');
  assert.equal(
    copy.rowRequired(['Description', 'Amount', 'Due']),
    'Description, Amount and Due needed.',
  );

  /* AND IT POINTS AT THE FIELD RATHER THAN REPEATING IT. The money sentence is already under the
     input; printing it again in the footer put the same words on screen twice. */
  assert.equal(
    copy.rowFieldProblem(['Amount']),
    'Amount needs a fix, see under the field.',
  );
  assert.match(copy.rowFieldProblem(['Amount', 'Paid']), /^Amount and Paid /);
});
