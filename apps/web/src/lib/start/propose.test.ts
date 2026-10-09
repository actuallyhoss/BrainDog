/**
 * The first run reads what the person says with the model first and its own rules after (`proposeFirst`).
 *
 * THE MODEL IS A FAKE that keeps what it was asked and answers what each test hands it. What is under test is what the
 * first run does with an answer: an id this build does not ship is dropped, a phrase or a name the person did not type is
 * dropped, an entry is kept only where every value fits its list, and a host with no model, a spent month or a model
 * that did not answer is the rules' proposal, said so, and never an empty screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AskSetup, SetupAsked, SetupReply } from './ask.ts';
import { draftBrief, fromModel, outsideCatalogue, propose, proposeFirst, setupOffer } from './propose.ts';

const CTX = { zone: 'Europe/London', locale: 'en-GB' };

const reply = (over: Partial<SetupReply>): SetupReply => ({
  name: null,
  summary: '',
  usecase: null,
  also: [],
  modules: [],
  currency: null,
  heard: [],
  names: [],
  rows: [],
  draft: null,
  by: 'glm-5.3-flash',
  ...over,
});

/** A model that answers `answer` and keeps every ask. */
const fake = (answer: SetupReply | Error | { code: string }) => {
  const asked: SetupAsked[] = [];
  const ask: AskSetup = async (a) => {
    asked.push(a);
    if (answer instanceof Error) throw answer;
    if ('code' in answer) return { ok: false, refusal: { code: answer.code, fix: 'no' } };
    return { ok: true, value: answer };
  };
  return { asked, ask };
};

test('THE MODEL IS ASKED FIRST, with the words and the catalogue this build ships', async () => {
  const said = 'Mona here. I run three Etsy shops and owe my supplier GBP 400 by 2026-12-01';
  const model = fake(
    reply({
      name: 'Mona',
      summary: 'Your three Etsy shops and what you owe.',
      usecase: 'founder',
      modules: ['money-core', 'kitchen-sink'],
      currency: 'GBP',
      heard: [
        { phrase: 'owe my supplier', became: 'Money' },
        { phrase: 'three Etsy shops', became: 'Projects, called Shops' },
        { phrase: 'a bakery', became: 'invented' },
      ],
      names: [
        { list: 'things', name: 'shops' },
        { list: 'tasks', name: 'Chores' },
      ],
      rows: [
        { list: 'obligations', fields: { what: 'Supplier', direction: 'owed_by_me', amount: { amount: 40000, currency: 'GBP' }, due: '2026-12-01', state: 'open' } },
        { list: 'obligations', fields: { what: 'Half filled', amount: { amount: 100, currency: 'USD' } } },
      ],
    }),
  );
  const p = await proposeFirst(said, CTX, model.ask);

  assert.equal(model.asked.length, 1);
  assert.equal(model.asked[0]?.said, said);
  assert.deepEqual(model.asked[0]?.offer, setupOffer());
  assert.ok(setupOffer().modules.some((m) => m.lists.some((l) => l.id === 'obligations' && l.fields.includes('amount'))), 'the offer carries each list and its fields');
  assert.deepEqual(setupOffer().modules.find((m) => m.id === 'agents')?.lists, [], "the agents' lists are never filled from a sentence");

  assert.equal(p.by, 'glm-5.3-flash');
  assert.equal(p.name, 'Mona');
  assert.equal(p.usecase, 'founder');
  assert.ok(!p.modules.includes('kitchen-sink'), 'a module this build does not ship is dropped');
  for (const m of ['money-core', 'people', 'portfolio']) assert.ok(p.modules.includes(m), `${m} is missing`);
  assert.equal(p.currency, 'GBP');
  assert.deepEqual(
    p.heard.map((h) => h.phrase),
    ['Mona', 'three Etsy shops', 'owe my supplier'],
    'the name first, then phrases in the order they were typed, and one never typed is gone',
  );
  assert.deepEqual(p.heard[0], { phrase: 'Mona', became: 'you', at: [0, 4], you: true }, 'the name heard becomes them');
  for (const h of p.heard) assert.equal(said.slice(...h.at!), h.phrase, `${h.phrase} is lit where it was typed`);
  assert.deepEqual(p.names, { things: 'Shops' }, 'a list is named in their own word only');
  assert.ok(p.places.some((x) => x.id === 'portfolio' && x.name === 'Shops' && x.phrase === 'three Etsy shops'), 'a place renamed is said in their word');
  assert.equal(p.rows.length, 1, 'an entry in another currency with what it requires missing is not kept');
  assert.deepEqual(p.rows[0]?.fields.amount, { amount: 40000, currency: 'GBP' });
  assert.equal(p.summary, 'Your three Etsy shops and what you owe.');
  assert.equal(outsideCatalogue(p), false);
});

