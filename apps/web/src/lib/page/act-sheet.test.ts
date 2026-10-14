/**
 * The one step a press on a declared action takes first, the sentence a hard one is asked with, and what a press sends.
 * Pure: no DOM, no record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answeredValue, argsOf, doneOf, HARD_PLAIN, HARD_SAID, lookOf, pastStep, stepOf, type ActAction } from './act-sheet.ts';

const act = (over: Partial<ActAction> = {}): ActAction => ({ verb: 'row.update', label: 'Mark paid', ...over });

test('each flag picks its step, and a plain press is held for its Undo', () => {
  assert.deepEqual(stepOf(act()), { step: 'hold' });
  assert.deepEqual(stepOf(act({ undo: false })), { step: 'run' });
  assert.deepEqual(stepOf(act({ confirm: ' Clear the kiln log? ' })), { step: 'confirm', said: 'Clear the kiln log?' });
  assert.deepEqual(stepOf(act({ again: true })), { step: 'again' });
  assert.deepEqual(stepOf(act({ once: true })), { step: 'once' });
  assert.deepEqual(stepOf(act({ look_first: true })), { step: 'look_first' });
});

test('sign in comes first, then the look, then the loss, and a step said yes to is not asked again', () => {
  let a = act({ again: true, look_first: true, confirm: 'Sure?', once: true });
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    const { step } = stepOf(a);
    seen.push(step);
    if (step === 'once' || step === 'hold' || step === 'run') break;
    a = pastStep(a, step);
  }
  /* A LOOK TAKEN IS THE YES: Do it is pressed on what will change, so the loss is not asked a second time. */
  assert.deepEqual(seen, ['again', 'look_first', 'once']);
  assert.deepEqual(stepOf(pastStep(act({ confirm: 'Sure?' }), 'confirm')), { step: 'hold' });
});

test('a hard verb with no sentence of its own is asked the plain one for its verb', () => {
  assert.deepEqual(stepOf(act({ verb: 'row.delete', label: 'Delete', hard: true })), { step: 'confirm', said: HARD_SAID['row.delete'] });
  assert.deepEqual(stepOf(act({ verb: 'stall.seal', label: 'Seal', hard: true })), { step: 'confirm', said: HARD_PLAIN });
  /* THE PAGE'S OWN SENTENCE WINS where it wrote one. */
  assert.deepEqual(stepOf(act({ verb: 'row.delete', label: 'Delete', hard: true, confirm: 'Drop the Halden order?' })), { step: 'confirm', said: 'Drop the Halden order?' });
});

test('args fill from the row, a field arg names its field, and the press fills what the page left unbound', () => {
  const row = { fields: { state: 'open', pick: 'Glaze first', paid: false } };
  assert.deepEqual(argsOf({ verb: 'row.move', args: { field: 'state' } }, row, 'done'), { field: 'state', to: 'done' });
  assert.deepEqual(argsOf({ verb: 'suggestion.answer', args: { option: 'pick' } }, row, 'ignored'), { option: 'Glaze first' });
  assert.deepEqual(argsOf({ verb: 'row.tick' }, row, 'true'), { done: 'true' });
  /* A FIELD THE ROW DOES NOT HOLD IS LEFT OUT, so the record says what is missing, not a write of nothing. */
  assert.deepEqual(argsOf({ verb: 'rule.from_arrivals', args: { arrivals: 'inbox' } }, row), {});
  assert.deepEqual(argsOf({ verb: 'row.update', args: { field: 'paid' } }, null), { field: 'paid' });
});

test('a switch says done in words, the shown value is read off the answer, and the look names the thing', () => {
  assert.equal(doneOf('on'), true);
  assert.equal(doneOf(false), false);
  assert.equal(doneOf('maybe'), null);
  assert.equal(answeredValue({ value: 'kiln-7' }), 'kiln-7');
  assert.equal(answeredValue({ seq: 4 }), null);
  assert.deepEqual(lookOf({ verb: 'row.move', label: 'Move' }, 'Fire the bisque', { to: 'done' }), ['“Fire the bisque” moves to done.']);
  assert.ok(lookOf({ verb: 'rule.from_arrivals', label: 'File them' }, null, {}).every((l) => !l.includes('rule.from')));
});
