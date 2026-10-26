/** "Agents may answer when you tell them": on unless the owner's pref says `false`, and a sentence for each state. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ON_WORD_PREF, onWordOn, onWordSaid, onWordWords } from './on-word.ts';

test('on until the pref is false, whatever else it holds', () => {
  assert.equal(onWordOn(undefined), true);
  assert.equal(onWordOn({}), true);
  assert.equal(onWordOn({ [ON_WORD_PREF]: true }), true);
  assert.equal(onWordOn({ [ON_WORD_PREF]: 'false' }), true, 'a string is not off');
  assert.equal(onWordOn({ [ON_WORD_PREF]: false }), false);
});

test('each state says what telling an agent does, in words and no ids', () => {
  assert.equal(onWordSaid(true), onWordWords.on);
  assert.equal(onWordSaid(false), onWordWords.off);
  assert.equal(onWordWords.title, 'Agents may answer when you tell them');
  assert.match(onWordWords.on, /undo/u);
  for (const said of [onWordWords.on, onWordWords.off]) assert.doesNotMatch(said, /—|agents\.answer/u);
});
