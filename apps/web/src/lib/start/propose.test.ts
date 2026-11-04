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
import { readFileSync } from 'node:fs';

import type { AskSetup, SetupAsked, SetupReply } from './ask.ts';
import { useCase } from '@braindog/seed/usecases';
import { offerOf } from './offer.ts';
import { currencyWord, placeCurrency } from './place-currency.ts';
import { answer, oneQuestion } from './question.ts';

import { becameShown, caseBecame, currencyFor, draftBrief, filledBy, fold, fromModel, heardWords, outsideCatalogue, partName, propose, proposeFirst, railPlaces, setupOffer } from './propose.ts';

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

test('A CURRENCY IS ONE THAT WAS TYPED OR A PLACE NAMED, whatever the model guessed', async () => {
  const p = await proposeFirst('I live in London and pay rent', CTX, fake(reply({ currency: 'GBP', modules: ['money-core'] })).ask);
  assert.equal(p.currency, 'GBP', 'London, a place in the words, beats the device; the model guessing is not why (first F9)');
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
  assert.equal(shop?.became, 'Orders and Products', 'the trade is lit whole, and it is the shop\'s lists, not Projects');

  assert.equal(p.usecase, 'shop');
  assert.ok(p.also.includes('business'), 'freelancing is a business beside the shop');
  assert.equal(p.title, "Mariam's Candles");

  assert.deepEqual(p.places[0], { kind: 'today', id: 'today', name: 'Today', phrase: null, at: null }, 'Today first');
  const named = p.places.map((x) => x.name);
  assert.deepEqual(named, ['Today', 'Orders', 'Products', 'Clients', 'Money'], 'her places, and no Projects she never spoke of');
  assert.equal(p.places.find((x) => x.name === 'Orders')?.phrase, 'a small candle shop');
  assert.equal(p.places.find((x) => x.name === 'Clients')?.phrase, 'Mariam', 'People, called Clients, is there because she is');
  assert.equal(p.places.find((x) => x.name === 'Money')?.phrase, 'who owes me');
  assert.ok(!p.modules.includes('portfolio'), 'Projects does not come with Money: a project is only a link since money-core took it as one (4b137c806)');
  assert.equal(p.currency, null, 'no currency typed and none from the device');
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
  /* A TRADE WITH NO NAME IS THE RECORD'S NAME, in sentence case: it was null, and the record was then
     named for the email's local part, "mariam", although "a small ceramics studio" was heard. */
  assert.equal(title('I run a small candle shop'), 'Candle shop', 'a trade with no name heard is named as it was said');
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
  assert.equal(p.places.find((x) => x.id === 'portfolio'), undefined, 'nobody spoke of a project, so it is not listed');
  assert.ok(!p.modules.includes('portfolio'), 'and it does not come with Money, which only links to a project (4b137c806)');
  /* A PART LEANED ON IS LISTED WHERE A PHRASE OF THEIRS ASKED FOR IT. */
  const asked = propose('I charge 500 a month for coaching and track my projects', CTX);
  assert.ok(asked.places.some((x) => x.id === 'portfolio' && x.phrase !== null), 'a part asked for by name is listed');
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

/* ── step 2 of use case 6: her words, as the mockup says them back ─────── */

const CAIRO = { zone: 'Africa/Cairo', locale: 'en-GB', currency: 'EGP' };

test('WHAT I HEARD, AS THE MOCKUP SAYS IT: Mariam is you, the shop its lists, freelance her Clients and Invoices, Money in EGP', () => {
  const p = propose(MARIAM, CAIRO);
  assert.deepEqual(
    p.heard.map((h) => [h.phrase, h.became]),
    [
      ['Mariam', 'you'],
      ['a small candle shop', 'Orders and Products'],
      ['freelance as a designer', 'Clients and Invoices'],
      ['orders', 'Orders'],
      ['who owes me', 'Money, in Egyptian pounds'],
    ],
  );
  for (const h of p.heard) assert.equal(MARIAM.slice(...h.at!), h.phrase, `${h.phrase} is lit where she typed it`);
  assert.deepEqual(p.names, { people: 'Clients' }, 'a freelancer\'s People are their Clients');
  assert.equal(p.currency, 'EGP', 'her device keeps Cairo time, and Money keeps money');
  assert.equal(p.currencyBy, 'device');
  assert.deepEqual(p.places.map((x) => x.name), ['Today', 'Orders', 'Products', 'Clients', 'Money']);
  assert.equal(p.title, "Mariam's Candles");
});

test('THE DEVICE\'S CURRENCY ONLY WHERE NONE WAS TYPED, and only where a part keeps money', () => {
  assert.equal(propose("I'm a student", CAIRO).currency, null, 'nothing kept here holds an amount');
  assert.equal(currencyFor(null, ['people', 'work'], CAIRO), null);
  assert.equal(currencyFor(null, ['money-core'], CAIRO), 'EGP');
  assert.equal(currencyFor('GBP', ['money-core'], CAIRO), 'GBP', 'what was typed outranks the device');
  assert.equal(currencyFor(null, ['money-core'], { currency: 'XYZ' }), null, 'a currency nobody keeps is none');
  assert.equal(currencyFor(null, ['money-core'], {}), null);
  const typed = propose('I invoice Halden EGP 5,000 a month', { ...CAIRO, currency: 'USD' });
  assert.equal(typed.currency, 'EGP');
  assert.equal(typed.currencyBy, undefined);
  assert.ok(!typed.heard.some((h) => h.became.endsWith(heardWords.inCurrency('USD'))), 'a device currency not taken is not said');
  /* A BARE AMOUNT WAITS FOR THE ONE QUESTION: the device's is never said beside an amount it would not keep. */
  const bare = propose('I run a candle shop and charge 900 a jar', CAIRO);
  assert.equal(bare.currency, null);
  assert.ok(bare.heard.some((h) => h.loose === true) && !bare.heard.some((h) => h.became.endsWith(heardWords.inCurrency('EGP'))));
  assert.equal(currencyFor(null, ['money-core'], CAIRO, true), null);
  assert.equal(currencyFor('GBP', ['money-core'], CAIRO, true), 'GBP');
  /* THE TYPED ONE IS TYPED EVEN WHERE IT IS THE DEVICE'S, and is not said again. */
  const same = propose('I invoice Halden EGP 5,000 a month', CAIRO);
  assert.equal(same.currencyBy, undefined);
  assert.ok(!same.heard.some((h) => h.became.endsWith(heardWords.inCurrency('EGP'))));
  /* A FREELANCER WITH NO MONEY WORD STILL SEES THE CURRENCY TAKEN, on their Invoices. */
  assert.equal(propose('Sami, I freelance', CAIRO).heard.find((h) => h.phrase === 'freelance')?.became, `Clients and Invoices, ${heardWords.inCurrency('EGP')}`);
});

test('A PHRASE IS LIT WHOLE: freelancing as anything, and who still owes them', () => {
  const said = "I'm Jo. I freelance as a graphic designer and illustrator, and lose track of who still owes me.";
  const p = propose(said, CTX);
  const lit = p.heard.map((h) => h.phrase);
  assert.ok(lit.includes('freelance as a graphic designer'), `lit: ${lit.join(' | ')}`);
  assert.ok(lit.includes('who still owes me'), `lit: ${lit.join(' | ')}`);
  assert.equal(p.heard.find((h) => h.phrase.startsWith('freelance'))?.became, 'Clients and Invoices');
  /* "FREELANCE" ALONE IS A FREELANCER TOO, and a joining word never ends the phrase. */
  assert.equal(propose('Sami, I freelance', CTX).heard.find((h) => h.phrase === 'freelance')?.became, 'Clients and Invoices');
  assert.ok(propose('I freelance as a designer and teach', CTX).heard.some((h) => h.phrase === 'freelance as a designer'));
});

test('A USE CASE\'S PHRASE IS SAID AS ITS LISTS: the one it names, else all of them, else its title', () => {
  const shop = useCase('shop');
  const business = useCase('business');
  assert.ok(shop && business);
  assert.equal(caseBecame(shop, 'orders'), 'Orders');
  assert.equal(caseBecame(shop, 'Product'), 'Products');
  assert.equal(caseBecame(shop, 'a small candle shop'), 'Orders and Products');
  assert.equal(caseBecame(business, 'my business'), business.title, 'a use case that brings no list is said by its title');
});

test('A CITY IN THE SENTENCE BEATS THE DEVICE (first F9): a candle shop in Leeds keeps pounds on a laptop in Cairo', () => {
  const leeds = propose("I'm Mariam and I run a small candle shop in Leeds. I want to track orders, stock and who owes me.", CAIRO);
  assert.equal(leeds.currency, 'GBP');
  assert.equal(leeds.currencyBy, undefined, 'a place in the words is not the device guessing');
  assert.ok(leeds.heard.some((h) => h.became.endsWith('in pounds')), 'the line says pounds, not GBP');
  /* A PLACE THAT AGREES WITH THE CLOCK CHANGES NOTHING: still the device's, said by its name. */
  const cairo = propose('I run a small candle shop in Cairo and track who owes me', CAIRO);
  assert.equal(cairo.currency, 'EGP');
  assert.equal(cairo.currencyBy, 'device');
  /* A WORD IS NOT A PLACE: "reading" is never Reading, and lower case names nothing. */
  assert.equal(placeCurrency('I keep reading lists and track who owes me'), null);
  assert.equal(placeCurrency('a studio in new york'), null);
  assert.equal(placeCurrency('a studio in New York'), 'USD');
  assert.equal(placeCurrency('a shop in York'), 'GBP');
  assert.equal(currencyWord('GBP'), 'pounds');
});

test("A MODEL'S READING TAKES THE DEVICE'S CURRENCY THE SAME WAY, and the rules' Clients stand in with their lines", async () => {
  const thin = await proposeFirst(MARIAM, CAIRO, fake(reply({ usecase: 'shop', modules: ['money-core'], heard: [{ phrase: 'not in it', became: 'x' }] })).ask);
  assert.equal(thin.currency, 'EGP');
  assert.equal(thin.currencyBy, 'device');
  assert.equal(thin.heard.filter((h) => h.became.endsWith(heardWords.inCurrency('EGP'))).length, 1, 'said once, not twice');
  assert.deepEqual(thin.names, { people: 'Clients' });
  const own = await proposeFirst(MARIAM, CAIRO, fake(reply({ usecase: 'shop', modules: ['money-core'], heard: [{ phrase: 'who owes me', became: 'Money' }] })).ask);
  assert.equal(own.heard.find((h) => h.phrase === 'who owes me')?.became, 'Money, in Egyptian pounds');
  assert.equal(own.names, undefined, "the model's own lines carry no rename of the rules'");
  /* A CURRENCY SHE TYPED THAT IS ALSO HER DEVICE'S IS STILL HERS, whatever the model read. */
  const typedEgp = 'I run a candle shop and invoice Halden EGP 5,000 a month';
  const mine = await proposeFirst(typedEgp, CAIRO, fake(reply({ usecase: 'shop', modules: ['money-core'], heard: [{ phrase: 'invoice', became: 'Money' }] })).ask);
  assert.equal(mine.currency, 'EGP');
  assert.equal(mine.currencyBy, undefined, 'typed, not taken from the device');
  assert.ok(!mine.heard.some((h) => h.became.endsWith(heardWords.inCurrency('EGP'))), 'a typed currency is not said again');
  const none = await proposeFirst('I keep my reading notes', CAIRO, fake(reply({ modules: ['work'] })).ask);
  assert.equal(none.currency, null, 'nothing the model kept holds money');
});

/* ── what the heard lines say ── */

const linesOf = (p: { heard: { phrase: string; became: string }[] }): string[] => p.heard.map((h) => `${h.phrase} > ${h.became}`);

test('A LINE NEVER SAYS A PACK: a part is said by the name its place has, Projects and never Portfolio', () => {
  assert.equal(partName('portfolio'), 'Projects');
  assert.equal(partName('portfolio', { things: 'Shops' }), 'Shops', "in the person's word where they renamed it");
  assert.equal(partName('people'), 'People');
  assert.equal(partName('money-core'), 'Money', 'a part that keeps several lists keeps its own name');
  for (const sentence of ['I track my projects and my clients', 'I run a studio and send invoices', "I'm a student and I run a small shop"]) {
    const p = propose(sentence, CTX);
    assert.ok(p.heard.length > 0, sentence);
    for (const h of p.heard) assert.doesNotMatch(h.became, /Portfolio/u, `${sentence}: ${h.phrase} became ${h.became}`);
    /* EVERY PLACE A LINE TURNED ON is found by the words the line says. */
    for (const x of p.places.filter((y) => y.kind === 'module' && y.phrase !== null)) assert.ok(p.heard.some((h) => h.phrase === x.phrase), `${x.name} says a phrase that was heard`);
  }
  assert.deepEqual(linesOf(propose('I track my projects', CTX)), ['projects > Projects']);
});

test('A USE CASE TAKEN BESIDE ANOTHER CLAIMS ITS WORDS: a student with a small shop hears Orders and Products, lit', () => {
  const p = propose("I'm a student and I run a small shop", CTX);
  assert.equal(p.usecase, 'student');
  assert.deepEqual(p.also, ['shop']);
  assert.deepEqual(linesOf(p), ['student > Courses', 'a small shop > Orders and Products']);
  for (const name of ['Orders', 'Products']) assert.equal(p.places.find((x) => x.name === name)?.phrase, 'a small shop', `${name} says the words that turned it on`);
  assert.equal(p.places.find((x) => x.id === 'portfolio'), undefined, 'the shop holds the phrase, so it asks for no Projects');
});

test('"NO ORDERS" REFUSES ORDERS: a thing said not to be had is not heard, by a use case or by a module', () => {
  const p = propose("I'm a freelance designer, no orders", CAIRO);
  assert.deepEqual(p.also, [], 'the shop is not taken beside');
  assert.ok(!p.places.some((x) => x.name === 'Orders' || x.name === 'Products'), 'and its lists are not offered');
  assert.ok(!p.heard.some((h) => /orders/iu.test(h.phrase)), 'the word is not lit');
  assert.ok(p.heard.some((h) => h.phrase === 'freelance' && h.became.startsWith('Clients and Invoices')), 'what she does have still is');

  const none = propose("I don't run a small shop, I send invoices", CTX);
  assert.notEqual(none.usecase, 'shop');
  assert.ok(!none.also.includes('shop') && !none.places.some((x) => x.name === 'Orders'), 'a phrase lit whole is refused from where it starts');
  assert.ok(none.modules.includes('money-core'), 'the invoices are kept');

  const bare = propose('I run a shop, no invoices', CTX);
  assert.equal(bare.usecase, 'shop');
  assert.ok(!bare.modules.includes('money-core'), 'a module is refused the same way');

  /* A WORD BETWEEN THAT IS NOT ABOUT SIZE KEEPS THE THING: late orders are still orders. */
  const late = propose('I sell candles, no late orders please', CTX);
  assert.ok(late.heard.some((h) => h.phrase === 'orders' && h.became === 'Orders'));
});

test('A REFUSAL IS CARRIED ACROSS "OR", "AND" AND COMMAS, and past had, longer, got and ever', () => {
  const money = (s: string): boolean => propose(s, CTX).modules.includes('money-core');
  const orders = (s: string): boolean => propose(s, CTX).heard.some((h) => /orders/iu.test(h.phrase));

  /* "OR" ALWAYS CARRIES, "nor" with it, and a small word after the join does not stop it. */
  for (const s of ['I run a shop, no orders or invoices', 'I run a shop, no orders or any invoices', "I'm a student, no shop nor invoices"]) assert.ok(!money(s), s);
  /* "AND" CARRIES TO A THING THERE IS MORE THAN ONE OF. */
  assert.ok(!money("I run a shop, I don't take orders and invoices"));
  /* A RUN OF COMMAS THAT ENDS IN "OR" OR "AND" IS ONE REFUSAL. */
  for (const s of ['I run a shop, no orders, invoices or taxes', 'I run a shop, no orders, invoices, or taxes', 'I run a shop, no orders, invoices and taxes']) assert.ok(!money(s), s);
  const list = propose("I'm a freelance designer, no orders, products or taxes", CAIRO);
  assert.deepEqual(list.also, [], 'the shop is not taken beside');
  assert.ok(!list.heard.some((h) => /orders|products|taxes/iu.test(h.phrase)), 'none of the three is lit');

  /* WHAT IS NOT JOINED STRAIGHT ON IS KEPT: words between, a bare comma, a thing that is done and not had. */
  assert.ok(money("I'm a freelance designer, no orders, I send invoices"), 'words between end the carry');
  assert.ok(propose('I run a shop, no invoices, taxes', CTX).heard.some((h) => h.phrase === 'taxes'), 'a bare comma carries nothing');
  assert.ok(propose("I'm not a shop and freelance as a designer", CTX).heard.some((h) => h.phrase === 'freelance as a designer'), 'the freelancing is kept');
  assert.ok(propose('I have no shop, freelance designer', CTX).heard.some((h) => h.phrase === 'freelance'));
  const late = propose('I sell candles, no late orders or invoices', CTX);
  assert.ok(late.heard.some((h) => h.phrase === 'orders') && late.modules.includes('money-core'), 'orders kept are not a refusal to carry');

  /* THE SMALL WORDS BETWEEN THE REFUSAL AND THE THING: had, longer, got, ever. */
  for (const s of ['I never had orders', 'I no longer take any orders', "I haven't got orders", 'I have not got any orders', "I don't ever take orders"]) {
    const p = propose(`I'm a freelance designer, ${s}`, CAIRO);
    assert.ok(!orders(`I'm a freelance designer, ${s}`) && p.also.length === 0 && !p.places.some((x) => x.name === 'Orders'), s);
  }
});

test('A REFUSAL IS READ THROUGH WANT, NEED, TRACK, SEND, TAKE, KEEP, USE AND CHASE', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));

  /* THE SENTENCES TYPED AS A STRANGER. */
  const tasks = propose('I do not want to track taxes or orders, just my tasks', CAIRO);
  assert.deepEqual(linesOf(tasks), ['tasks > Work']);
  assert.ok(!tasks.modules.includes('money-core') && !tasks.modules.includes('portfolio') && tasks.usecase !== 'shop', 'neither taxes nor orders turned a part on');

  const credit = propose('I run a shop but I never send invoices or take orders on credit', CAIRO);
  assert.deepEqual(linesOf(credit), ['a shop > Orders and Products']);
  assert.ok(!credit.modules.includes('money-core') && credit.also.length === 0, 'no Money, and nothing taken beside the shop');

  const owes = propose('no invoices, I just take orders and track who owes me', CAIRO);
  assert.deepEqual(linesOf(owes), ['orders > Orders', 'who owes me > Money, in Egyptian pounds'], 'what the person does do is kept');

  /* EVERY VERB OF HAVING OR DOING BETWEEN THE REFUSAL AND THE THING, up to five small words. */
  for (const s of [
    "I don't want to keep track of orders",
    'I do not need to take any orders',
    "I don't use orders",
    'I never chase orders',
    "I don't want to send orders",
    'I never want to have to take orders',
  ]) {
    const p = propose(`I'm a freelance designer, ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && p.also.length === 0 && !p.places.some((x) => x.name === 'Orders'), s);
  }

  /* A VERB AFTER "OR" IS CARRIED PAST, a verb after "and" starts what the person does do. */
  assert.ok(!lit(propose("I'm a student, I don't use invoices or chase orders", CAIRO), /invoices|orders/iu));
  assert.ok(lit(propose('I run a shop, no invoices and take orders', CAIRO), /^orders$/iu), '"and take orders" is kept');

  /* A VERB THAT IS NOT ONE OF HAVING OR DOING KEEPS THE THING. */
  for (const s of ["I don't want to lose my orders", "I can't keep up with my orders", 'I never forget orders']) assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
});

test('A REFUSAL IS READ THROUGH THE "-ING" OF A VERB: no more tracking of orders, done taking orders, no more chasing invoices', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const shop = (p: ReturnType<typeof propose>): boolean => p.usecase === 'shop' || p.also.includes('shop') || p.places.some((x) => x.name === 'Orders');

  /* THE SENTENCE TYPED AS A STRANGER. */
  const tasks = propose('No more tracking of orders, just tasks', CAIRO);
  assert.deepEqual(linesOf(tasks), ['tasks > Work']);
  assert.ok(!shop(tasks) && !tasks.modules.includes('money-core'), 'the orders turned no part on');

  /* "DONE" BEFORE A VERB IN "-ING" IS A REFUSAL, and so are finished, stopped and quit. */
  for (const s of ['I am done taking orders', "I'm done with taking orders", 'I stopped taking orders', 'I quit taking any orders', 'I finished selling orders']) {
    const p = propose(`I'm a freelance designer, ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !shop(p), s);
  }
  const alone = propose('I am done taking orders', CAIRO);
  assert.ok(!lit(alone, /orders/iu) && !shop(alone), 'said alone');
  /* THE VERB IN "-ING" CAN BE THE THING HEARD: done selling is no shop. */
  const sold = propose("I'm a freelance designer, I am done selling candles", CAIRO);
  assert.ok(!lit(sold, /selling/iu) && !shop(sold), 'done selling');
  assert.ok(shop(propose('I am selling candles', CAIRO)), 'selling, with no word of having stopped, is a shop');

  const chased = propose("I'm a student, no more chasing invoices", CAIRO);
  assert.ok(!lit(chased, /invoices/iu) && !chased.modules.includes('money-core'), 'no Money from invoices nobody chases');

  /* EVERY VERB IN "-ING" BETWEEN THE REFUSAL AND THE THING, and "need of". */
  for (const s of [
    'no more taking orders',
    'no sending orders',
    'I am not using orders',
    'never keeping track of orders',
    'no more selling orders',
    'no need of orders',
    'I have no need of any orders',
    'not tracking orders',
  ]) {
    const p = propose(`I'm a freelance designer, ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !shop(p), s);
  }

  /* A VERB IN "-ING" AFTER "OR" IS CARRIED PAST, as its plain form is. */
  assert.ok(!lit(propose("I'm a student, no more chasing invoices or taking orders", CAIRO), /invoices|orders/iu));

  /* WHAT THE PERSON DOES DO IS KEPT: no refusal before the verb, or "done" with no verb in "-ing" after it. */
  for (const s of ['I track orders', 'I am tracking orders', 'I love taking orders', 'I have done orders for years', 'I am done for today, I take orders']) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
  assert.ok(lit(propose('no invoices and taking orders', CAIRO), /^orders$/iu), '"and taking orders" is kept');
});

test('A WORD OF HAVING STOPPED REFUSES ONLY A THING THAT ENDS THE CLAUSE, and never one it is itself denied before', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const shop = (p: ReturnType<typeof propose>): boolean => p.usecase === 'shop' || p.also.includes('shop') || p.places.some((x) => x.name === 'Orders');

  /* THE TWO SENTENCES TYPED AS A STRANGER: both keep Orders. */
  for (const s of ['I stopped keeping orders on paper and now track them here', 'I never stopped taking orders', 'I stopped guessing and started tracking orders']) {
    const p = propose(s, CAIRO);
    assert.ok(lit(p, /orders/iu) && shop(p), s);
  }

  /* WORDS AFTER THE THING SAY HOW IT WAS DONE, not that it is gone. */
  for (const s of [
    'I quit tracking orders in a notebook',
    'I am done taking orders by phone, they come in here now',
    'I finished keeping orders in a spreadsheet',
    'I stopped using orders from the old till',
  ]) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }

  /* STOPPING THAT IS DENIED IS NO STOPPING: never, not, haven't, didn't, won't, can't. */
  for (const s of [
    'I have never stopped taking orders',
    "I haven't stopped taking orders",
    'I am not done taking orders',
    "I'm not yet done taking orders",
    'I never really quit taking orders',
    "I won't quit taking orders",
    "I can't quit taking orders",
  ]) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
  assert.ok(shop(propose('I never stopped selling candles', CAIRO)), 'never stopped selling is a shop');
  assert.ok(shop(propose('I stopped selling candles on paper and now sell them here', CAIRO)), 'stopped selling on paper is a shop');

  /* A THING THAT ENDS THE CLAUSE IS STILL REFUSED: the end of what was said, a mark, a join, a word of when. */
  for (const s of [
    'I stopped taking orders',
    'I stopped taking orders, I send invoices',
    'I stopped taking orders.',
    'I stopped taking orders and now I freelance',
    'I stopped taking orders last year',
    'I quit taking orders for good',
    "I'm done taking orders anymore",
    'I stopped taking orders two years ago',
  ]) {
    const p = propose(`I'm a freelance designer, ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !shop(p), s);
  }

  /* THE CARRY HOLDS THE SAME RULE: a thing joined on is refused only where it ends the clause too. */
  assert.ok(!lit(propose("I'm a student, I stopped taking orders or invoices", CAIRO), /invoices|orders/iu), 'both refused');
  assert.ok(lit(propose("I'm a student, I stopped keeping orders or invoices on paper", CAIRO), /invoices/iu), 'the invoices kept on paper are kept');

  /* A RUN JOINED ON ENDS WHERE ITS LAST THING DOES: both were kept on paper, so both are kept. */
  const both = propose('I stopped keeping orders and invoices on paper', CAIRO);
  assert.ok(lit(both, /orders/iu) && lit(both, /invoices/iu), 'orders and invoices on paper are both kept');

  /* ANY MARK ENDS A CLAUSE, and so do the plain words of when. */
  for (const s of [
    'I stopped taking orders - too much work',
    'I stopped taking orders (too many)',
    'I stopped taking orders…',
    'I stopped taking orders yesterday',
    'I stopped taking orders recently',
    'I stopped taking orders for now',
    'I stopped taking orders in 2023',
    'I stopped taking orders back in March',
    'I stopped taking orders a long time ago',
    'I stopped taking orders a few years ago',
    'I stopped taking orders last summer',
    'I stopped taking orders, and invoices too',
    'I quit selling handmade soy candles',
  ]) {
    const p = propose(`I'm a freelance designer, ${s}`, CAIRO);
    assert.ok(!lit(p, /orders|invoices|handmade/iu) && !shop(p), s);
  }

  /* A DENIAL REACHES ITS STOPPING OVER A FEW WORDS, never over a join or somebody new. */
  for (const s of ["I'm not going to quit taking orders", "I don't want to quit taking orders", "I won't ever have to quit taking orders"]) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
  for (const s of ["No, I'm done taking orders", "No I'm done taking orders", 'I have no staff so I stopped taking orders', 'Not a shop, I quit taking orders']) {
    assert.ok(!lit(propose(`I'm a freelance designer. ${s}`, CAIRO), /orders/iu), s);
  }
});

test('WHAT TYPED AS A STRANGER: used to, no longer, my old things, a run decided whole, a denial through a word of thinking', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const shop = (p: ReturnType<typeof propose>): boolean => p.usecase === 'shop' || p.also.includes('shop') || p.places.some((x) => x.name === 'Orders' || x.name === 'Products');

  /* THE FOUR SENTENCES THAT OFFERED WHAT WAS STOPPED, word for word: no Orders, no Products, no shop. */
  for (const s of ['I stopped taking orders and invoices are all I do', 'I stopped selling my old products', 'I used to take orders but I stopped', 'I stopped taking orders from my old shop']) {
    const p = propose(s, CAIRO);
    assert.ok(!lit(p, /orders|products|shop/iu) && !shop(p), s);
  }
  /* AND THE ONE THAT LOST WHAT WAS NEVER STOPPED. */
  const denied = propose('I do not think I have stopped taking orders', CAIRO);
  assert.ok(lit(denied, /orders/iu) && shop(denied), 'a stopping somebody does not think happened is no stopping');

  /* A RUN JOINED BY "AND" IS DECIDED WHOLE: the invoices that open a clause of their own are kept, the orders are not. */
  for (const s of ['I stopped taking orders and invoices are all I do', 'I stopped taking orders and invoices now go by email']) {
    const p = propose(s, CAIRO);
    assert.ok(lit(p, /invoices/iu) && p.modules.includes('money-core'), `${s}: the invoices are kept`);
  }
  assert.ok(!lit(propose('I stopped taking orders and invoices', CAIRO), /orders|invoices/iu), 'a run that ends the clause is stopped whole');
  const paper = propose('I stopped keeping orders and invoices on paper', CAIRO);
  assert.ok(lit(paper, /orders/iu) && lit(paper, /invoices/iu), 'a run kept on paper is kept whole');

  /* "USED TO" AND "NO LONGER" HOLD ONLY AT THE CLAUSE'S END, as stopping does. */
  for (const s of ['I used to sell candles', 'We used to run a small shop', 'I used to have a shop but now I send invoices', 'I never used to take orders', 'I no longer take orders', 'I no longer sell candles', 'We no longer take orders or invoices']) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /orders|shop|sell/iu) && !shop(p), s);
  }
  for (const s of ['I used to take orders on paper, now I want them here', 'I no longer keep orders on paper', 'I can no longer keep orders in a notebook', 'I am used to taking orders', 'I got so used to orders', 'I no longer want to lose my orders']) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }

  /* A THING OF ONE'S OWN FROM BEFORE IS THE THING, and old things are still things where nothing was stopped. */
  for (const s of ['I stopped selling my products', 'I quit selling our former products', 'I stopped selling candles and my old products', 'I stopped taking orders at our former stall']) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /orders|products|stall/iu) && !shop(p), s);
  }
  assert.ok(lit(propose('I want to import my old orders', CAIRO), /orders/iu), 'old orders to bring in are orders');
  /* Where it came from is how it was done unless it is one's own and from before, and a thing heard. */
  for (const s of ['I stopped using orders from the old till', 'I stopped taking orders from my shop', 'I stopped keeping orders in my old notebook']) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }

  /* A DENIAL REACHES PAST SOMEBODY NEW ONLY THROUGH A WORD OF THINKING OR SAYING. */
  for (const s of [
    'I do not think I ever stopped taking orders',
    "I don't think we quit taking orders",
    'I never said I stopped taking orders',
    'It is not true that I have stopped taking orders',
    "I'm not sure I stopped taking orders",
  ]) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
  for (const s of ['I think I stopped taking orders', "I don't think so, I stopped taking orders", 'Not that I mind, I stopped taking orders']) {
    assert.ok(!lit(propose(`I'm a freelance designer. ${s}`, CAIRO), /orders/iu), s);
  }
});

