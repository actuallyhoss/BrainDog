/**
 * The count the shell reads, and the sentence it says.
 *
 * `anyPending` had no call site for six days while its own docstring described the promise it was
 * written to keep: a row typed on the first run and left behind is unwritten, and no screen but the
 * one it belongs to said so. These are the two halves of keeping it: the number is right wherever
 * the rows were typed, and it is zero when there is nothing, because zero is what the shell reads
 * to decide to say nothing at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { add, anyPending, drop, of, replace } from './pending.svelte.ts';

/* The map lives for the module, so a test that leaves rows behind is a test the next one inherits. */
function empty(): void {
  for (const register of ['obligations', 'people', 'money']) for (const row of [...of(register)]) drop(register, row.seq);
  assert.equal(anyPending(), 0);
}

test('NOTHING WAITING IS ZERO, which is what makes the shell able to say nothing', () => {
  empty();
  assert.equal(anyPending(), 0);
});

test('it counts rows across every register they were typed into', () => {
  empty();
  const one = add('obligations', { title: 'Renew the licence' });
  assert.equal(anyPending(), 1);
  add('people', { title: 'Halden' });
  /* THE POINT OF THE WHOLE THING: two screens, one number, and neither screen knows about the other. */
  assert.equal(anyPending(), 2);
  drop('obligations', one);
  assert.equal(anyPending(), 1);
  empty();
});

test('correcting a row does not count as a second one', () => {
  empty();
  const seq = add('obligations', { title: 'Renew the licenc' });
  assert.equal(replace('obligations', seq, { title: 'Renew the licence' }), true);
  assert.equal(anyPending(), 1);
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