test('THE MODEL READS WHAT THE RULES CANNOT, in any language', async () => {
  const said = 'Je suis étudiante et je veux suivre mes devoirs';
  assert.equal(propose(said, CTX).usecase, null, 'the rules read English alone');
  const p = await proposeFirst(said, CTX, fake(reply({ usecase: 'student', heard: [{ phrase: 'mes devoirs', became: 'Student' }] })).ask);
  assert.equal(p.usecase, 'student');
  assert.deepEqual(p.heard, [{ phrase: 'mes devoirs', became: 'Student', at: [36, 47] }]);
});

test('A CURRENCY IS ONE THAT WAS TYPED, whatever the model guessed', async () => {
  const p = await proposeFirst('I live in London and pay rent', CTX, fake(reply({ currency: 'GBP', modules: ['money-core'] })).ask);
  assert.equal(p.currency, null, 'a place is not a currency');
  const typed = await proposeFirst('I invoice Halden EGP 5,000 a month', CTX, fake(reply({ currency: 'EGP', modules: ['money-core'] })).ask);
  assert.equal(typed.currency, 'EGP');
});

test('A NAME THE PERSON DID NOT TYPE IS NOT THEIRS, and a name keeps People', async () => {
  const p = await proposeFirst('Sami, I freelance', CTX, fake(reply({ name: 'Samuel' })).ask);
  assert.equal(p.name, 'Sami', "the rules' name stands where the model's is not in the words");
  assert.ok(p.modules.includes('people'));
});

test('WHERE NOTHING FITS, THE MODEL WRITES THE BRIEF SLASH DRAFTS FROM', async () => {
  const said = 'I run a pottery studio with two kilns';
  const p = await proposeFirst(said, CTX, fake(reply({ draft: 'Kilns, firings and glazes for a pottery studio.' })).ask);
  assert.equal(outsideCatalogue(p), true);
  assert.equal(draftBrief(p, said), 'Kilns, firings and glazes for a pottery studio.');
  /* AND A USE CASE CHOSEN IS NO DRAFT, whatever else the model wrote. */
  const fits = fromModel(reply({ usecase: 'student', draft: 'something' }), 'I am a student', CTX, propose('I am a student', CTX));
  assert.equal(fits.draft, null);
  assert.equal(outsideCatalogue(fits), false);
});

test('NO MODEL, A SPENT MONTH OR A MODEL THAT DID NOT ANSWER IS THE RULES, said so', async () => {
  const said = 'Sami, I run a few companies and I send invoices';
  const rules = propose(said, CTX);
  assert.deepEqual(await proposeFirst(said, CTX, null), rules);
  assert.equal(rules.by, 'rules');

  const spent = await proposeFirst(said, CTX, fake({ code: 'SLASH_BUDGET_SPENT' }).ask);
  assert.equal(spent.fell, 'SLASH_BUDGET_SPENT');
  assert.equal(spent.usecase, rules.usecase);
  assert.deepEqual(spent.modules, rules.modules);

  const threw = await proposeFirst(said, CTX, fake(new Error('offline')).ask);
  assert.equal(threw.fell, 'UNREACHABLE');
  assert.equal(threw.by, 'rules');
  /* AND THE RULES' DRAFTING STANDS FOR THEM: outside the catalogue is no use case heard. */
  assert.equal(outsideCatalogue(rules), false);
  assert.equal(outsideCatalogue(propose('Je fais de la poterie', CTX)), true);
});

test('A MODEL THAT ANSWERED THINLY NEVER LEAVES LESS ON SCREEN THAN THE RULES', async () => {
  const said = 'We bill Fenwick £2,000 a month on the 1st';
  const rules = propose(said, CTX);
  const p = await proposeFirst(said, CTX, fake(reply({ modules: ['money-core'], heard: [{ phrase: 'not in it', became: 'x' }] })).ask);
  assert.deepEqual(p.heard, rules.heard);
  assert.deepEqual(p.rows, rules.rows);
  assert.equal(p.currency, rules.currency, 'the currency the rules read from a symbol stands');
  assert.ok(p.modules.includes('people'), "the rules' entries bring their lists, so Fenwick has somewhere to go");
});

test('A MODEL THAT CHOSE NOTHING AND DRAFTED NOTHING IS THE RULES, and words they cannot read are still drafted from', async () => {
  const said = 'Je fais de la poterie';
  const p = await proposeFirst(said, CTX, fake(reply({ summary: 'Pottery.' })).ask);
  assert.equal(p.fell, 'PROPOSAL_EMPTY');
  assert.equal(p.by, 'rules');
  assert.equal(outsideCatalogue(p), true, 'the screen is never left with nothing to make');
  assert.equal(draftBrief(p, said), said);
});

/* ── use case 6: the first reading, lit, named and placed ──────────────── */

const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";