test('WHAT TYPED AS A STRANGER: a "used to" taken up again carries on, and a stopping that says when it happened stops', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const orders = (p: ReturnType<typeof propose>): boolean => p.places.some((x) => x.name === 'Orders');

  /* THE TWO SENTENCES, word for word: the first keeps its orders, the second has none. */
  const carries = propose('I used to take orders and now track them here', CAIRO);
  assert.ok(lit(carries, /orders/iu) && orders(carries), 'orders tracked here now are orders');
  const closed = propose('I stopped taking orders when I closed the shop', CAIRO);
  assert.ok(!lit(closed, /orders/iu) && !orders(closed), 'orders stopped when the shop closed are no orders');
  assert.ok(!lit(closed, /shop/iu) && closed.usecase !== 'shop', 'and a shop that was closed is no shop');
  assert.ok(lit(propose('I closed the shop early on Friday', CAIRO), /shop/iu), 'a shop closed for the day is a shop');

  /* TAKEN UP AGAIN is a word of now and a word that points back, "them" at many and "it" at one. */
  for (const s of [
    'I used to take orders but now I track them here',
    'I used to take orders, and I now keep them in a notebook',
    'We used to take orders last year and these days we track them online',
    'I used to take orders and invoices and now track them here',
    'I used to keep orders; now I want those here',
  ]) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
  const both = propose('I used to take orders and invoices and now track them here', CAIRO);
  assert.ok(lit(both, /invoices/iu), 'a run taken up again is kept whole');
  assert.ok(lit(propose('I used to run a small shop and now run it online', CAIRO), /shop/iu), 'a shop run online now is a shop');
  /* "NO LONGER" IS TAKEN UP AGAIN AS "USED TO" IS, and with nothing pointing back it has stopped. */
  for (const s of ['I no longer take orders and now track them here', 'We no longer take orders but now we track them here']) {
    const p = propose(s, CAIRO);
    assert.ok(lit(p, /orders/iu) && orders(p), s);
  }
  for (const s of ['I no longer take orders', 'I no longer take orders and now send invoices', 'I no longer take orders and now I do not take them']) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !orders(p), s);
  }
  /* NOTHING POINTS BACK, or what does is refused or stopped again: the thing is still stopped. */
  for (const s of [
    'I used to take orders and now send invoices',
    'I used to take orders and now I freelance',
    'I used to take orders and now I do not take them',
    'I used to take orders and now I have stopped taking them',
    'I used to take orders and now it is all invoices',
    'I used to take orders and track them here',
  ]) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !orders(p), s);
  }
  assert.ok(!lit(propose("I'm a freelance designer. I used to sell candles and now I teach", CAIRO), /sell/iu), 'selling that nothing points back at has stopped');
  assert.ok(lit(propose('I used to sell candles and now sell them online', CAIRO), /sell/iu), 'candles sold online now are sold');

  /* WHEN IT STOPPED is somebody and a verb of the past after "when", "after" or "once". */
  for (const s of [
    'I stopped taking orders after we moved',
    'I quit taking orders once the lease ran out',
    'I stopped taking orders last year when my partner left',
    'I used to take orders when I had the van',
    'I no longer take orders after I sold the van',
  ]) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !orders(p), s);
  }
  /* What goes on is how it is done, and keeps the thing. */
  for (const s of ['I stopped taking orders after hours', 'I stopped taking orders when I am busy', 'I stopped taking orders once a week']) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
});

