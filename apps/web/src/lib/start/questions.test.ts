/**
 * The first run asks back (USE-B06): the rules' questions first, then the model's, two at most, none asked twice, and
 * each answer said back as a sentence of its own. Invented names only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CurrencyEnv } from '../../routes/start/building.ts';
import { answerAsSaid, CHOICE_MOST, questionsOf, valueOf, words, type ModelQuestion, type Reading } from './questions.ts';
import { words as one } from './question.ts';

/** A reading that placed a use case, with a name and nothing missing. */
const PLACED: Reading = { name: 'Ilsa', currency: null, money: false, usecase: 'personal', draft: false };

const PUPILS: ModelQuestion = { about: 'things', question: 'What are your students called here: Students or Pupils?', choices: ['Students', 'Pupils'] };
const LIVING: ModelQuestion = { about: 'kind', question: 'Is the piano teaching your living?', choices: ['My living', 'On the side'] };

/** A device in Lisbon that knows three currencies. */
const LISBON: CurrencyEnv = {
  codes: ['EUR', 'GBP', 'BAM'],
  nameOf: (c) => ({ EUR: 'Euro', GBP: 'British Pound', BAM: 'Bosnia-Herzegovina Convertible Mark' })[c] ?? c,
  englishOf: (c) => ({ EUR: 'Euro', GBP: 'British Pound', BAM: 'Bosnia-Herzegovina Convertible Mark' })[c] ?? c,
  regions: ['PT'],
  zone: 'Europe/Lisbon',
  zonesOf: (r) => (r === 'PT' ? ['Europe/Lisbon'] : r === 'GB' ? ['Europe/London'] : null),
  regionName: (r) => r,
};

test('NO NAME HEARD ASKS THE NAME, first, typed with no taps', () => {
  const qs = questionsOf({ ...PLACED, name: null }, 'I teach piano and want to keep track of my students');
  assert.equal(qs.length, 1);
  assert.deepEqual(qs[0], { about: 'name', question: one.nameQuestion, choices: [], by: 'rules' });
  assert.equal(qs[0]?.question, 'What should I call you?');
});

test('A NAME TYPED ASKS NOTHING ABOUT IT, and the model asking it anyway is dropped', () => {
  assert.deepEqual(questionsOf(PLACED, "I'm Ilsa. I keep my reading list"), []);
  const qs = questionsOf({ ...PLACED, ask: { about: 'name', question: 'What is your name?', choices: [] } }, "I'm Ilsa");
  assert.deepEqual(qs, []);
});

test('THE BIG WIN: the piano teacher is asked her name, then what her students are called, in the model words', () => {
  const qs = questionsOf({ name: null, currency: null, money: false, usecase: 'personal', draft: false, ask: PUPILS }, 'I teach piano and want to keep track of my students');
  assert.deepEqual(qs.map((q) => q.about), ['name', 'things']);
  assert.equal(qs[1]?.question, PUPILS.question);
  assert.deepEqual(qs[1]?.choices, [{ value: 'Students', label: 'Students' }, { value: 'Pupils', label: 'Pupils' }]);
  assert.equal(qs[1]?.by, 'model');
});

test('THE MODEL TWO ARE CUT TO TWO IN TOTAL, the rules first', () => {
  const qs = questionsOf({ ...PLACED, name: null, ask: [PUPILS, LIVING] }, 'I teach piano');
  assert.deepEqual(qs.map((q) => q.about), ['name', 'things']);
  assert.deepEqual(questionsOf({ ...PLACED, ask: [PUPILS, LIVING] }, 'I teach piano').map((q) => q.about), ['things', 'kind']);
  assert.equal(questionsOf({ ...PLACED, name: null, ask: [PUPILS] }, 'x', [], { most: 1 }).length, 1);
});

