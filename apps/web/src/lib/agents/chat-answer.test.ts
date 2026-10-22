/** "Answer from inside chat apps": off unless the owner's pref says `true`, and a sentence for each state. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHAT_ANSWER_PREF, chatAnswerOn, chatAnswerSaid, chatAnswerWords } from './chat-answer.ts';

test('off until the pref is true, whatever else it holds', () => {
  assert.equal(chatAnswerOn(undefined), false);
  assert.equal(chatAnswerOn({}), false);
  assert.equal(chatAnswerOn({ [CHAT_ANSWER_PREF]: false }), false);
  assert.equal(chatAnswerOn({ [CHAT_ANSWER_PREF]: 'true' }), false, 'a string is not on');
  assert.equal(chatAnswerOn({ [CHAT_ANSWER_PREF]: true }), true);
});

test('each state says what a press in the chat does, in words and no ids', () => {
  assert.equal(chatAnswerSaid(true), chatAnswerWords.on);
  assert.equal(chatAnswerSaid(false), chatAnswerWords.off);
  assert.match(chatAnswerWords.on, /cannot press for you/u);
  assert.match(chatAnswerWords.off, /open BrainDog/u);
  for (const said of [chatAnswerWords.on, chatAnswerWords.off]) assert.doesNotMatch(said, /—|agents\.answer/u);
});