test('A THING STOPPED AND TAKEN UP AGAIN CARRIES ON, whichever word stopped it: "stopped", "no longer", "used to", with "now", "still" or "instead"', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const orders = (p: ReturnType<typeof propose>): boolean => p.places.some((x) => x.name === 'Orders');

  /* THE THREE SENTENCES, word for word: each keeps its orders. */
  for (const s of ['I no longer take orders and now track them here', 'I stopped taking orders and now track them here', 'I used to take orders and still track them']) {
    const p = propose(s, CAIRO);
    assert.ok(lit(p, /orders/iu) && orders(p), s);
  }
  /* AND THE THREE THAT STAY STOPPED: nothing points back, or the clause says when it ended. */
  for (const s of ['I stopped taking orders as the shop closed', 'I stopped taking orders when I closed the shop']) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !orders(p), s);
  }
  /* The cakes point back at nothing, so the selling of before has stopped: what is heard is the bread sold now. */
  const bread = 'I used to sell cakes and now sell bread';
  assert.deepEqual(propose(bread, CAIRO).heard.filter((h) => h.phrase === 'sell').map((h) => h.at?.[0]), [bread.lastIndexOf('sell')], bread);
  assert.ok(!lit(propose("I'm a freelance designer. I used to sell cakes and now bake bread", CAIRO), /sell/iu), 'cakes sold before and bread baked now is no selling');

  /* "STILL" AND "INSTEAD" ARE WORDS OF NOW, after any of the three ways of stopping. */
  for (const s of [
    'I stopped taking orders but I still track them',
    'I quit taking orders by phone, and instead take them here',
    'I am done taking orders and invoices and now track them here',
    'I no longer take orders and still keep them in a notebook',
    'I no longer take orders but instead track them here',
    'I used to take orders and instead track them here',
    'We used to take orders, and we still take them',
  ]) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
  assert.ok(lit(propose('I am done taking orders and invoices and now track them here', CAIRO), /invoices/iu), 'a stopped run taken up again is kept whole');
  assert.ok(lit(propose('I stopped selling candles and now sell them online', CAIRO), /sell/iu), 'candles sold online now are sold');
  assert.ok(lit(propose('I stopped running my shop and now run it online', CAIRO), /shop/iu), 'a shop run online now is a shop');

  /* NOTHING POINTS BACK, no word of now, or what points back is refused or stopped again: still stopped. */
  for (const s of [
    'I stopped taking orders and now send invoices',
    'I stopped taking orders and track them here',
    'I stopped taking orders and now I do not take them',
    'I stopped taking orders and still do not want them',
    'I stopped taking orders and instead I quit taking them',
    'I used to take orders and still freelance',
    'I no longer take orders and instead send invoices',
    'I stopped taking orders as my shop shut',
    'I quit taking orders as we moved',
  ]) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /orders/iu) && !orders(p), s);
  }
  /* THE THING THAT ENDED IS GONE WITH IT, said as what closed and not as what somebody closed. */
  for (const s of ['I stopped taking orders as the shop closed', 'I stopped taking orders once the stall shut', 'I quit taking orders after my old shop was sold']) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /shop|stall/iu) && p.usecase !== 'shop', s);
  }
  for (const s of ['My shop closed early on Friday', 'I take orders when the shop is shut', 'I pack orders after the shop closed on Friday', 'The shop closed']) {
    assert.ok(lit(propose(s, CAIRO), /shop/iu), s);
  }
  /* "AS" BEFORE HOW IT IS DONE keeps the thing, as "after hours" does. */
  for (const s of ['I stopped taking orders as a favour', 'I stopped taking orders as often']) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }
});