test('A PAGE OWN RULE QUESTION COMES AFTER THE THREE AND BEFORE THE MODEL', () => {
  const orders = { about: 'arrivesBy' as const, question: 'Where do your orders come in?', choices: [{ value: 'app', label: 'A shop app' }], by: 'rules' as const };
  const qs = questionsOf({ ...PLACED, ask: PUPILS }, 'I sell candles', [], { also: [orders] });
  assert.deepEqual(qs.map((q) => q.question), [orders.question, PUPILS.question]);
  assert.deepEqual(questionsOf({ ...PLACED, ask: PUPILS }, 'I sell candles', ['arrivesBy'], { also: [orders] }).map((q) => q.about), ['things']);
});

test('A SKIPPED OR ANSWERED QUESTION NEVER COMES BACK, the next one takes its place', () => {
  const reading: Reading = { ...PLACED, name: null, ask: [PUPILS, LIVING] };
  assert.deepEqual(questionsOf(reading, 'I teach piano', ['name']).map((q) => q.about), ['things', 'kind']);
  assert.deepEqual(questionsOf(reading, 'I teach piano', new Set(['name', 'things'])).map((q) => q.about), ['kind']);
  assert.deepEqual(questionsOf(reading, 'I teach piano', ['name', 'things', 'kind']), []);
});

test('MONEY WITH NO CURRENCY ASKS THE CURRENCY the start pages ask, the device first; a long name is its code', () => {
  const qs = questionsOf({ ...PLACED, money: true }, 'Tomas owes me 40', [], { env: LISBON });
  assert.equal(qs.length, 1);
  assert.equal(qs[0]?.about, 'currency');
  assert.equal(qs[0]?.question, 'Which currency do you use?');
  assert.equal(qs[0]?.choices[0]?.value, 'EUR');
  for (const c of qs[0]?.choices ?? []) assert.ok([...c.label].length <= CHOICE_MOST, c.label);
  assert.deepEqual(questionsOf({ ...PLACED, money: true, currency: 'EUR' }, 'Tomas owes me 40 euros'), []);
});

test('THE MODEL ASKING THE CURRENCY TAKES THE RULE PLACE in its words, with the rule taps', () => {
  const ask: ModelQuestion = { about: 'currency', question: 'Are your lessons paid in euros?', choices: ['Euros', 'Pounds'] };
  const qs = questionsOf({ ...PLACED, money: true, ask }, 'Tomas owes me 40', [], { env: LISBON });
  assert.equal(qs.length, 1);
  assert.equal(qs[0]?.question, ask.question);
  assert.equal(qs[0]?.choices[0]?.value, 'EUR');
});

test('NOTHING PLACED ASKS WHAT IT IS CLOSEST TO, with the use cases to tap; a draft or a part places it', () => {
  const qs = questionsOf({ name: 'Ilsa', currency: null, money: false, usecase: null, draft: false }, 'something odd');
  assert.equal(qs[0]?.about, 'closest');
  assert.equal(qs[0]?.question, 'What is it closest to?');
  assert.ok((qs[0]?.choices.length ?? 0) > 1);
  for (const c of qs[0]?.choices ?? []) assert.ok([...c.label].length <= CHOICE_MOST, c.label);
  assert.deepEqual(questionsOf({ ...PLACED, usecase: null, draft: true }, 'x'), []);
  assert.deepEqual(questionsOf({ ...PLACED, usecase: null, parts: 2 }, 'x'), []);
});

test('A MODEL QUESTION THAT DOES NOT FIT IS NO QUESTION; a choice too long or a line break is left out', () => {
  const long: ModelQuestion = { about: 'kind', question: `Is it ${'very '.repeat(30)}your living?`, choices: [] };
  assert.deepEqual(questionsOf({ ...PLACED, ask: long }, 'x'), []);
  assert.deepEqual(questionsOf({ ...PLACED, ask: { about: 'kind', question: 'Is it\nyour living?', choices: [] } }, 'x'), []);
  const qs = questionsOf({ ...PLACED, ask: { about: 'who_for', question: 'Who is it for?', choices: ['Me', 'A very long answer that runs past it', 'Me'] } }, 'x');
  assert.deepEqual(qs[0]?.choices, [{ value: 'Me', label: 'Me' }]);
});

