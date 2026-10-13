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

test('A REFUSAL IS READ THROUGH THE "-ING" OF A VERB: no more tracking of orders, done taking orders, no more chasing invoices', () => {
  const lit = (p: ReturnType<typeof propose>, word: RegExp): boolean => p.heard.some((h) => word.test(h.phrase)) || p.places.some((x) => x.phrase !== null && word.test(x.phrase));
  const shop = (p: ReturnType<typeof propose>): boolean => p.usecase === 'shop' || p.also.includes('shop') || p.places.some((x) => x.name === 'Orders');

  /* THE SENTENCE THE AUDIT OF BATCH 56 TYPED AS A STRANGER. */
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

  /* THE TWO SENTENCES THE AUDIT OF BATCH 60 TYPED AS A STRANGER: both keep Orders. */
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

test('WHAT THE AUDIT OF BATCH 61 TYPED AS A STRANGER: used to, no longer, my old things, a run decided whole, a denial through a word of thinking', () => {
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

test('WHAT THE AUDIT OF BATCH 63 TYPED AS A STRANGER: a "used to" taken up again carries on, and a stopping that says when it happened stops', () => {
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
