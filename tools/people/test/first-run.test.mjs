/**
 * Use case 6 for Mariam, walked on a fresh self-host: the test fails on the first red step, with that step's line.
 *
 * AND THE CHECKS FAIL BY THEMSELVES. One case a step: each pure check is handed what that step shows when it works and
 * must go green, then what it shows when it breaks and must go red, naming what broke. The person file is checked for
 * its shape, so a green walk is never a check that cannot fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkPerson } from '../check-files.mjs';
import { expect, lineOf, notMine, selfHost, STEPS, walk } from '../expect/first-run.mjs';
import { propose } from '../../../apps/web/src/lib/start/propose.ts';
import { answer, oneQuestion } from '../../../apps/web/src/lib/start/question.ts';
import { browserCurrencyEnv, zoneCurrency } from '../../../apps/web/src/routes/start/building.ts';

const MARIAM = JSON.parse(readFileSync(new URL('../mariam.json', import.meta.url), 'utf8'));
/** The walk's own source, so a step it does by a copy of the page, and not by the page's function, is red. */
const walker = readFileSync(new URL('../expect/first-run.mjs', import.meta.url), 'utf8');

/** Her sentence read as the sign-up page reads it, on a phone in Alexandria. */
const env = browserCurrencyEnv(MARIAM.locale, MARIAM.languages, MARIAM.zone);
const read = () => propose(MARIAM.said, { zone: MARIAM.zone, locale: MARIAM.locale, currency: zoneCurrency(MARIAM.zone) });

test('her file holds every field the walk reads, and one missing or wrong is refused by name', () => {
  assert.deepEqual(checkPerson(MARIAM), []);
  const { first: _first, ...noFirst } = MARIAM;
  assert.deepEqual(checkPerson(noFirst), ['first is missing: her first real thing, the sentence she tells the card']);
  const noPlaces = { ...MARIAM, expect: { ...MARIAM.expect, heard: { ...MARIAM.expect.heard, places: undefined } } };
  assert.match(checkPerson(noPlaces).join('\n'), /expect\.heard\.places is missing/u);
  /* WHAT ONLY A SHOP SAYS may be left out, but never written wrong. */
  const { money: _money, ...noMoney } = MARIAM.expect.today;
  assert.deepEqual(checkPerson({ ...MARIAM, expect: { ...MARIAM.expect, today: noMoney } }), []);
  const badLead = { ...MARIAM, expect: { ...MARIAM.expect, offer: { ...MARIAM.expect.offer, lead: { says: 'x', match: '(' } } } };
  assert.match(checkPerson(badLead).join('\n'), /expect\.offer\.lead is not/u);
  const strayPhrase = { ...MARIAM, expect: { ...MARIAM.expect, heard: { ...MARIAM.expect.heard, became: { freelance: ['Clients'] } } } };
  assert.match(checkPerson(strayPhrase).join('\n'), /names "freelance", which is not lit/u);
});

test('1. WHO ARE YOU? green on the five starting points and three promises; red on a tour, a count, a missing promise', () => {
  const copy = ['Free, with no card.', 'Nothing is saved until you keep it.', 'Yours to export or move.'];
  const chips = ['I run a small shop', 'I freelance', "I'm a student", 'I run a few companies', "I'm part of a team"];
  assert.equal(expect.who({ question: 'Who are you?', chips, copy }, MARIAM).pass, true);
  const who = expect.who({ question: 'Tell us about yourself', chips: ['I freelance'], copy: ['Take the tour', 'Step 1 of 3'] }, MARIAM);
  assert.equal(who.pass, false);
  for (const said of [/the question reads "Tell us about yourself"/u, /no "I run a small shop"/u, /1 starting points, not 5/u, /no promise "free, with no card"/u, /it says "Take the tour"/u]) assert.match(who.saw, said);
});