test('A THING ONLY FELT ABOUT IS NOT TAKEN UP AGAIN, and a stall sold or had before is no shop: "still miss them", "now I hate them", "when I had the stall"', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const orders = (p: ReturnType<typeof propose>): boolean => p.places.some((x) => x.name === 'Orders');
  const none = (s: string, word: RegExp): void => {
    for (const typed of [s, `I'm a freelance designer. ${s}`]) {
      const p = propose(typed, CAIRO);
      assert.ok(!lit(p, word) && !orders(p) && p.usecase !== 'shop', typed);
    }
  };

  /* THE THREE SENTENCES, word for word: none keeps Orders, and the stall is not heard as a shop. */
  none('I stopped taking orders and still miss them', /orders/iu);
  none('I sold the stall and now I hate them', /stall/iu);
  none('I used to take orders when I had the stall', /orders|stall/iu);

  /* A WORD OF FEELING OR REMEMBERING BEFORE THE WORD THAT POINTS BACK takes nothing up, whichever word stopped it. */
  for (const s of [
    'I stopped taking orders and now I hate them',
    'I used to take orders and now I really miss them',
    'I no longer take orders but still regret them',
    'I quit taking orders and still think about them',
    'I am done taking orders and invoices and still dread them',
    'I used to take orders and these days I barely remember them',
  ]) {
    none(s, /orders/iu);
  }
  none('I used to run a small shop and still miss it', /shop/iu);
  assert.ok(!lit(propose("I'm a freelance designer. I stopped selling candles and still miss it", CAIRO), /sell/iu), 'selling that is only missed has stopped');
  /* What is done with it now still takes it up, as before. */
  for (const s of ['I stopped taking orders and still take them for friends', 'I used to take orders and now track them here', 'I used to keep orders; now I want those here']) {
    assert.ok(lit(propose(s, CAIRO), /orders/iu), s);
  }

  /* A THING SOMEBODY SOLD IS GONE, said plainly and with no "when" before it. */
  for (const s of ['I sold the stall', 'I sold my shop last year', 'We sold the stall to a friend', 'I have sold our old shop', 'I sold off the stall and now I teach']) {
    none(s, /shop|stall/iu);
  }
  for (const s of ['I never sold the stall', "I haven't sold the shop", 'I sold candles at my stall', 'If I sold the stall I would be lost', 'I wish I had sold the stall', 'I sold the stall holders their signs']) {
    assert.ok(lit(propose(s, CAIRO), /shop|stall/iu), s);
  }

  /* A THING SOMEBODY HAD, OWNED OR RAN, after "when", was theirs before and is not now. */
  for (const s of ['I sent invoices back when I had the stall', 'I stopped taking orders. That was when we ran a small shop', 'When I owned the shop, I never slept']) {
    const p = propose(`I'm a freelance designer. ${s}`, CAIRO);
    assert.ok(!lit(p, /shop|stall/iu) && p.usecase !== 'shop', s);
  }
  const took = propose('I took orders when I had the stall', CAIRO);
  assert.ok(lit(took, /orders/iu) && !lit(took, /stall/iu), 'the orders were said plainly, and only the stall is from before');
  for (const s of ['When I had the stall for a year I hired help', 'I take orders when I have the stall open', 'I had the stall repainted', 'Once I had the stall, orders poured in']) {
    assert.ok(lit(propose(s, CAIRO), /stall/iu), s);
  }
});