test('THE ANSWER IS SAID BACK AS A SENTENCE OF ITS OWN', () => {
  assert.equal(answerAsSaid({ about: 'name', question: one.nameQuestion }, ' Mara '), 'Call me Mara.');
  assert.equal(answerAsSaid({ about: 'name', question: one.nameQuestion }, 'Mara.'), 'Call me Mara.');
  assert.equal(answerAsSaid(PUPILS, 'Pupils'), 'They are called Pupils.');
  assert.equal(answerAsSaid({ about: 'currency', question: 'Which currency do you use?' }, 'Euro'), 'My money is in Euro.');
  assert.equal(answerAsSaid({ about: 'closest', question: 'What is it closest to?' }, 'Small business'), 'It is closest to Small business.');
  assert.equal(answerAsSaid({ about: 'who_for', question: 'Who is it for?' }, 'my students'), 'It is for my students.');
  assert.equal(answerAsSaid(LIVING, 'On the side'), 'Is the piano teaching your living? On the side.');
  assert.equal(answerAsSaid(PUPILS, '   '), '');
  assert.equal(answerAsSaid({ about: 'things', question: 'Do you keep students or classes?' }, 'Classes'), 'Do you keep students or classes? Classes.');
});

test('THE WORDS ARE PLAIN: no em dash, and the count says how many', () => {
  for (const w of Object.values(words)) assert.ok(!w.includes('—'), w);
  assert.equal(words.one, 'One question');
  /* THE NAME IS ASKED IN THE ONE-QUESTION SCREEN'S OWN WORDS. */
  assert.equal(words.name, one.nameQuestion);
});

test('A SECOND MODEL QUESTION ABOUT THE SAME THING IS DROPPED, the first kept and nothing drawn twice', () => {
  const again: ModelQuestion = { about: 'things', question: 'Do you call them students?', choices: ['Yes', 'No'] };
  const qs = questionsOf({ ...PLACED, ask: [PUPILS, again] }, 'I teach piano');
  assert.deepEqual(qs.map((q) => q.question), [PUPILS.question]);
});

test('WHAT AN ANSWER LAYS ON THE READING: a currency only as a code, a use case only as a tap, the rest as typed', () => {
  const [cur] = questionsOf({ ...PLACED, money: true }, 'Tomas owes me 40', [], { env: LISBON });
  assert.ok(cur);
  assert.equal(valueOf(cur, 'EUR'), 'EUR');
  assert.equal(valueOf(cur, 'euro'), 'EUR');
  assert.equal(valueOf(cur, 'gbp'), 'GBP');
  assert.equal(valueOf(cur, 'dollars'), null);
  assert.equal(valueOf(cur, 'YEN'), null);
  const model = questionsOf({ ...PLACED, ask: { about: 'currency', question: 'Are lessons paid in euros?', choices: ['Euros', 'Pounds'] } }, 'x');
  assert.equal(valueOf(model[0]!, 'Euros'), null);
  const [closest] = questionsOf({ ...PLACED, usecase: null }, 'something odd');
  assert.ok(closest);
  const first = closest.choices[0]!;
  assert.equal(valueOf(closest, first.label.toUpperCase()), first.value);
  assert.equal(valueOf(closest, 'my shop'), null);
  assert.equal(valueOf({ about: 'name', question: words.name, choices: [], by: 'rules' }, ' Mara. '), 'Mara');
  assert.equal(valueOf(questionsOf({ ...PLACED, ask: PUPILS }, 'x')[0]!, 'pupils'), 'Pupils');
  assert.equal(valueOf(questionsOf({ ...PLACED, ask: PUPILS }, 'x')[0]!, '  '), null);
});