test('2. HER WORDS LIGHT UP: green on her own sentence read as the page reads it; red on half phrases, People for Clients, a place she never said', () => {
  const p = read();
  const heard = expect.heard({ proposal: p }, MARIAM);
  assert.equal(heard.pass, true, heard.saw);
  assert.match(heard.saw, /places Today, Orders, Products, Clients, Money/u);

  /* FREELANCE READ AS PEOPLE, "owes" lit alone, Projects among the places: what 48 read before uc6-heard-49. */
  const at = (phrase) => [MARIAM.said.indexOf(phrase), MARIAM.said.indexOf(phrase) + phrase.length];
  const old = {
    ...p,
    heard: p.heard.map((h) => (h.phrase === 'freelance as a designer' ? { ...h, phrase: 'freelance', became: 'People and Money', at: at('freelance') } : h.phrase === 'who owes me' ? { ...h, phrase: 'owes', at: at('owes') } : h)),
    places: [{ name: 'Today' }, { name: 'Orders' }, { name: 'Products' }, { name: 'People' }, { name: 'Projects' }, { name: 'Money' }],
  };
  const red = expect.heard({ proposal: old }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/"freelance as a designer" not lit/u, /"who owes me" not lit/u, /no Clients among the places/u, /People, Projects among the places, which she never said/u]) assert.match(red.saw, said);

  const asPeople = { ...p, heard: p.heard.map((h) => (h.phrase === 'freelance as a designer' ? { ...h, became: 'People' } : h)) };
  assert.match(expect.heard({ proposal: asPeople }, MARIAM).saw, /"freelance as a designer" became "People", not Clients and Invoices/u);
  const noCurrency = { ...p, heard: p.heard.map((h) => (h.phrase === 'who owes me' ? { ...h, became: 'Money' } : h)) };
  assert.match(expect.heard({ proposal: noCurrency }, MARIAM).saw, /"who owes me" became "Money", not Money and EGP/u);

  const sample = expect.heard({ proposal: { ...p, usecase: 'business', title: null, places: [{ name: 'Orders' }, ...p.places], rows: [{ register: 'orders', fields: { what: 'Example order' } }] } }, MARIAM);
  for (const said of [/read as business/u, /titled nothing/u, /first place is Orders/u, /before anything is kept/u]) assert.match(sample.saw, said);
});

test('3. ONE QUESTION: green on the page\'s own question; red on an answer that says nothing, a second question, no "only question"', () => {
  const p = read();
  const asked = oneQuestion(p, MARIAM.said, env);
  const after = answer(p, asked.about, MARIAM.answer, MARIAM.said);
  const green = expect.question({ asked, after, again: oneQuestion(after, MARIAM.said, env) }, MARIAM);
  assert.equal(green.pass, true, green.saw);

  const choice = { value: 'messages', label: 'Messages', means: '' };
  const red = expect.question({ asked: { about: 'currency', question: 'Where?', choices: [choice], only: '' }, after: { answers: {} }, again: { question: 'And your name?' } }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/asked about currency, not arrivesBy/u, /1 answers, not 3/u, /"Messages" says nothing/u, /not say it is the only question/u, /"messages" was not kept/u, /a second question followed/u]) assert.match(red.saw, said);
  assert.match(expect.question({ asked: null }, MARIAM).saw, /no question was asked/u);
});

