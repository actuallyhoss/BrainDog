/**
 * The count the shell reads, the sentence it says, and whose rows they are.
 *
 * `anyPending` had no call site for six days while its own docstring described the promise it was
 * written to keep: a row typed on the first run and left behind is unwritten, and no screen but the
 * one it belongs to said so. These are the two halves of keeping it: the number is right wherever
 * the rows were typed, and it is zero when there is nothing, because zero is what the shell reads
 * to decide to say nothing at all.
 *
 * AND THE HALF THAT WAS MISSING: whose rows they are. Every write into this holder is gated on
 * there being no record to write to, and every read was gated on nothing, so the rows a person
 * typed against the built-in sample were handed to a live record's list, counted in its head and
 * announced by its shell. The source is passed in now, and the tests below are what hold it there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { add, anyPending, drop, of, replace } from './pending.svelte.ts';

/* The two things a row can be typed against: the sample, and a record. */
const SAMPLE = true;
const RECORD = false;

/* The map lives for the module, so a test that leaves rows behind is a test the next one inherits.
   Both sources are swept, because a test that left rows held for one of them would leave the next
   one reading a holder that answers zero and is not empty. */
function empty(): void {
  for (const sample of [SAMPLE, RECORD])
    for (const register of ['obligations', 'people', 'money']) for (const row of [...of(register, sample)]) drop(register, row.seq);
  assert.equal(anyPending(SAMPLE), 0);
  assert.equal(anyPending(RECORD), 0);
}

test('NOTHING WAITING IS ZERO, which is what makes the shell able to say nothing', () => {
  empty();
  assert.equal(anyPending(SAMPLE), 0);
});

test('it counts rows across every register they were typed into', () => {
  empty();
  const one = add('obligations', { title: 'Renew the licence' }, SAMPLE);
  assert.equal(anyPending(SAMPLE), 1);
  add('people', { title: 'Halden' }, SAMPLE);
  /* THE POINT OF THE WHOLE THING: two screens, one number, and neither screen knows about the other. */
  assert.equal(anyPending(SAMPLE), 2);
  drop('obligations', one);
  assert.equal(anyPending(SAMPLE), 1);
  empty();
});

test('correcting a row does not count as a second one', () => {
  empty();
  const seq = add('obligations', { title: 'Renew the licenc' }, SAMPLE);
  assert.equal(replace('obligations', seq, { title: 'Renew the licence' }), true);
  assert.equal(anyPending(SAMPLE), 1);
  empty();
});

/**
 * A ROW TYPED AGAINST THE SAMPLE IS NOT A ROW OF YOUR BUSINESS, and it used to be drawn as one.
 *
 * THE LIST MERGED THIS HOLDER INTO ITS ANSWER WHATEVER IT WAS DRAWING. `pending.of(id)` took no
 * view of the source, so the first row somebody typed while the shell was showing the fictional
 * studio was drawn at the top of a live register, merged into `result.entries`, added to `matched`,
 * counted in the head's denominator and in the filter pills' figures, and reachable at its own
 * address on `/r/<register>/-1`. Nothing about it said it belonged to another shell; it wore `Not
 * saved`, which in a real business reads as work of yours that is at risk.
 *
 * IT DOES NOT NEED A BUG ANYWHERE ELSE TO HAPPEN. `/start` decides whether there is a record from
 * its own `packs` call and the list decides from `boot`, and either call answering `UNREACHABLE`
 * once is enough for the screen taking the row and the screen drawing it to disagree.
 */
test('rows typed against the sample are not handed to a record', () => {
  empty();
  add('obligations', { title: 'Deposit for the print run' }, SAMPLE);
  assert.equal(of('obligations', SAMPLE).length, 1, 'the sample cannot see the row it took');
  assert.deepEqual(of('obligations', RECORD), [], 'a live list draws a row typed against the sample');
  empty();
});

/**
 * AND THE SHELL DOES NOT ANNOUNCE THEM OVER A RECORD EITHER.
 *
 * The banner is drawn on every screen, so this is the sentence a person reads all day: one row
 * typed on a demo followed them into their own business and said something was unsaved there.
 */
test('the count the shell reads is zero over a record', () => {
  empty();
  add('obligations', { title: 'Renew the licence' }, SAMPLE);
  add('people', { title: 'Halden' }, SAMPLE);
  assert.equal(anyPending(SAMPLE), 2);
  assert.equal(anyPending(RECORD), 0, 'the shell says a row of yours is unsaved in front of a record');
  empty();
});

/**
 * AND NOTHING ACCUMULATES ACROSS THE TWO.
 *
 * A tab can go from the sample to a record without a reload: `boot-live.ts` drops its kept answer
 * on `forget()`, so the next read can find the record that was not there before. The rows held for
 * the shell that has gone are not rows any screen can put right any more, and keeping them would
 * leave the holder carrying two records' worth of answers with one number over them.
 */
test('a row typed against a record replaces what the sample left behind', () => {
  empty();
  add('obligations', { title: "the studio's" }, SAMPLE);
  const mine = add('obligations', { title: 'mine' }, RECORD);
  assert.equal(anyPending(SAMPLE), 0, 'the sample still holds rows after the tab reached a record');
  assert.equal(anyPending(RECORD), 1);
  const held = of('obligations', RECORD);
  assert.equal(held.length, 1, 'the two shells share one list of waiting rows');
  assert.equal(held[0]?.seq, mine);
  empty();
});

test('the sentence counts what is there and never reports a nought', () => {
  assert.equal(copy.unsavedRows(1), 'One row you typed has not been saved.');
  assert.match(copy.unsavedRows(2), /^2 rows /u);
  /* A count of one is a row and not rows: the shell draws this on every screen, so the one sentence
     somebody reads all day has to be written the way a person would say it. */
  assert.ok(!copy.unsavedRows(1).includes('rows'), 'one row is reported as rows');
  /* THE CHARACTER ITSELF IS NEVER TYPED INTO THIS FILE. The house rule is that it appears nowhere
     a reader meets, and a test that grepped for it by writing it would be the one place it lived. */
  const emDash = String.fromCharCode(0x2014);
  for (const said of [copy.unsavedRows(1), copy.unsavedRows(4), copy.unsavedRowsWhy]) {
    assert.ok(!said.includes('!'), `the shell raises its voice: ${said}`);
    assert.ok(!said.includes(emDash), `an em dash reached the interface: ${said}`);
  }
  /* It says where the rows are, in the words the row itself wears on the list. */
  assert.ok(copy.unsavedRowsWhy.includes(copy.markNotWritten), 'the note and the row say different things');
});
