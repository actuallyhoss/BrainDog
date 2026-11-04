/**
 * `quietSign`, the kernel's: a sign as a reader without the inbox reach reads it. Every sign
 * with a `QUIET` sentence loses the message and question words its own sentence carried, a sign read `none` keeps its
 * sentence, and every sign's facts are emptied. The record's `signs` method re-exports this same function.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUIET, VITAL_SIGNS, quietSign, type VitalSign } from '../src/signs.ts';
import { quietSign as recordQuiet } from '../../record/src/methods/signs.ts';

const WORDS = 'please move my dentist to Friday';
const ASKED = 'Which bank pays the rent?';

const sign = (id: string, over: Partial<VitalSign>): VitalSign => ({
  sign: id,
  name: 'A sign',
  state: 'green',
  value: 2,
  said: `Most say: ${WORDS}. ${ASKED}`,
  facts: [WORDS, ASKED],
  days: [{ day: '2026-10-08', state: 'green' }],
  ...over,
});

test('QUIET NAMES ONLY SIGNS ON THE CLOSED LIST', () => {
  const ids = new Set(VITAL_SIGNS.map((s) => s.sign));
  assert.deepEqual(Object.keys(QUIET).sort(), ['arrivals-filed', 'questions-by-cause']);
  for (const id of Object.keys(QUIET)) assert.ok(ids.has(id), id);
});

for (const id of Object.keys(QUIET)) {
  for (const [state, value] of [
    ['red', 5],
    ['green', 0],
    ['green', 1],
    ['green', 3],
    ['green', null],
  ] as const) {
    test(`${id} ${state} ${String(value)}: NO MESSAGE OR QUESTION WORDS, NO FACTS, the rest kept`, () => {
      const s = sign(id, { state, value });
      const q = quietSign(s);
      assert.doesNotMatch(q.said, /dentist|Friday|bank|rent|Most say/);
      assert.notEqual(q.said, s.said);
      assert.doesNotMatch(q.said, /—|undefined|null|NaN/);
      assert.deepEqual(q.facts, []);
      /* A FAILURE IS TITLED BY ITS QUESTION'S WORDS (AG7), so a quiet one goes back to the sign's own name. */
      if (id === 'questions-by-cause') assert.equal(q.name, 'Each problem is asked once');
      assert.deepEqual({ ...q, said: s.said, facts: s.facts, name: s.name }, s);
    });
  }
}

test('THE QUIET SENTENCES SAY THE NUMBER AND NOTHING THAT WAS SENT', () => {
  assert.equal(quietSign(sign('arrivals-filed', { value: 1 })).said, '1 message waits to be filed, not yet too long.');
  assert.equal(quietSign(sign('arrivals-filed', { value: 3 })).said, '3 messages wait to be filed, not yet too long.');
  assert.equal(quietSign(sign('arrivals-filed', { value: 0 })).said, 'No message waits to be filed.');
  assert.equal(quietSign(sign('arrivals-filed', { state: 'red' })).said, 'Messages came in that are not filed yet.');
  assert.equal(quietSign(sign('questions-by-cause', { value: 1 })).said, '1 open question, no two with the same cause.');
  assert.equal(quietSign(sign('questions-by-cause', { value: 4 })).said, '4 open questions, no two with the same cause.');
  assert.equal(quietSign(sign('questions-by-cause', { value: 0 })).said, 'No question is waiting.');
  assert.equal(quietSign(sign('questions-by-cause', { state: 'red' })).said, 'Open questions pile up on one cause, or carry none.');
});

test('A SIGN READ NONE KEEPS ITS OWN SENTENCE, and loses its facts', () => {
  for (const id of Object.keys(QUIET)) {
    const q = quietSign(sign(id, { state: 'none', value: null, said: 'This sign could not be read.' }));
    assert.equal(q.said, 'This sign could not be read.');
    assert.deepEqual(q.facts, []);
  }
});

test('A SIGN NOT IN QUIET KEEPS ITS SENTENCE, and loses its facts', () => {
  const s = sign('runs-true', { said: 'Runs ended as they ended this week.' });
  assert.deepEqual(quietSign(s), { ...s, facts: [] });
});

test('THE RECORD READS THE SAME FUNCTION, not a copy', () => {
  assert.equal(recordQuiet, quietSign);
});
