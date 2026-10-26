/**
 * A bare key the shell would take (`?` for the keys sheet, `/`, `g`) is left alone while it is part of typing: begun in
 * a field, mid-composition, or pressed just after a key typed in a field whose box went away under it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inField, notTheShells, stillTyping, STILL_TYPING_MS } from './typed.ts';

/** An element as `closest` answers for it: inside a field when `field` is true. */
const el = (field: boolean, editable = false) => ({ closest: (s: string) => (field && s.includes('textarea') ? {} : null), isContentEditable: editable });
const page = el(false);

test('A KEY BEGUN IN A FIELD IS THE FIELD\'S, whatever holds the focus by now', () => {
  assert.equal(inField(el(true)), true);
  assert.equal(inField(el(false, true)), true);
  assert.equal(inField(page), false);
  assert.equal(inField(null), false);
  assert.equal(inField(window_()), false);
});

test('A `?` PRESSED JUST AFTER TYPING IN A BOX THAT WENT AWAY IS NOT THE SHELL\'S, and one pressed after a pause is', () => {
  const typedAt = 10_000;
  assert.equal(notTheShells({ target: page, timeStamp: typedAt + 200 }, typedAt), true);
  assert.equal(notTheShells({ target: page, timeStamp: typedAt + STILL_TYPING_MS + 1 }, typedAt), false);
  assert.equal(notTheShells({ target: page, timeStamp: 50 }, Number.NEGATIVE_INFINITY), false, 'nothing typed yet');
  assert.equal(notTheShells({ target: page, timeStamp: typedAt + 5_000, isComposing: true }, typedAt), true);
  assert.equal(notTheShells({ target: el(true), timeStamp: typedAt + 5_000 }, typedAt), true);
  assert.equal(stillTyping(typedAt, typedAt - 1), false, 'a clock that went back is no typing');
});

/** The window, as a target with no `closest`. */
function window_(): unknown {
  return {};
}
