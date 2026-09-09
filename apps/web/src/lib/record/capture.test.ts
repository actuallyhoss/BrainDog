/**
 * The capture line: what the filter answers for the reader, and what it must not.
 *
 * THE ADD WAS A MODAL ASKING FOR EVERY DECLARED FIELD, up front, and in the record this product is
 * modelled on twenty-five of eighty-five human writes over thirteen days were adds. Moving it to one
 * line at the top of the list is the change that made those cheap, and the whole of the risk in that
 * change is here: a line that infers a field value from the address can write a WRONG value rather
 * than an ugly one, and nothing on screen would say so.
 *
 * Every case below is one way of doing that, and each is a separate rule rather than a variation of
 * one, which is why they are tested one at a time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inheritedFrom, unansweredBy } from './api.ts';
import type { Filter } from './schema.ts';

const is = (field: string, ...values: string[]): Filter => ({ field, op: 'is', values });

test('AN `is` CHIP ANSWERS ITS FIELD, so the line does not ask for what is on screen', () => {
  /* Looking at `?f=state:is:open` means the answer to "what state" is in the address, and a
     one-line add that then demanded it would be a modal with fewer fields in it. */
  assert.deepEqual(inheritedFrom('obligations', [is('state', 'open')]), { state: 'open' });
});

test('AND IT ANSWERS IT IN THE SPELLING THE RECORD STORES, not the one the screen shows', () => {
  /* `direction is owed to me` on screen is `owed_to_me` underneath. Writing the readable form would
     put a value in the field that the field does not declare, and every later read of that row
     would show it as itself rather than as the state it was meant to be. */
  assert.deepEqual(inheritedFrom('obligations', [is('direction', 'owed to me')]), { direction: 'owed_to_me' });
});

test('AN OPERATOR THAT NAMES A SET ANSWERS NOTHING, because a member of a set is a guess', () => {
  /* `state in [open, part]` is two answers and the reader has given neither. Picking one for them
     is guessing at the one moment they have not said which, and the guess would be stored as if
     they had. */
  assert.deepEqual(inheritedFrom('obligations', [{ field: 'state', op: 'in', values: ['open', 'part'] }]), {});
  assert.deepEqual(inheritedFrom('obligations', [{ field: 'due', op: 'before', values: ['+30d'] }]), {});
  assert.deepEqual(inheritedFrom('obligations', [is('state', 'open', 'part')]), {}, 'an `is` with two values is still a set');
});

test('A VALUE THE FIELD DOES NOT DECLARE IS DROPPED RATHER THAN WRITTEN', () => {
  /* `declaredValue` returns its input when nothing matches, which is right for a FILTER — the answer
     is no rows — and wrong for a WRITE, where the answer would be a row nobody can read. The record
     has already counted twelve refused writes to this exact field for this exact reason. */
  assert.deepEqual(inheritedFrom('obligations', [is('direction', 'sideways')]), {});
});

test('A MONEY, A DAY OR A REFERENCE IS NEVER INHERITED, and a day is the worst of the three', () => {
  /* The URL carries a readable form and these three have no reconciliation to the stored one:
     `amount is 1,200` is prose, `party is Halden` is a name and not the id it points at. `due is
     today` is worse than merely wrong: it is a MOVING value, and freezing it at the instant somebody
     typed a row puts a date in the record that was never true of anything. */
  assert.deepEqual(inheritedFrom('obligations', [is('amount', '1,200')]), {});
  assert.deepEqual(inheritedFrom('obligations', [is('due', 'today')]), {});
  assert.deepEqual(inheritedFrom('obligations', [is('party', 'Halden')]), {});
});

test('AND THE TITLE IS NEVER INHERITED, because the title is what is being typed', () => {
  assert.deepEqual(inheritedFrom('obligations', [is('what', 'Invoice 41')]), {});
});

test('a filter on a field this register does not have answers nothing, and does not throw', () => {
  assert.deepEqual(inheritedFrom('obligations', [is('nonesuch', 'x')]), {});
  assert.deepEqual(inheritedFrom('atlantis', [is('state', 'open')]), {});
});

/* ── and what the line cannot answer, it says rather than writing a short row ─── */

test('A REQUIRED FIELD THE FILTER CANNOT ANSWER IS NAMED, not silently dropped', () => {
  /* A capture line that wrote a row missing a required field would be the shape this repository
     keeps finding: a control that reports success and leaves the record in a state the declaration
     refuses. Obligations require a direction, an amount and a due date beyond the title. */
  const said = unansweredBy('obligations', {}).map((f) => f.id);
  assert.deepEqual(said, ['direction', 'amount', 'due', 'state']);

  /* AND ANSWERING ONE OF THEM TAKES IT OFF THE LIST, which is what makes the sentence under the
     field change as the reader narrows the list rather than being a fixed warning. */
  assert.deepEqual(
    unansweredBy('obligations', inheritedFrom('obligations', [is('direction', 'owed to me'), is('state', 'open')])).map((f) => f.id),
    ['amount', 'due'],
  );
});

test('and each one is named by its own label, which is what the field is called on screen', () => {
  /* THE SECOND HALF OF THIS USED TO BE `f.label !== f.id.toUpperCase()`, WHICH NOTHING COULD FAIL.
     Every id in this record is lower case and `labelOf` capitalises the first letter, so the
     comparison was between "Direction" and "DIRECTION" and it was true whatever `labelOf` did. What
     the sentence under the capture field actually needs is a name a person recognises, so what is
     checked is that: not the raw id, and no snake_case left in it. */
  for (const f of unansweredBy('obligations', {})) {
    assert.ok(f.label.length > 0, `${f.id} has no label at all`);
    assert.notEqual(f.label, f.id, `${f.id} is shown to a reader as its own id`);
    assert.doesNotMatch(f.label, /_/u, `${f.id}'s label still carries an underscore`);
  }
});
