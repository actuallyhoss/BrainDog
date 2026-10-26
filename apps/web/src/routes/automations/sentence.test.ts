import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sentenced } from '$lib/flow/source.ts';
import { addStep, applyOption, askable, composeSentence, dropStep, exampleOf, isCurrent, keepOf, keyMove, moveStep, sentenceWords, swapStep, underSentence, wholeSentence } from './sentence.ts';

const read = (over: Partial<Sentenced> = {}): Sentenced => ({
  rule: 'when-a-bill-is-due',
  said: 'When a bill is due in 3 days, tell me.',
  by: 'rules',
  body: { rule: 'when-a-bill-is-due', register: 'bills', then: [{ notify: { say: 'x' } }] },
  path: 'inline',
  looked: { days: 30, runs: 2, atLeast: false, sample: ['Rent', 'Phone'], line: 'It would have run 2 times in the last 30 days: Rent, Phone.' },
  notes: [],
  parts: null,
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

test('the pieces compose into the sentence the record reads again', () => {
  assert.equal(composeSentence(['a ', 'bill', ' ', 'is due today'], ['tell me', 'tag it urgent']), 'When a bill is due today, tell me and tag it urgent');
});

test('picking an option rewrites only the pieces it names', () => {
  const trigger = [
    { kind: 'text', text: 'a new ' },
    { kind: 'thing', text: 'bill' },
    { kind: 'text', text: ' is ' },
    { kind: 'timing', text: 'added to' },
  ] as const;
  const option = { label: 'changed in', set: { '0': 'a ', '3': 'changed in' } };
  assert.deepEqual(applyOption(trigger, option), ['a ', 'bill', ' is ', 'changed in']);
  assert.equal(isCurrent(trigger, option), false);
  assert.equal(isCurrent(trigger, { label: 'added to', set: { '3': 'added to' } }), true);
});

test('a step moves, and a move out of range changes nothing', () => {
  assert.deepEqual(moveStep(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveStep(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveStep(['a', 'b'], 1, 5), ['a', 'b']);
});

test('the last step cannot be removed and a repeated one is not added twice', () => {
  assert.deepEqual(dropStep(['a'], 0), ['a']);
  assert.deepEqual(dropStep(['a', 'b'], 0), ['b']);
  assert.deepEqual(addStep(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(addStep(['a', 'b'], 'b'), ['a', 'b']);
  assert.deepEqual(swapStep(['a', 'b'], 1, 'c'), ['a', 'c']);
});

test('Alt with an arrow moves a step by one and stops at the ends', () => {
  assert.equal(keyMove('ArrowUp', true, 2, 3), 1);
  assert.equal(keyMove('ArrowUp', true, 0, 3), 0);
  assert.equal(keyMove('ArrowDown', true, 2, 3), 2);
  assert.equal(keyMove('ArrowDown', false, 1, 3), null);
  assert.equal(keyMove('Enter', true, 1, 3), null);
});

test('the box example is the record’s own: its first list with a due date, by the first word of its name', () => {
  const day = (id: string) => ({ id, type: 'day' });
  assert.equal(exampleOf([{ name: 'Ledger', fields: [day('on')] }, { name: 'Bills and invoices', fields: [day('due')] }]), 'When a bill is due in 3 days, tell me');
  assert.equal(exampleOf([{ name: 'Orders', fields: [{ id: 'ship_by', type: 'day', deadline: true }] }]), 'When an order is due in 3 days, tell me');
  assert.equal(exampleOf([{ name: 'Notes' }]), sentenceWords.placeholder);
  assert.equal(sentenceWords.hint('When a bill is due in 3 days, tell me'), 'For example: When a bill is due in 3 days, tell me.');
});

/* THE PASS OF 27 OCTOBER: an automation's page says it whole first, its script named. */
test('an automation is said whole: what starts it, then each step in order', () => {
  assert.equal(
    wholeSentence('When an item in Bills and invoices has its Status set to paid', ['Run the script Move a repeating line on']),
    'When an item in Bills and invoices has its Status set to paid, run the script Move a repeating line on.',
  );
  assert.equal(wholeSentence('Every day at 9:00', ['Tell you: Bills due', 'Run the script Tidy up.']), 'Every day at 9:00, tell you: Bills due, then run the script Tidy up.');
  assert.equal(wholeSentence('When anything arrives', []), '');
  assert.equal(wholeSentence('', ['Run a script']), '');
});