test('A THING NEVER DONE OR ONLY WISHED FOR IS NOT HEARD: "I never ran a shop", "I wish I had a shop", "I used to love taking orders", "now I love them"', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const orders = (p: ReturnType<typeof propose>): boolean => p.places.some((x) => x.name === 'Orders');
  const none = (s: string, word: RegExp): void => {
    for (const typed of [s, `I'm a freelance designer. ${s}`]) {
      const p = propose(typed, CAIRO);
      assert.ok(!lit(p, word) && !orders(p) && p.usecase !== 'shop', typed);
    }
  };
  const kept = (s: string, word: RegExp): void => assert.ok(lit(propose(s, CAIRO), word), s);

  /* THE FOUR SENTENCES, word for word. */
  none('I never ran a shop', /shop/iu);
  none('I wish I had a shop', /shop/iu);
  none('I used to love taking orders', /orders/iu);
  none('I stopped taking orders and now I love them', /orders/iu);

  /* "NEVER" AND ITS LIKE ARE READ THROUGH A VERB OF THE PAST, as they are through one of now. */
  for (const s of ['I never ran a small shop', "I've never owned a shop", 'I never took orders', 'We never opened a shop', 'I have not started a shop', "I haven't taken any orders", 'I never kept orders or invoices', 'I never wanted a shop']) {
    none(s, /shop|orders|invoices/iu);
  }
  /* A verb that is not one of having or doing still keeps the thing, and so does a denial of having lost it. */
  for (const s of ['I never closed my shop', 'I never sold the stall', 'I never thought I would run a shop but I do', 'No, I ran a shop for years', 'I never lost an order, I take orders daily']) {
    kept(s, /shop|stall|orders/iu);
  }

  /* A WISH OR A HOPE BEFORE THE THING IS NOT THE THING. */
  for (const s of [
    'I wish I ran a shop',
    'I wish I could run a shop',
    'I wish that we had a small shop',
    'If only I had a shop',
    'I hope to open a shop one day',
    'I am hoping to start a shop',
    'I hope one day to have my own shop',
    'I dream of opening a shop',
    'I always wanted a shop',
    'I wish I took orders',
    'I hope to take orders someday',
    'I wish I had a shop or orders',
  ]) {
    none(s, /shop|orders/iu);
  }
  /* What is wished ABOUT a thing somebody has is still theirs, and so is what they hope to do with it here. */
  for (const s of [
    'I wish my shop had more orders',
    'I hope to grow my shop',
    'I hope to get more orders',
    'I wish I had sold the stall',
    'I wish I had more time, I run a shop',
    'I hope to keep track of my orders here',
    'I hope to track orders and invoices',
    'I hope to take orders here',
    'I wish I had opened a shop sooner',
    'I run a shop and hope it grows',
    'I always wanted to run a shop and now I have one',
    'I hoped to open a shop and finally did',
    'I hope to start a small shop with this',
  ]) {
    kept(s, /shop|stall|orders/iu);
  }

  /* "USED TO" IS READ THROUGH A WORD OF LIKING, and what was liked then has stopped as what was done then has. */
  for (const s of ['I used to enjoy taking orders', 'I used to hate chasing invoices', 'I used to really love running a small shop', 'We used to like taking orders but stopped']) {
    none(s, /shop|orders|invoices/iu);
  }
  kept('I used to love taking orders and now track them here', /orders/iu);
  kept('I love taking orders', /orders/iu);
  kept('I used to like my shop', /shop/iu);
  kept('I used to love taking orders on paper', /orders/iu);

  /* A WORD OF LIKING STRAIGHT BEFORE THE WORD THAT POINTS BACK takes nothing up; one before what is done with it does. */
  for (const s of ['I used to take orders and now I really like them', 'I no longer take orders but still love them', 'I quit taking orders and now we enjoy them']) {
    none(s, /orders/iu);
  }
  for (const s of ['I stopped taking orders and now I love tracking them', 'I stopped taking orders and now I would like to track them here', 'I used to take orders and now I enjoy keeping them here']) {
    kept(s, /orders/iu);
  }
});

test('A WISH HOLDS TO THE END OF ITS CLAUSE, AND "STILL DO" POINTS BACK: "We hope to have invoices sorted", "I used to love taking orders and still do"', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const kept = (s: string, word: RegExp): void => assert.ok(lit(propose(s, CAIRO), word), s);
  const none = (s: string, word: RegExp): void => assert.ok(!lit(propose(s, CAIRO), word), s);

  /* WHAT BATCH 71 LEFT, word for word. Whoever hopes to have their invoices sorted has invoices. */
  kept('We hope to have invoices sorted', /invoices/iu);
  kept('I used to love taking orders and still do', /orders/iu);
  none('I was never a designer', /designer|freelance/iu);
  assert.notEqual(propose('I was never a freelance designer', CAIRO).usecase, 'freelancer');
  kept('I hope to track orders', /orders/iu);
  kept('I wish my shop had more orders', /shop/iu);

  /* A WISH REFUSES ONLY A THING THAT ENDS THE CLAUSE: words after it say how the thing they have is hoped to be. */
  for (const s of ['I hope to have invoices paid on time', 'We wish we had orders under control', 'I hope to get orders out faster', 'We hope to have invoices and orders sorted', 'I hope to get orders in on time']) {
    kept(s, /invoices|orders/iu);
  }
  /* A word of when ends it still, and so does where a thing not yet had is hoped to be, after a verb of starting. */
  for (const s of [
    'I wish I had a shop',
    'I hope to have a shop soon',
    'I hope to take orders someday',
    'I hope to have a shop one day, I freelance for now',
    'I wish I had a shop or orders',
    'I hope to open a shop in Cairo',
    'I dream of opening a shop by the sea',
    'I hope to have a shop next year',
    'I wish I had a shop in Cairo',
    'I wish we had a small shop near the station',
  ]) {
    none(s, /shop|orders/iu);
  }

  /* "STILL DO" AFTER THE CLAUSE POINTS BACK AT WHAT WAS DONE, so it goes on. */
  for (const s of ['I used to take orders and still do', 'I used to take orders, and I still do', 'We used to take orders and invoices and we still do', 'I used to enjoy taking orders. I still do.', 'I used to run a shop and I still do today']) {
    kept(s, /shop|orders/iu);
  }
  /* Denied, or said of something else, it points back at nothing. */
  for (const s of ['I used to take orders and still do not', "I used to take orders and still don't", 'I used to take orders. I still do my own taxes', 'I used to take orders and my sister still does', 'I used to take orders but I stopped']) {
    none(s, /orders/iu);
  }
});

test("A SENTENCE THAT OPENS WITH A REFUSAL NAMES NOBODY: Don't need orders, I freelance as a designer", () => {
  const typed = "Don't need orders, I freelance as a designer";
  const p = propose(typed, CAIRO);
  assert.equal(p.name, null, 'nobody is called "Don\'t need orders"');
  assert.deepEqual(linesOf(p), ['freelance as a designer > Clients and Invoices, in Egyptian pounds']);
  assert.ok(p.also.length === 0 && !p.places.some((x) => x.name === 'Orders'), 'the orders are refused');
  /* THE WORDS ARE LIT WHERE THEY WERE TYPED, after a greeting and a run of spaces too. */
  for (const s of [typed, "Hi, don't need   orders, I freelance as a designer", 'Never had invoices; I run a small candle shop']) {
    const q = propose(s, CAIRO);
    assert.equal(q.name, null, s);
    for (const h of q.heard) assert.equal(h.at && s.slice(h.at[0], h.at[1]), h.phrase, s);
    assert.ok(!q.heard.some((h) => /orders|invoices/iu.test(h.phrase)), s);
  }
  /* A NAME BEFORE A COMMA IS STILL A NAME. */
  assert.equal(propose('Tom, I run a shop', CAIRO).name, 'Tom');
});

