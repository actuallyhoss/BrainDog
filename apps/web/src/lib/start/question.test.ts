/**
 * The one question the first run asks back (use case 6, step 3): exactly one, by rules, or none; and the answer kept on
 * the proposal, written nowhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CurrencyEnv } from '../../routes/start/building.ts';
import { propose } from './propose.ts';
import { answer, oneQuestion, words } from './question.ts';

const CTX = { zone: 'Africa/Cairo', locale: 'en-GB' };
const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";

/** A device in Cairo that knows three currencies. */
const CAIRO: CurrencyEnv = {
  codes: ['EGP', 'GBP', 'USD'],
  nameOf: (c) => ({ EGP: 'Egyptian Pound', GBP: 'British Pound', USD: 'US Dollar' })[c] ?? c,
  englishOf: (c) => ({ EGP: 'Egyptian Pound', GBP: 'British Pound', USD: 'US Dollar' })[c] ?? c,
  regions: ['GB'],
  zone: 'Africa/Cairo',
  zonesOf: (r) => (r === 'EG' ? ['Africa/Cairo'] : r === 'GB' ? ['Europe/London'] : null),
  regionName: (r) => r,
};

test('A SHOP IS ASKED ONE THING: where its orders come in, three answers, each saying what it means', () => {
  const p = propose(MARIAM, CTX);
  const q = oneQuestion(p);
  assert.equal(q?.about, 'arrivesBy');
  assert.equal(q?.question, 'Where do your orders come in?');
  assert.deepEqual(
    q?.choices.map((c) => c.value),
    ['messages', 'app', 'in-person'],
  );
  for (const c of q?.choices ?? []) assert.ok(c.label !== '' && (c.means ?? '') !== '', `${c.value} does not say what it means`);
  assert.equal(q?.only, words.only, 'it says it is the only question');

  /* THE ANSWER IS A VALUE ON THE PROPOSAL, and nothing more is asked. */
  const kept = answer(p, 'arrivesBy', 'messages');
  assert.deepEqual(kept.answers, { arrivesBy: 'messages' });
  assert.equal(oneQuestion(kept), null, 'one question, never two');
  assert.deepEqual({ ...kept, answers: undefined }, { ...p, answers: undefined }, 'nothing else on the proposal moved');
  assert.deepEqual(answer(p, 'arrivesBy', 'carrier pigeon').answers, {}, 'an answer that is not a choice is a skip');
});

test('"I\'m a student" IS ASKED WHAT TO CALL HER, and the answer is her, the first entry in People', () => {
  const p = propose("I'm a student", CTX);
  const q = oneQuestion(p);
  assert.equal(q?.about, 'name');
  assert.equal(q?.question, 'What should I call you?');
  assert.deepEqual(q?.choices, [], 'a name is typed');

  const layla = answer(p, 'name', ' Layla ', "I'm a student");
  assert.equal(layla.name, 'Layla');
  assert.deepEqual(layla.answers, { name: 'Layla' });
  assert.deepEqual(layla.heard[0], { phrase: 'Layla', became: 'you', you: true });
  assert.ok(layla.modules.includes('people'), 'People comes with her');
  assert.equal(layla.places.find((x) => x.id === 'people')?.phrase, 'Layla');
  assert.equal(layla.places[0]?.name, 'Today');
  assert.equal(oneQuestion(layla), null);
  /* SKIPPED: asked once, never again, and nothing is filled. */
  const skipped = answer(p, 'name', null);
  assert.equal(skipped.name, null);
  assert.equal(oneQuestion(skipped), null);
});

test('AN AMOUNT WITH NO CURRENCY ASKS ONLY THE CURRENCY, even of a shop with no name', () => {
  const said = 'I run a candle shop and charge 900 a jar';
  const p = propose(said, CTX);
  assert.ok(p.places.some((x) => x.id === 'orders'), 'a shop, so orders could have been asked');
  assert.equal(p.name, null, 'no name, so a name could have been asked');
  const q = oneQuestion(p, said, CAIRO);
  assert.equal(q?.about, 'currency');
  assert.equal(q?.choices[0]?.value, 'EGP', 'the currency the device keeps comes first');
  assert.equal(q?.suggested, 'EGP');

  const egp = answer(p, 'currency', 'egp');
  assert.equal(egp.currency, 'EGP');
  assert.deepEqual(egp.answers, { currency: 'EGP' });
  assert.equal(oneQuestion(egp, said, CAIRO), null, 'and nothing after it');
  assert.deepEqual(answer(p, 'currency', 'XYZ').answers, {}, 'a currency nobody keeps is a skip');
  /* WITHOUT THE DEVICE'S ANSWERS THE QUESTION IS STILL ASKED, and the screen searches. */
  assert.deepEqual(oneQuestion(p)?.choices, []);
});