test('4. KEEP IT: the build is the page\'s own, called; red on no currency, a list not made, a sample person, a refused link', () => {
  /* THE WALK BUILDS WITH `accepting()`, as the sign-up page does: a copy once sent a currency the page never did. */
  assert.match(walker, /import \{ accepting\b[^}]*\} from '\.\.\/\.\.\/\.\.\/apps\/web\/src\/routes\/signup\/build\.ts'/u);
  /* AND THE NAMES THE PAGE SENDS ARE ITS OWN (`nameSent`, `titleSent`), never a copy: her name at the start, the title
     she was shown when the record is made. */
  assert.match(walker, /keepIt\(host, person, nameSent\(proposal\), titleSent\(after, person\.name\)\)/u);
  assert.match(walker, /await accepting\(/u);
  assert.doesNotMatch(walker, /currencyChoices\(|INSTALL_ORDER|\bconst offered\b/u, 'the walk picks modules or a currency of its own beside accepting()');

  const lists = MARIAM.expect.keep.lists;
  const good = { door: 'signup', failed: [], lists, people: ['Mariam'], examples: 0, currency: 'EGP', title: "Mariam's Candles" };
  assert.equal(expect.keep(good, MARIAM).pass, true);
  const self = expect.keep({ ...good, door: 'self-host' }, MARIAM);
  assert.equal(self.pass, null);
  assert.match(self.saw, /^sign-up not walked: self-host/u);
  /* THE PAGE SENDS THE NAME IT HEARD, so a record opened as "Mariam" is not the one she was shown. */
  assert.match(expect.keep({ ...good, title: 'Mariam' }, MARIAM).saw, /the mailed link opened "Mariam", not "Mariam's Candles"/u);
  assert.doesNotMatch(walker, /keepIt\(host, person, after\.title/u, 'the walk signs up under a name the page never sends');

  const red = expect.keep({ ...good, lists: lists.filter((id) => id !== 'obligations'), people: ['Mariam', 'Nadia'], examples: 2, currency: null }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/no obligations on the record/u, /People holds Mariam, Nadia/u, /2 entries tagged example/u, /currency is none, not EGP/u]) assert.match(red.saw, said);
  const failed = expect.keep({ ...good, door: 'refused', why: 'the link was refused', failed: [{ said: 'Shop was not added.', why: 'no' }] }, MARIAM);
  assert.match(failed.saw, /sign-up refused: the link was refused; the build said "Shop was not added\."/u);
});

/** Her first real thing as the card reads it on a fresh shop: Nadia, her order, and the paid item in Bills and invoices. */
const told = MARIAM.expect.tell.lists.map((register, seq) => ({ register, fields: {}, said: register, missing: [], seq, title: register }));
const all = Object.fromEntries(told.map((r) => [r.register, 1]));
const none = Object.fromEntries(told.map((r) => [r.register, 0]));
const good = { preview: { rows: told, left: [] }, counts: { before: none, previewed: none, added: all, undone: none }, batch: 'b1', made: told, kept: [] };

test('5. TELL IT ONE REAL THING: green on three entries added as one and one Undo; red on the Ledger, a held Add, a write before the press, an Undo that leaves one', () => {
  assert.deepEqual(MARIAM.expect.tell.lists, ['people', 'orders', 'obligations']);
  assert.match(walker, /readyRows\(preview\.rows\)/u, 'the walk picks what one press sends by a copy of the card');
  assert.equal(expect.tell(good, MARIAM).pass, true);

  /* "PAID 900 ON INSTAPAY" ON THE LEDGER needs an account a fresh shop does not hold, so Add is held (uc6-tell-49). */
  const ledger = told.map((r) => (r.register === 'obligations' ? { ...r, register: 'transactions', missing: ['account'], said: 'EGP 900 in' } : r));
  const held = expect.tell({ ...good, preview: { rows: ledger, left: [] }, made: told.slice(0, 2) }, MARIAM);
  assert.equal(held.pass, false);
  assert.match(held.saw, /the preview is people, orders, transactions, not people, orders, obligations; "EGP 900 in" needs account, so Add is held/u);

  const early = expect.tell({ ...good, counts: { ...good.counts, previewed: all } }, MARIAM);
  assert.match(early.saw, /written before the press/u);
  const oneLeft = expect.tell({ ...good, counts: { ...good.counts, undone: { ...none, orders: 1 } }, kept: [told[1]] }, MARIAM);
  assert.match(oneLeft.saw, /the one Undo left "orders" in orders; after the one Undo, orders holds 1, was 0/u);
  /* COUNTS ALONE WOULD PASS AN UNDO THAT TOOK BACK THE WRONG ONE: the entry's own number says it. */
  assert.match(expect.tell({ ...good, kept: [told[0]] }, MARIAM).saw, /the one Undo left "people" in people/u);
  assert.match(expect.tell({ ...good, counts: { ...good.counts, added: none } }, MARIAM).saw, /the lists grew by 0/u);
  assert.match(expect.tell({ ...good, batch: undefined }, MARIAM).saw, /no batch, so no one Undo/u);
  assert.match(expect.tell({ ...good, refused: 'CAPTURE_REFUSED: no' }, MARIAM).saw, /the press was refused: CAPTURE_REFUSED/u);
});

test('6. HER FIRST TODAY: green on the card gone and In EGP 900; red on the tile missing, in minor units, or the card still up', () => {
  const source = [{ kind: 'source', source: { name: "Your bank's texts" } }];
  const today = { ok: true, tellShown: false, steps: source, hiddenSteps: [], lists: ['orders', 'people'], offers: [], money: [['In', 'EGP 900.00']], line: 'EGP 900 came in this week.' };
  const green = expect.today(today, MARIAM);
  assert.equal(green.pass, true, green.saw);
  assert.match(green.saw, /the money tile reads "In EGP 900"/u);

  assert.match(expect.today({ ...today, money: null }, MARIAM).saw, /no Money this week tile, so no "In EGP 900"/u);
  assert.match(expect.today({ ...today, money: [['In', 'EGP 90000']] }, MARIAM).saw, /the money tile reads "In EGP 90000", not "In EGP 900"/u);
  /* THE LEDGER'S MONEY IN, which never sees a paid item: the tile drawn over nothing. */
  assert.match(expect.today({ ...today, money: [] }, MARIAM).saw, /the money tile reads nothing/u);

  const agent = [{ kind: 'agent', agent: { name: 'An agent' } }];
  const red = expect.today({ ...today, tellShown: true, steps: agent, hiddenSteps: agent, lists: ['people'], offers: [{ title: 'Orders this week' }] }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/still up/u, /not the source/u, /Hide left/u, /no orders in boot/u, /on her first day/u]) assert.match(red.saw, said);
  assert.match(expect.today({ ok: false, why: 'no answer' }, MARIAM).saw, /boot was refused/u);
});