test('A REFUSED PHRASE IS NEVER OFFERED AS HEARD, by the rules or by the model', () => {
  const typed = "I'm Mariam. I freelance as a designer and I don't want to keep track of orders or products";
  const rules = propose(typed, CAIRO);
  assert.ok(!rules.heard.some((h) => /orders|products/iu.test(h.phrase)));

  /* THE MODEL HEARD THE WORD AND NOT THE "DON'T": its line is dropped, and the lines it got right stand. */
  const p = fromModel(
    reply({
      usecase: 'business',
      heard: [
        { phrase: 'freelance as a designer', became: 'Clients and Invoices' },
        { phrase: 'orders', became: 'Orders' },
        { phrase: 'products', became: 'Products' },
      ],
    }),
    typed,
    CAIRO,
    rules,
  );
  assert.ok(p.heard.some((h) => h.phrase === 'freelance as a designer'));
  assert.ok(!p.heard.some((h) => /orders|products/iu.test(h.phrase)), 'neither refused phrase is a line');

  /* WHERE EVERY LINE OF THE MODEL'S WAS REFUSED, the rules' lines are said, and they hold no refused phrase either. */
  const only = fromModel(reply({ usecase: 'business', heard: [{ phrase: 'orders', became: 'Orders' }] }), typed, CAIRO, rules);
  assert.ok(only.heard.length > 1 && !only.heard.some((h) => /orders|products/iu.test(h.phrase)));

  /* A NAME THE MODEL TOOK FROM A REFUSAL IS NOT A NAME. */
  const opened = "Don't need orders, I freelance as a designer";
  assert.equal(fromModel(reply({ usecase: 'business', name: "Don't need orders" }), opened, CAIRO, propose(opened, CAIRO)).name, null);
});

test('ONE LINE FOR ONE THING: a second phrase that became the same is folded into the first', () => {
  const p = propose("I'm Mariam. I run a small candle shop and freelance as a designer. I want to track orders, who owes me, and taxes.", CAIRO);
  assert.deepEqual(linesOf(p), [
    'Mariam > you',
    'a small candle shop > Orders and Products',
    'freelance as a designer > Clients and Invoices',
    'orders > Orders',
    'who owes me, and taxes > Money, in Egyptian pounds',
  ]);
  assert.equal(p.heard.filter((h) => h.became.startsWith('Money')).length, 1, 'Money is said once');
  const money = p.heard.at(-1);
  assert.ok(money?.at);
  assert.equal(p.places.find((x) => x.id === 'money-core')?.phrase, 'who owes me, and taxes');

  /* SAID APART, the first line keeps its words and remembers where the other sits. */
  const sentence = 'I pay taxes, I walk the dog, I send invoices';
  const apart = fold(
    [
      { phrase: 'taxes', became: 'Money', at: [6, 11] },
      { phrase: 'dog', became: 'Projects', at: [24, 27] },
      { phrase: 'invoices', became: 'Money', at: [36, 44] },
    ],
    sentence,
  );
  assert.deepEqual(apart, [
    { phrase: 'taxes', became: 'Money', at: [6, 11], more: [[36, 44]] },
    { phrase: 'dog', became: 'Projects', at: [24, 27] },
  ]);
  /* THE NAME AND AN AMOUNT WITH NO CURRENCY ARE THEIR OWN LINES, however often they are said. */
  const loose = fold([{ phrase: '900', became: 'x', at: [0, 3], loose: true }, { phrase: '400', became: 'x', at: [8, 11], loose: true }], '900 and 400');
  assert.equal(loose.length, 2);
});

test('A NEVER THAT THE CLAUSE TAKES BACK REFUSES NOTHING: "I never ran a shop before but I just opened one", "My wife never ran the shop, I do", "I never kept track of orders, I want to start"', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const has = (p: ReturnType<typeof propose>, name: string): boolean => p.places.some((x) => x.name === name);
  const both = (s: string): string[] => [s, `I'm a freelance designer. ${s}`];

  /* THE FIVE SENTENCES, word for word. */
  for (const typed of both('I never ran a shop before but I just opened one')) assert.ok(lit(propose(typed, CAIRO), /shop/iu), typed);
  for (const typed of both('My wife never ran the shop, I do')) assert.ok(lit(propose(typed, CAIRO), /shop/iu), typed);
  for (const typed of both('I never kept track of orders, I want to start')) {
    const p = propose(typed, CAIRO);
    assert.ok(lit(p, /orders/iu) && has(p, 'Orders'), typed);
  }
  for (const typed of both('I never ran out of products')) assert.ok(!has(propose(typed, CAIRO), 'Products'), typed);
  /* A hope of keeping a thing better is no wish to have one (`WISHED` reads verbs of having, never of keeping). */
  for (const typed of both('I hope to track invoices better')) assert.ok(lit(propose(typed, CAIRO), /invoices/iu), typed);

  /* WHAT TAKES IT BACK: a join and a word of now or of doing it, or somebody who does. */
  for (const s of [
    'I never ran a shop but I just opened one',
    'I never ran a shop before, but now I have one',
    'I never owned a shop and I finally opened one',
    'We never ran a shop until now, but we just started one',
    'I never ran a shop but I do now',
    'My partner never ran the shop. I do.',
    'I never took orders before but now I do',
    'I never took orders and I want to start',
    'I never kept orders, but I want to start now',
    'I never tracked orders, I would like to start',
    "I haven't taken orders before but I want to start",
  ]) {
    assert.ok(lit(propose(s, CAIRO), /shop|orders/iu), s);
  }
  /* AND WHAT DOES NOT: a join that says something else, a refusal after it, or a wish with nothing started. */
  for (const s of [
    'I never ran a shop',
    'I never ran a shop before',
    'I never ran a shop and I just design logos',
    'I never ran a shop but I do design work',
    'I never ran a shop, I do not want one',
    "I never ran a shop and I don't now",
    'I never took orders and never will',
    'I never took orders, I just design',
    'My wife never ran a shop, I do the design',
  ]) {
    const p = propose(s, CAIRO);
    assert.ok(!lit(p, /shop|orders/iu) && !has(p, 'Orders') && p.usecase !== 'shop', s);
  }

  /* WANTING TO START TAKES BACK ONLY WHAT THERE IS MORE THAN ONE OF: orders are started in here, a shop is not. */
  for (const s of ['I never ran a shop but I want to start', 'I never ran a shop, they run one', 'I never ran a shop; my brother just opened one', 'I never took orders, I want to start a blog']) {
    const p = propose(s, CAIRO);
    assert.ok(!lit(p, /shop|orders/iu) && p.usecase !== 'shop', s);
  }
  /* THE WHOLE RUN IS TAKEN BACK, and a plain refusal or a wish yields as a never does. */
  const run = propose('I never kept orders or invoices but I want to start', CAIRO);
  assert.ok(lit(run, /orders/iu) && lit(run, /invoices/iu), 'both of the run are heard');
  for (const s of ['I do not take orders yet but I want to start', 'No orders but now I have them', 'I never took orders. I do now.', 'I never took orders so I want to begin tracking them', 'I always wanted a shop and I finally opened one']) {
    assert.ok(lit(propose(s, CAIRO), /shop|orders/iu), s);
  }
  /* WHAT NEVER RAN OUT WAS NEVER SAID TO BE KEPT, and what is said to be kept before it still is. */
  assert.ok(!has(propose('We never run out of products', CAIRO), 'Products'), 'We never run out of products');
  assert.ok(has(propose('I sell products and never ran out of them', CAIRO), 'Products'), 'I sell products and never ran out of them');
});

test('A NEVER IS TAKEN BACK BY A FIRST ONE BEING OPENED: "I never ran a shop but I am opening one next month", "I never ran a shop before. This is my first one."', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const has = (p: ReturnType<typeof propose>, name: string): boolean => p.places.some((x) => x.name === name);
  const both = (s: string): string[] => [s, `I'm a freelance designer. ${s}`];

  /* THE TWO SENTENCES LEFT OPEN BY BATCH 75, word for word, bare and after another sentence. */
  for (const typed of both('I never ran a shop but I am opening one next month')) assert.ok(lit(propose(typed, CAIRO), /shop/iu), typed);
  for (const typed of both('I never ran a shop before. This is my first one.')) assert.ok(lit(propose(typed, CAIRO), /shop/iu), typed);

  /* WHOEVER SPEAKS IS OPENING ONE: said of now, with the word that points back. */
  for (const s of [
    'I never ran a shop but I am opening one',
    "I never ran a shop before, but I'm opening one",
    'We never owned a shop and we are finally opening one in May',
    'I never ran a shop but I am about to open one',
    'I never ran a shop before; I am just starting one',
    "I never ran a shop. I'm setting one up",
    'I never ran a shop but I am setting up one now',
    'We never had a shop until now, but we are launching one',
    'I never took orders before but I am starting to take them',
    'I always wanted a shop and I am finally opening one',
  ]) {
    assert.ok(lit(propose(s, CAIRO), /shop|orders/iu), s);
  }
  /* A FIRST ONE IS ONE: "this is my first", after the clause and as a sentence of its own. */
  for (const s of [
    'I never ran a shop before, this is my first one',
    'I never ran a shop. This is my first.',
    "We never ran a shop before. It's our first one.",
    'I never ran a shop before and this is my very first one',
    'I never owned a shop, this will be my first one',
    'I never took orders before. These are my first ones.',
  ]) {
    assert.ok(lit(propose(s, CAIRO), /shop|orders/iu), s);
  }
  /* AND WHAT TAKES NOTHING BACK: a refusal, somebody else, a thought of opening, another first thing. */
  for (const s of [
    'I never ran a shop and I am not opening one',
    "I never ran a shop, I'm not opening one",
    'I never ran a shop but my brother is opening one',
    'I never ran a shop but they are opening one',
    'I never ran a shop but I am thinking of opening one',
    'I never ran a shop but I am opening a studio',
    'I never ran a shop but I am opening up about it',
    'I never ran a shop. This is not my first one.',
    'I never ran a shop. This is her first one.',
    'I never ran a shop before. This is my first time here.',
    'I never ran a shop, this is my first job',
  ]) {
    const p = propose(s, CAIRO);
    assert.ok(!lit(p, /shop/iu) && p.usecase !== 'shop', s);
  }
  /* WHAT BATCH 75 RULED STANDS: a shop only wanted is not had, and what never ran out is not said to be kept. */
  for (const s of ['I never ran a shop but I want to start', 'I never ran a shop', 'I hope to open a shop one day']) {
    const p = propose(s, CAIRO);
    assert.ok(!lit(p, /shop/iu) && p.usecase !== 'shop', s);
  }
  for (const typed of both('I never ran out of products')) assert.ok(!has(propose(typed, CAIRO), 'Products'), typed);
  assert.ok(!has(propose('We never run out of products', CAIRO), 'Products'), 'We never run out of products');
  assert.ok(has(propose('I sell products and never ran out of them', CAIRO), 'Products'), 'I sell products and never ran out of them');
});