test('THE DEVICE\'S CURRENCY IS NOT ASKED AGAIN: a currency is asked only where neither the words nor the device gave one', () => {
  const cairo = { ...CTX, currency: 'EGP' };
  /* A BARE AMOUNT IS STILL ASKED: its currency is one only the person knows, so the device's is suggested, not taken. */
  const said = 'I run a candle shop and charge 900 a jar';
  const p = propose(said, cairo);
  assert.equal(p.currency, null, 'the device does not say the currency of an amount she typed');
  assert.equal(p.currencyBy, undefined);
  assert.ok(!p.heard.some((h) => h.became.includes('in EGP')), 'Money is not said in EGP beside an amount not kept');
  assert.equal(oneQuestion(p, said, CAIRO)?.about, 'currency');
  assert.equal(oneQuestion(p, said, CAIRO)?.suggested, 'EGP');
  assert.equal(answer(p, 'currency', 'USD', said).currency, 'USD', 'what she chooses is the record\'s');
  /* A SHOP WITH NO AMOUNT TAKES THE DEVICE'S, and is asked its one other thing. */
  const shop = propose('I run a candle shop and track who owes me', cairo);
  assert.equal(shop.currency, 'EGP', 'the device keeps Cairo time, so the record keeps EGP');
  assert.equal(shop.currencyBy, 'device');
  assert.equal(oneQuestion(shop, '', CAIRO)?.about, 'arrivesBy');
  assert.equal(answer(shop, 'currency', 'USD'), shop, 'a currency not asked is not answered');
  /* HER SENTENCE: no amount, no currency typed, and EGP from her device, so she is asked only where orders come in. */
  const mariam = propose(MARIAM, cairo);
  assert.equal(mariam.currency, 'EGP');
  assert.equal(oneQuestion(mariam, MARIAM, CAIRO)?.about, 'arrivesBy');
  /* A TYPED CURRENCY OUTRANKS THE DEVICE, and a device with none leaves the question to be asked. */
  const typed = propose('We bill Fenwick £2,000 a month on the 1st', cairo);
  assert.equal(typed.currency, 'GBP');
  assert.equal(typed.currencyBy, undefined);
  assert.equal(oneQuestion(propose(said, { ...CTX, currency: null }), said, CAIRO)?.about, 'currency');
});

test('NOTHING MISSING, NOTHING ASKED', () => {
  assert.equal(oneQuestion(propose('Sami, I run a few companies', CTX)), null);
  assert.equal(oneQuestion(propose('We bill Fenwick £2,000 a month on the 1st', CTX))?.about, 'name', 'a typed currency is not asked');
});

test('TWO ANSWERS ARE NEVER ON A PROPOSAL: only the question asked is answered, and only once', () => {
  const p = propose(MARIAM, CTX);
  assert.equal(answer(p, 'name', 'Mimi'), p, 'a question not asked is not answered');
  assert.equal(answer(p, 'currency', 'EGP'), p);
  const kept = answer(p, 'arrivesBy', 'app');
  assert.equal(answer(kept, 'arrivesBy', 'messages'), kept, 'a second answer changes nothing');
  assert.equal(answer(answer(p, 'arrivesBy', null), 'arrivesBy', 'app').answers?.arrivesBy, undefined, 'a skip is an answer too');

  /* A STUDENT IS ASKED HER NAME, never the currency or where orders come in, and a name typed is never asked. */
  const student = propose("I'm a student", CTX);
  assert.equal(answer(student, 'currency', 'EGP'), student);
  assert.equal(Object.keys(answer(student, 'name', 'Layla').answers ?? {}).length, 1);
});