test("MARIAM'S SENTENCE: her as you, her words lit where she typed them, the shop's and the business's places, and a title", () => {
  const p = propose(MARIAM, CTX);
  assert.equal(p.name, 'Mariam');
  assert.deepEqual(p.heard[0], { phrase: 'Mariam', became: 'you', at: [4, 10], you: true }, 'her name is the first line, and it becomes her');
  for (const h of p.heard) assert.equal(MARIAM.slice(...h.at!), h.phrase, `${h.phrase} is lit where she typed it`);
  const shop = p.heard.find((h) => h.phrase === 'a small candle shop');
  assert.equal(shop?.became, 'Shop', 'the trade is lit whole, and it is the shop, not Projects');

  assert.equal(p.usecase, 'shop');
  assert.ok(p.also.includes('business'), 'freelancing is a business beside the shop');
  assert.equal(p.title, "Mariam's Candles");

  assert.deepEqual(p.places[0], { kind: 'today', id: 'today', name: 'Today', phrase: null, at: null }, 'Today first');
  const named = p.places.map((x) => x.name);
  for (const place of ['Orders', 'Products', 'People', 'Money']) assert.ok(named.includes(place), `${place} is not among her places`);
  assert.ok(named.indexOf('Orders') < named.indexOf('Money'), "the shop's lists come before the parts");
  assert.equal(p.places.find((x) => x.name === 'Orders')?.phrase, 'a small candle shop');
  assert.equal(p.places.find((x) => x.name === 'People')?.phrase, 'Mariam', 'People is there because she is');
  assert.equal(p.places.find((x) => x.name === 'Money')?.phrase, 'freelance');
  /* NO COUNT AND NO ENTRY SHE DID NOT TYPE: a place is its name and the words that turned it on, and nothing is filled. */
  for (const x of p.places) assert.deepEqual(Object.keys(x).sort(), ['at', 'id', 'kind', 'name', 'phrase']);
  assert.deepEqual(p.rows, []);
});

test('THE TITLE IS THE BUSINESS FIRST, in the words heard, and none where nothing names one', () => {
  const title = (s: string): string | null => propose(s, CTX).title;
  assert.equal(title('Élodie, I run a bakery in Lyon'), "Élodie's Bakery");
  assert.equal(title("Hi, I'm Tom. We run a little coffee shop"), "Tom's Coffee", 'coffee is not counted');
  assert.equal(title("I'm Ana and I have a design business"), "Ana's Design Business");
  assert.equal(title("I'm Ana and I run a business"), null, 'a business alone says nothing of which one');
  assert.equal(title('Sami, I run Kiln Studio and we bill Fenwick'), 'Kiln Studio', 'a project named is the business');
  assert.equal(title('I run a small candle shop'), null, 'a trade with no name is anybody’s, and the sign-up chooses');
  assert.equal(title("I'm a student"), null);
  assert.equal(title("I'm Tom. I have a cat and a store"), null, 'a joining word is never part of a trade');
  assert.equal(title("I'm Tom. I run a design and print shop"), null);
});

test('EVERY PLACE SAYS THE WORDS THAT TURNED IT ON, and a part that only comes with another says none', () => {
  const said = 'I charge 500 a month for coaching';
  const p = propose(said, CTX);
  assert.equal(p.places[0]?.name, 'Today');
  const money = p.places.find((x) => x.id === 'money-core');
  assert.equal(money?.phrase, 'charge');
  assert.deepEqual(money?.at, [2, 8]);
  const projects = p.places.find((x) => x.id === 'portfolio');
  assert.equal(projects?.phrase, null, 'Projects comes because Money stands on it');
  assert.equal(p.places.at(-1)?.id, 'portfolio', 'and it comes last');
  assert.deepEqual(p.heard.find((h) => h.loose)?.at, [9, 12], 'the amount with no currency is lit too');
});

test("A MODEL'S READING IS LIT AND PLACED THE SAME WAY, and an amount the rules heard with no currency is still said", () => {
  const said = 'Mariam here, I make candles and charge 900 a jar';
  const p = fromModel(
    reply({ name: 'Mariam', usecase: 'shop', heard: [{ phrase: 'make candles', became: 'Orders, Products' }, { phrase: 'Mariam', became: 'People' }], names: [{ list: 'people', name: 'Clients' }] }),
    said,
    CTX,
    propose(said, CTX),
  );
  assert.deepEqual(p.heard[0], { phrase: 'Mariam', became: 'you', at: [0, 6], you: true }, 'the name is not one of the model’s phrases, it is them');
  assert.equal(p.heard.filter((h) => h.phrase === 'Mariam').length, 1);
  for (const h of p.heard) assert.equal(said.slice(...h.at!), h.phrase);
  assert.ok(p.heard.some((h) => h.loose && h.phrase === '900'), 'the amount the rules heard is kept for the one question');
  assert.equal(p.places.find((x) => x.id === 'orders')?.phrase, 'make candles');
  assert.equal(p.title, null, 'nothing names a business');
});