test('WHAT WAS LEFT OPEN SINCE BATCH 69, each sentence word for word: "I never used invoices", "I would love to have a shop", "My partner sold the stall", "I had a shop", "my friend and I are opening one"', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const both = (s: string): string[] => [s, `I'm a freelance designer. ${s}`];
  const none = (s: string, word: RegExp): void => {
    for (const typed of both(s)) assert.ok(!lit(propose(typed, CAIRO), word), typed);
  };
  const kept = (s: string, word: RegExp): void => {
    for (const typed of both(s)) assert.ok(lit(propose(typed, CAIRO), word), typed);
  };

  /* MORE OF A THING IS A THING HAD: the wish is for more of them, and whoever wishes it has some. */
  kept('I wish I had more clients', /clients/iu);
  kept('I wish I had more orders', /orders/iu);
  kept('I hope to get more clients', /clients/iu);
  none('I wish I had clients', /clients/iu);

  /* A NEW SHOP HOPED FOR IS NOT HAD, and another one is: "new" says nothing of a first, "another" and "second" do. */
  none('I hope to open a new shop', /shop/iu);
  none('I hope to open a new shop next year', /shop/iu);
  kept('I hope to open another shop', /shop/iu);
  kept('I hope to open a second shop', /shop/iu);
  kept('I hope to open one more shop', /shop/iu);
  kept('I run a shop and hope to open a new shop', /shop/iu);

  /* A THING NEVER USED OR SENT IS NOT KEPT, and "used to" is still what was done before. */
  none('I never used invoices', /invoices/iu);
  none('We have never used invoices', /invoices/iu);
  none('I never sent invoices', /invoices/iu);
  none("I haven't used invoices", /invoices/iu);
  kept('I never used paper, I send invoices', /invoices/iu);
  kept('I am used to taking orders', /orders/iu);
  kept('I never used to chase people, now I send invoices', /invoices/iu);

  /* "DIDN'T" REFUSES AS "DID NOT" DOES: whoever says "I didn't run a shop" was handed a shop. */
  none("I didn't send invoices", /invoices/iu);
  none('I didn’t take orders', /orders/iu);
  none("I didn't run a shop", /shop/iu);
  none('I didnt run a shop', /shop/iu);
  none('I did not send invoices', /invoices/iu);
  kept("I didn't run a shop before but I just opened one", /shop/iu);
  kept("I didn't like spreadsheets, I send invoices", /invoices/iu);
  kept("I didn't quit my shop", /shop/iu);
  kept("I didn't stop taking orders", /orders/iu);

  /* ONE HAD FOR YEARS AND RUN NOW IS HAD, as one had and run is with no how long said. */
  kept('I had the shop for years and I run it', /shop/iu);
  kept('I had the shop for years and I have it', /shop/iu);
  kept('I had the shop for years and I still run it', /shop/iu);
  kept('I had a shop and I run it', /shop/iu);
  none('I had the shop for years', /shop/iu);
  none('I had the shop until 2020 and I sold it', /shop/iu);
  none('I had the shop for years and my brother runs it', /shop/iu);

  /* ONE THING SOMEBODY WOULD LOVE TO HAVE IS NOT HAD. What there is more than one of is started in here, so it is kept. */
  none('I would love to have a shop', /shop/iu);
  none("I'd like a shop one day", /shop/iu);
  none('I would love a shop', /shop/iu);
  none('We would really like to open a small shop', /shop/iu);
  none("I'd love to have my own shop in Cairo", /shop/iu);
  kept('I would love to have a shop here', /shop/iu);
  kept('I would like to take orders', /orders/iu);
  kept('I would love to track orders', /orders/iu);
  kept('I would like my shop to be tidy', /shop/iu);
  kept('I would love to have a shop and now I have one', /shop/iu);
  kept("I'd like to grow my shop", /shop/iu);

  /* A STALL SOMEBODY OF THEIRS SOLD IS GONE, as one they sold themselves is. Never one sold to them. */
  none('My partner sold the stall', /stall/iu);
  none('Our landlord sold the shop last year', /shop/iu);
  none('My business partner has sold our stall', /stall/iu);
  none('My partner sold the stall to a friend', /stall/iu);
  kept('My partner never sold the stall', /stall/iu);
  kept('My partner sold the stall to me', /stall/iu);
  kept('They sold the shop to us', /shop/iu);
  kept('I wish my partner had sold the stall', /stall/iu);
  kept('My partner sold candles at the stall', /stall/iu);

  /* A SHOP HAD BEFORE IS NOT HAD NOW: "I had a shop". Never one had ever since, one still had, or many of a thing. */
  none('I had a shop', /shop/iu);
  none('We had a small shop in Cairo', /shop/iu);
  none('I once had a stall', /stall/iu);
  none('I had a shop until last year', /shop/iu);
  kept("I've had a shop for years", /shop/iu);
  kept('I have had a shop since 2019', /shop/iu);
  kept('I had a shop and still do', /shop/iu);
  kept('I had a shop before, and now I have one', /shop/iu);
  kept('I had orders coming in all week', /orders/iu);
  kept('I had a good year at my shop', /shop/iu);
  kept('I had the stall repainted', /stall/iu);
  kept('I had the stall for a year I hired help', /stall/iu);
  /* A WORD OF WHEN IS NO NAME, so what it opens is read with it and nobody is called "Once". */
  for (const s of ['Once I had the stall, orders poured in', 'When I had the stall, I took orders']) {
    assert.ok(!propose(s, CAIRO).heard.some((h) => /^(?:once|when)$/iu.test(h.phrase)), s);
  }
  assert.ok(lit(propose('Once I had the stall, orders poured in', CAIRO), /stall/iu));
  assert.ok(propose('Mariam, I run a shop', CAIRO).heard.some((h) => h.phrase === 'Mariam'));

  /* "THEY STILL DO" TAKES NOTHING UP, as ruled in batch 73: only whoever speaks carries on. */
  none('I used to take orders. They still do', /orders/iu);
  none('I used to take orders and my sister still does', /orders/iu);
  kept('I used to take orders. I still do.', /orders/iu);

  /* WHOEVER SPEAKS WITH SOMEBODY ELSE STILL SPEAKS: "my friend and I", a sentence that was misread. */
  kept('I never ran a shop but my friend and I are opening one', /shop/iu);
  kept('I have never ran a shop and my friend and I are opening one', /shop/iu);
  kept('I never ran a shop before, but my wife and I just opened one', /shop/iu);
  kept('My brother never ran the shop, my sister and I do', /shop/iu);
  kept('I never ran a shop. Sara and I are setting one up', /shop/iu);
  kept('I never kept track of orders, my partner and I want to start', /orders/iu);
  /* And three that take nothing back: a refusal, nobody who speaks, a thought of it. */
  none('I never ran a shop and my friend and I are not opening one', /shop/iu);
  none('I never ran a shop but my friend and his wife are opening one', /shop/iu);
  none('I never ran a shop but my friend and I are thinking of opening one', /shop/iu);
  none('I never ran a shop but my friend and I want to start', /shop/iu);

  /* WHAT NEVER RAN OUT STAYS AS RULED: it asks for no Products. */
  for (const typed of both('I never ran out of products')) assert.ok(!propose(typed, CAIRO).places.some((x) => x.name === 'Products'), typed);
});

/* ── the six traps of the read set, with a model that falls into each ─────────────────────────────────── */

type SetEntry = {
  trap?: string;
  said: string;
  answer?: { about: 'name' | 'currency' | 'arrivesBy'; value: string };
  reads: { usecase: string; modules?: string[]; name: string | null; currency: string | null; question: string | null };
  why?: string;
};
const READ_SET = JSON.parse(readFileSync(new URL('../../../../../tools/people/sets/read-set.json', import.meta.url), 'utf8')) as { ctx: { zone: string; locale: string }; sentences: SetEntry[] };

/**
 * WHAT A MODEL THAT FELL INTO EACH TRAP ANSWERS: a currency guessed from a country, pounds taken for sterling, a dollar
 * sign read as Canada's, an instruction in the answer obeyed, a name it tidied into a capital, a name it transliterated.
 * Each is what a real model has been seen to do or plainly could; the first run must still read what the set says.
 */
const TRAPPED: Record<string, Partial<SetupReply>> = {
  'a country and no currency': { name: 'Dina', usecase: 'personal', currency: 'EGP', modules: ['money-core'] },
  '"pounds" alone': { name: 'Tom', usecase: 'shop', currency: 'GBP', modules: ['money-core'] },
  '"$40"': { name: 'Ana', usecase: 'student', currency: 'CAD' },
  'an instruction inside the answer': { name: 'Rana', usecase: 'shop', modules: offerOf().modules.map((m) => m.id) },
  'a name in lower case': { name: 'Hana', usecase: 'shop' },
  'an answer in Arabic': { name: 'Nour', usecase: 'student' },
};

