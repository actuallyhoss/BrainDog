/**
 * The pattern builder says what a rule does with a message in the person's words: where what it reads is filed, never
 * the rows it writes or the list they go into (DIRECTION §35).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readingSaid, words } from './words.ts';

const SYSTEM = /\b(rows?|lists?|registers?|blocks?|entity|entities|field id)\b/iu;

test('nothing the builder says names the system', () => {
  for (const [key, w] of Object.entries(words)) {
    const lines = typeof w === 'string' ? [w] : typeof w === 'function' ? [String((w as (...a: unknown[]) => unknown)('Kiln', 2, 3))] : Array.isArray(w) ? w : Object.values(w as object);
    for (const line of lines) assert.doesNotMatch(String(line), SYSTEM, `${key}: "${String(line)}"`);
  }
});

test('a reading is said as where it looks in the message', () => {
  assert.equal(readingSaid({ money: { after: 'Amount:' } }), 'the amount after “Amount:”');
});