test('7. A PAGE FOR HER PATTERN: green on day 15 with Orders saying who still owes; red on an early offer, none, or a sentence with no owed clause', () => {
  const offer = { id: 'week:orders', title: 'Orders this week', why: 'Orders has 4 due this week. Give them a page of their own?' };
  const lead = '6 orders this month, 6 to ship this week, and Salma still owes EGP 1,350';
  const seen = { early: [], earlyDay: 13, late: [offer], lateDay: 15, weeks: 3, thisWeek: 4, lead };
  const green = expect.offer(seen, MARIAM);
  assert.equal(green.pass, true, green.saw);
  assert.match(green.saw, /Orders says "6 orders this month/u);
  /* THE HEAD WRITES EGP AS EVERY OTHER PLACE DOES, "EGP 1,350", never "E£1,350" (his word, 9 October). */
  assert.equal(expect.offer({ ...seen, lead: lead.replace('EGP ', 'E£') }, MARIAM).pass, false);

  const red = expect.offer({ ...seen, early: [offer], late: [], weeks: 2, thisWeek: 3 }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/before day 14/u, /read on 2 weeks/u]) assert.match(red.saw, said);
  assert.match(expect.offer({ ...seen, late: [{ ...offer, why: 'You have 4 rows' }] }, MARIAM).saw, /its why says/u);
  /* THE OWED CLAUSE IS WHAT THE MOCKUP SAYS, and a ref drawn as its id, or a total never kept, leaves it out or wrong. */
  assert.match(expect.offer({ ...seen, lead: '6 orders this month, 6 to ship this week' }, MARIAM).saw, /Orders says "6 orders this month, 6 to ship this week", not/u);
  assert.match(expect.offer({ ...seen, lead: '6 orders this month, 6 to ship this week, and 01JZ8QK3F7R2M9V4XN6TCB5HAD still owes EGP 1,350' }, MARIAM).saw, /not "N orders this month/u);
  assert.match(expect.offer({ ...seen, lead: null }, MARIAM).saw, /Orders says no sentence/u);
});

test('MARIAM ON A FRESH SELF-HOST: the seven steps, and the first red one fails the test', async () => {
  const host = await selfHost(MARIAM);
  const lines = [];
  let results;
  try {
    results = await walk(MARIAM, host, (r) => lines.push(lineOf(r)));
  } finally {
    await host.close();
  }
  console.log(lines.join('\n'));
  assert.deepEqual(results.map((r) => r.id), STEPS.map((s) => s.id), 'the walk did not say all seven steps');
  const red = results.find((r) => r.pass === false);
  assert.equal(red, undefined, red ? lineOf(red) : '');
});

test('it never writes to a record it did not make', async () => {
  const fresh = { registers: [], record: { slug: MARIAM.slug, name: MARIAM.expect.heard.title } };
  assert.equal(notMine(fresh, MARIAM), null);
  assert.match(notMine({ ...fresh, record: { slug: 'pat', name: 'Pat' } }, MARIAM), /in Pat, not mariams-candles/u);
  assert.match(notMine({ ...fresh, registers: [{ id: 'orders', count: 3 }] }, MARIAM), /already holds three entries/u);
  assert.match(notMine(null, MARIAM), /did not answer/u);

  /* THE OWNER DOOR LANDS IN ANOTHER RECORD: step 4 is red, the walk stops, and that record is left as it was. */
  const host = await selfHost(MARIAM);
  let landed = null;
  const elsewhere = { ...host, owner: (t, who, title) => ((landed = t), host.owner(t, { ...who, slug: 'someone-else' }, title)) };
  let results;
  try {
    results = await walk(MARIAM, elsewhere);
    const after = await landed.client().boot();
    assert.equal(after.ok, true);
    assert.equal(after.value.registers.reduce((n, r) => n + r.count, 0), 0);
    assert.equal(after.value.registers.some((r) => r.id === 'orders' || r.id === 'people'), false);
  } finally {
    await host.close();
  }
  const keep = results.find((r) => r.id === 'keep');
  assert.equal(keep.pass, false);
  assert.match(keep.saw, /nothing was written to it/u);
  for (const r of results.slice(4)) assert.match(r.saw, /^not reached: /u);
});
