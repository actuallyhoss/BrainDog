/**
 * `34 §1.9` — the second backend, held to what the section says rather than to most of it.
 *
 * WRITTEN BEFORE THE CODE AND RUN AGAINST THE CODE AS IT STANDS, so every assertion below has been
 * seen to fail for the reason it is about. A test for a refusal that is added in the same edit as
 * the refusal proves the edit compiled and nothing else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addressable, compile, evaluate, INBOX_RAW, OPERATORS,
} from '../src/index.ts';

const codes = (p: unknown) => compile(p as never, INBOX_RAW).bad.map((b) => b.code);

/** `§1.9`'s seven refused words, and the sentence is the whole list rather than the easy part. */
const REFUSED = ['via', 'has', 'lacks', 'near', 'matches', 'starts', 'ends'] as const;
const VALUE: Record<string, unknown> = {
  via: { ref: 'x', where: {} }, has: 'x', lacks: 'x', near: { text: 'x', k: 5 },
  matches: 'x', starts: 'x', ends: 'x',
};

test('THE SEVEN WORDS 1.9 REFUSES ARE REFUSED, AND NOT THE THREE THIS BUILD HAPPENED TO REFUSE ANYWAY', () => {
  for (const op of REFUSED) {
    const leaf = op === 'via' ? { via: VALUE.via } : { field: 'subject', [op]: VALUE[op] };
    assert.deepEqual(codes(leaf), ['MATCH_OP_UNSUPPORTED'], `${op} over inbox_raw`);
  }
});

test('AND EVALUATE ANSWERS FALSE TO EVERY ONE OF THEM, because a refusal that only compile knows about fires', () => {
  for (const op of REFUSED) {
    const leaf = op === 'via' ? { via: VALUE.via } : { field: 'subject', [op]: VALUE[op] };
    assert.equal(evaluate(leaf as never, { subject: 'x' }, INBOX_RAW), false, `${op} over inbox_raw`);
  }
});

test('THE FOURTEEN THAT REMAIN STILL WORK, so the refusal is a list and not a mood', () => {
  const kept = OPERATORS.filter((o) => !(REFUSED as readonly string[]).includes(o));
  assert.equal(kept.length, 14, kept.join(" "));
  assert.deepEqual(codes({ field: 'subject', contains: 'invoice' }), []);
  assert.deepEqual(codes({ field: 'channel', is: 'email' }), []);
  assert.deepEqual(codes({ field: 'ts', after: '2026-01-01' }), []);
  assert.equal(evaluate({ field: 'subject', contains: 'invoice' } as never, { subject: 'Your invoice' }, INBOX_RAW), true);
});

test('A REFUSAL NEVER NAMES A FIELD THE NEXT CALL REFUSES', () => {
  const said = compile({ field: 'nope', is: 'x' } as never, INBOX_RAW).bad[0];
  assert.equal(said?.code, 'FIELD_UNKNOWN');
  for (const name of said?.allowed ?? [])
    assert.deepEqual(codes({ field: name, present: true }), [], `the refusal offered ${name} and then refused it`);
});

test('AND THE LIST IT OFFERS IS THE SEVEN, not the seven plus the record\'s five', () => {
  assert.deepEqual(addressable(INBOX_RAW), ['from', 'to', 'subject', 'body', 'channel', 'state', 'ts']);
});