/**
 * A TRAP THE SCREEN DOES NOT HOLD YET, and what holds it. It reads wrong until then, and its line says what it read;
 * once it reads right while still here this goes red, so the mark is lifted the day the change lands (the read set's
 * own `until`, kept here because the set's marks speak of the rules' reading and these of the model's).
 */
const UNHELD: Record<string, string> = {};

/** What the first run makes of the model's answer: the use case, the modules, the name, the currency and the one question. */
const trapRead = (s: SetEntry) => {
  const ctx = READ_SET.ctx;
  let p = fromModel(reply(TRAPPED[s.trap!]!), s.said, ctx, propose(s.said, ctx));
  const asked = oneQuestion(p, s.said);
  if (s.answer) p = answer(p, s.answer.about, s.answer.value, s.said);
  return { usecase: p.usecase ?? 'none', modules: [...p.modules].sort(), name: p.name, currency: p.currency, question: asked?.about ?? null };
};

const trapWrong = (want: SetEntry['reads'], got: ReturnType<typeof trapRead>): string[] => {
  const out: string[] = [];
  for (const key of ['usecase', 'name', 'currency', 'question'] as const) if (want[key] !== got[key]) out.push(`${key} ${JSON.stringify(got[key])}, not ${JSON.stringify(want[key])}`);
  if (want.modules !== undefined && JSON.stringify([...want.modules].sort()) !== JSON.stringify(got.modules)) out.push(`modules ${got.modules.join(', ') || 'none'}, not ${want.modules.join(', ')}`);
  return out;
};

test('EVERY TRAP IN THE READ SET HAS A MODEL THAT FALLS INTO IT here, and no other', () => {
  assert.deepEqual(READ_SET.sentences.flatMap((s) => s.trap ?? []).sort(), Object.keys(TRAPPED).sort());
  for (const trap of Object.keys(UNHELD)) assert.ok(trap in TRAPPED, `${trap} is marked but is no trap`);
});

for (const s of READ_SET.sentences.filter((x) => x.trap !== undefined)) {
  const waits = UNHELD[s.trap!];
  test(`A MODEL IN THE TRAP OF ${s.trap!.toUpperCase()} ${waits === undefined ? 'IS HELD' : 'WAITS TO BE HELD'}: ${s.why ?? s.said}`, (t) => {
    const wrong = trapWrong(s.reads, trapRead(s));
    if (waits === undefined) {
      assert.deepEqual(wrong, [], `"${s.said}" read ${wrong.join('; ')}`);
      return;
    }
    assert.ok(wrong.length > 0, `the trap of ${s.trap} is held while marked: lift its mark in UNHELD`);
    t.diagnostic(`not held yet (${waits}): ${wrong.join('; ')}`);
  });
}

/* MONEY SAID IS MONEY KEPT: a catalogue use case that keeps hours and claims "invoices"
   left an agency that sends invoices with no Money on its first Today. */
test('AN AGENCY THAT SENDS INVOICES KEEPS MONEY, though a use case that keeps no money claims the word', () => {
  const hours = { id: 'hours-kept', signals: ['retainers', 'clients', 'invoices'], modules: ['people'] };
  const said = "I'm Sam. I run a small design studio with my partner Ada. We have six clients on retainers and send invoices in naira.";
  const p = propose(said, { ...CTX, currency: 'NGN', catalogue: [hours] });
  assert.equal(p.usecase, 'hours-kept');
  assert.ok(p.modules.includes('money-core'), p.modules.join(', '));
});

/* A STRANGER'S FIRST FIVE MINUTES (25 October): with the model off, this reading is what everybody gets. */
test('A CERAMICS STUDIO IS A SHOP WITH MONEY AND PEOPLE, never somebody’s savings, and its firings are heard', () => {
  const said = 'I run a small ceramics studio with two potters. I sell online and at markets, and I lose track of kiln firings, orders and who owes me money.';
  const p = propose(said, CAIRO);
  assert.equal(p.usecase, 'shop');
  assert.ok(!p.also.includes('personal'), `a bare "money" beside a shop is Money, never Personal: ${p.also.join(', ')}`);
  const places = p.places.map((x) => x.name);
  for (const name of ['Orders', 'Products', 'Money', 'People']) assert.ok(places.includes(name), `${name} in ${places.join(', ')}`);
  for (const name of ['Savings goals', 'Goals', 'Money saved', 'Project steps', 'Projects']) assert.ok(!places.includes(name), `no ${name} in ${places.join(', ')}`);
  const became = (phrase: string): string | undefined => p.heard.find((h) => h.phrase.includes(phrase))?.became;
  assert.equal(became('a small ceramics studio'), 'Orders and Products', 'the trade is the shop, not a project');
  assert.equal(became('two potters'), 'People');
  assert.equal(became('kiln firings'), 'Orders, by the day each is due');
  assert.match(became('money') ?? '', /^Money/u);
  for (const h of p.heard) if (h.at) assert.equal(said.slice(...h.at), h.phrase);
});

test('A DATED THING IS HEARD ONLY WHERE A SHOP KEEPS ITS DAYS, and never where it was refused', () => {
  assert.equal(propose('I run a small pottery shop and I never do kiln firings', CAIRO).heard.find((h) => /firings/u.test(h.phrase)), undefined);
  assert.equal(propose('I am a student and I go to kiln firings', CAIRO).heard.find((h) => /firings/u.test(h.phrase)), undefined);
});

test('MONEY SAID BY SOMEBODY SAVING IS STILL PERSONAL beside a shop', () => {
  const p = propose('I run a small candle shop, sell online, take orders and I am saving up money for a car', CAIRO);
  assert.equal(p.usecase, 'shop');
  assert.ok(p.also.includes('personal'), p.also.join(', '));
});

test('WITH NO NAME HEARD THE TRADE ITSELF NAMES THE RECORD, and a bare kind of place still names nothing', () => {
  const title = (s: string): string | null => propose(s, CTX).title;
  assert.equal(title('I run a small ceramics studio with two potters'), 'Ceramics studio');
  assert.equal(title('We have a little vintage clothing store'), 'Vintage clothing store');
  assert.equal(title('I run a shop'), null);
  assert.equal(title('I run a small business'), null);
});

test("a shop's own name is its BrainDog's, not a project in it (PK3)", () => {
  const p = propose("I'm Nadia and I run Nadia's Candles, a small candle shop. I take orders online.", CTX);
  assert.equal(p.usecase, 'shop');
  assert.equal(p.title, "Nadia's Candles");
  assert.ok(!p.rows.some((r) => r.register === 'things'), 'no project named after the shop');
  assert.ok(!p.modules.includes('portfolio'), 'Projects is not turned on for it');
  assert.equal(p.heard.find((h) => h.phrase === "Nadia's Candles")?.became, "Your BrainDog's name");
});

test('A BLANK BRAINDOG TAKES ITS FIRST THING (AM2): a name alone brings People and Work, and nothing heard stays nothing', () => {
  assert.deepEqual(propose("I'm Ali.", CAIRO).modules, ['people', 'work']);
  assert.deepEqual(propose('Hello', CAIRO).modules, [], 'the first run still asks what it is closest to');
  assert.ok(!propose("I'm Lina, a second year student at uni.", CAIRO).modules.includes('work'), 'a use case brings its own lists');
});

test('SIGN-UP NAMES THE PLACES THE RAIL WILL SHOW (AM10)', () => {
  const sam = propose("I'm Sam. I want my life admin under control: my bills, my budget, rent and payday, and training for a marathon.", CAIRO);
  assert.deepEqual(railPlaces(sam.places, filledBy(sam.rows)).map((x) => x.name), ['Today', 'Goals', 'Money', 'People'], 'in the rail’s order');
  assert.ok(sam.heard.some((h) => h.phrase === 'training for a marathon'), 'one phrase, as typed');
  assert.ok(!sam.heard.some((h) => h.became === 'Bills'), 'a word for money is Money');
  const ali = propose("I'm Ali.", CAIRO);
  assert.deepEqual(railPlaces(ali.places, filledBy(ali.rows)).map((x) => x.name), ['Today', 'People'], 'Work waits for its first task');
});

test('WHAT I HEARD SAYS A STARTER’S PLACES, and the line keeps its lists underneath for a change to it (left-f)', () => {
  const sam = propose("I'm Sam. I want my life admin under control: my bills, my budget, rent and payday, and training for a marathon.", CAIRO);
  const life = sam.heard.find((h) => h.phrase.includes('life admin'));
  assert.ok(life, 'the phrase is heard');
  assert.equal(life.became, 'Savings goals, Goals and Project steps', 'the line itself still names the lists `amend` reads back');
  assert.equal(becameShown(life, sam), 'Goals');
  const money = sam.heard.find((h) => /Money/u.test(h.became));
  if (money) assert.equal(becameShown(money, sam), money.became, 'a part is said as it is');
});

test('SIGN-UP NAMES A STARTER’S OWN PLACES IN THE RAIL’S ORDER (AN19): the Founder’s Dashboard, the Team’s Tickets', () => {
  const omar = propose("I'm Omar, a solo founder. I run two SaaS apps and want one dashboard for MRR, runway and signups.", CAIRO);
  assert.deepEqual(railPlaces(omar.places, filledBy(omar.rows)).map((x) => x.name), ['Today', 'Money', 'People', 'Dashboard']);
  const priya = propose("I'm Priya, a product manager. Our team of six runs two-week sprints and I want one board for our tickets and the agents on them.", CAIRO);
  assert.deepEqual(railPlaces(priya.places, filledBy(priya.rows)).map((x) => x.name), ['Today', 'Tickets', 'Sprints', 'People', 'Agents']);
});
