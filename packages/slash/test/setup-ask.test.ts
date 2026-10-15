/**
 * The reader asks back (USE-B06 job 1): the one question a reading may carry, held by `setupOf` to what a first run can
 * use. One question and never two (his word of 9 October), about one of five things, one line, short choices, and never
 * about a name or a currency the person already typed.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PEOPLE } from '../../../fixtures/names.ts';
import { setupOf, type SetupAsk } from '../src/propose.ts';

const OFFER: SetupAsk['offer'] = {
  usecases: [{ id: 'business', title: 'Small business', summary: 'Your orders and stock.' }],
  modules: [{ id: 'money-core', name: 'Money', lists: [{ id: 'obligations', name: 'Bills and invoices', fields: ['what', 'amount', 'due'] }] }],
};

const FIRST = PEOPLE[5]!.name.split(' ')[0]!;
const BASE = { name: null, summary: 'Your orders.', usecase: 'business', also: [], modules: [], currency: null, heard: [], names: [], rows: [], draft: null };
const ask = (said: string): SetupAsk => ({ said, offer: OFFER, today: '2026-11-14' });
const read = (q: unknown, said = 'I sell candles at weekend markets') => setupOf({ ...BASE, ask: q }, ask(said), 'm').ask;

const KIND = { about: 'kind', question: 'Is selling candles your living, or a side thing?', choices: ['My living', 'A side thing'] };
const NAME = { about: 'name', question: 'What should I call you?', choices: [] };

test('A QUESTION THAT FITS IS KEPT, choices and all', () => {
  assert.deepEqual(read(KIND), KIND);
  assert.deepEqual(read(NAME), NAME, 'a name is asked of someone who typed none');
  assert.equal(read(null), null);
  assert.equal(setupOf(BASE, ask('I sell candles'), 'm').ask, null, 'a reading that said nothing of a question carries none');
});

test('ONE QUESTION, NEVER TWO: the first that holds is kept and the second dropped', () => {
  assert.deepEqual(read([KIND, NAME]), KIND);
  assert.deepEqual(read([{ ...KIND, about: 'weather' }, NAME]), NAME, 'a first that does not hold leaves room for the next');
});

test('A LONG QUESTION, A LONG CHOICE OR TOO MANY CHOICES DROPS THE QUESTION WHOLE, never cut', () => {
  assert.equal(read({ ...KIND, question: `${'Is it '.repeat(20)}a living?` }), null);
  assert.equal(read({ ...KIND, question: 'Is it\na living?' }), null, 'a question is one line');
  assert.equal(read({ ...KIND, choices: ['It is my whole living and more'] }), null);
  assert.equal(read({ ...KIND, choices: ['a', 'b', 'c', 'd', 'e'] }), null);
  assert.deepEqual(read({ ...KIND, choices: ['a', 'b', 'c', 'd'] })?.choices, ['a', 'b', 'c', 'd'], 'four is the most and is kept');
  assert.equal(read({ ...KIND, question: '' }), null);
});

test('A NAME IS NOT ASKED OF SOMEONE WHO TYPED ONE, nor a currency of someone who typed one', () => {
  const said = `I'm ${FIRST} and I sell candles for $8 each`;
  assert.equal(setupOf({ ...BASE, name: FIRST, ask: NAME }, ask(said), 'm').ask, null);
  const money = { about: 'currency', question: 'Which currency do you sell in?', choices: ['USD', 'EUR'] };
  assert.equal(setupOf({ ...BASE, ask: money }, ask(said), 'm').ask, null, 'a $ typed is a currency typed');
  assert.equal(setupOf({ ...BASE, currency: 'EUR', ask: money }, ask('I sell candles for 8 euros'), 'm').ask, null);
  assert.deepEqual(read(money, 'I sell candles for 8 each'), money, 'an amount with no currency is asked about');
});

test('A QUESTION ABOUT ANYTHING BUT THE FIVE IS DROPPED', () => {
  assert.equal(read({ ...KIND, about: 'weather' }), null);
  assert.equal(read({ ...KIND, about: 7 }), null);
  assert.equal(read({ question: KIND.question, choices: [] }), null);
  assert.equal(read('What should I call you?'), null);
});
