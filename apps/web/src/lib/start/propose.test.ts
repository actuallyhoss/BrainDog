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
import { useCase } from '@braindog/seed/usecases';

import { caseBecame, currencyFor, draftBrief, fold, fromModel, heardWords, outsideCatalogue, partName, propose, proposeFirst, setupOffer } from './propose.ts';

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
  assert.ok(p.modules.includes('portfolio'), 'Projects is still installed, since Money stands on it');
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
  assert.equal(p.places.find((x) => x.id === 'portfolio'), undefined, 'Projects comes only because Money stands on it, so it is not listed');
  assert.ok(p.modules.includes('portfolio'), 'and it is still installed');
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
      ['who owes me', 'Money, in EGP'],
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

test("A MODEL'S READING TAKES THE DEVICE'S CURRENCY THE SAME WAY, and the rules' Clients stand in with their lines", async () => {
  const thin = await proposeFirst(MARIAM, CAIRO, fake(reply({ usecase: 'shop', modules: ['money-core'], heard: [{ phrase: 'not in it', became: 'x' }] })).ask);
  assert.equal(thin.currency, 'EGP');
  assert.equal(thin.currencyBy, 'device');
  assert.equal(thin.heard.filter((h) => h.became.endsWith(heardWords.inCurrency('EGP'))).length, 1, 'said once, not twice');
  assert.deepEqual(thin.names, { people: 'Clients' });
  const own = await proposeFirst(MARIAM, CAIRO, fake(reply({ usecase: 'shop', modules: ['money-core'], heard: [{ phrase: 'who owes me', became: 'Money' }] })).ask);
  assert.equal(own.heard.find((h) => h.phrase === 'who owes me')?.became, 'Money, in EGP');
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

/* ── finding 3 of the audit of batches 49 and 50: what the heard lines say ── */

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
  assert.deepEqual(linesOf(p), ['student > Courses, Assignments and Study sessions', 'a small shop > Orders and Products']);
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

  /* THE SENTENCES THE AUDIT OF BATCH 54 TYPED AS A STRANGER. */
  const tasks = propose('I do not want to track taxes or orders, just my tasks', CAIRO);
  assert.deepEqual(linesOf(tasks), ['tasks > Work']);
  assert.ok(!tasks.modules.includes('money-core') && !tasks.modules.includes('portfolio') && tasks.usecase !== 'shop', 'neither taxes nor orders turned a part on');

  const credit = propose('I run a shop but I never send invoices or take orders on credit', CAIRO);
  assert.deepEqual(linesOf(credit), ['a shop > Orders and Products']);
  assert.ok(!credit.modules.includes('money-core') && credit.also.length === 0, 'no Money, and nothing taken beside the shop');

  const owes = propose('no invoices, I just take orders and track who owes me', CAIRO);
  assert.deepEqual(linesOf(owes), ['orders > Orders', 'who owes me > Money, in EGP'], 'what the person does do is kept');

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

test("A SENTENCE THAT OPENS WITH A REFUSAL NAMES NOBODY: Don't need orders, I freelance as a designer", () => {
  const typed = "Don't need orders, I freelance as a designer";
  const p = propose(typed, CAIRO);
  assert.equal(p.name, null, 'nobody is called "Don\'t need orders"');
  assert.deepEqual(linesOf(p), ['freelance as a designer > Clients and Invoices, in EGP']);
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
    'who owes me, and taxes > Money, in EGP',
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
