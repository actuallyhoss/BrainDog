import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sentenced } from '$lib/flow/source.ts';
import { askable, keepOf, sentenceWords, underSentence } from './sentence.ts';

const read = (over: Partial<Sentenced> = {}): Sentenced => ({
  rule: 'when-a-bill-is-due',
  said: 'When a bill is due in 3 days, tell me.',
  by: 'rules',
  body: { rule: 'when-a-bill-is-due', register: 'bills', then: [{ notify: { say: 'x' } }] },
  path: 'inline',
  looked: { days: 30, runs: 2, atLeast: false, sample: ['Rent', 'Phone'], line: 'It would have run 2 times in the last 30 days: Rent, Phone.' },
  notes: [],
  ...over,
});

test('keeping a sentence files the rule as a new declaration under the id the record chose', () => {
  const p = keepOf(read());
  assert.equal(p.body_kind, 'change');
  assert.deepEqual(p.body, { declaration_id: 'rule.when-a-bill-is-due', to: { id: 'rule.when-a-bill-is-due', kind: 'rule', body: read().body }, from_version: 0 });
  assert.ok(p.question.includes('When a bill is due in 3 days, tell me.'));
});

test('under the sentence the look comes first and the model is owned up to', () => {
  assert.deepEqual(underSentence(read({ notes: ['Only the owner can look back.'], by: 'model' })), [
    'It would have run 2 times in the last 30 days: Rent, Phone.',
    'Only the owner can look back.',
    sentenceWords.byModel,
  ]);
});

test('a sentence with no look says so instead of promising a count', () => {
  assert.equal(underSentence(read({ looked: null }))[0], sentenceWords.noLook);
});

test('a box of spaces has nothing to read', () => {
  assert.equal(askable('   '), false);
  assert.equal(askable('When a bill is added, tell me'), true);
});
