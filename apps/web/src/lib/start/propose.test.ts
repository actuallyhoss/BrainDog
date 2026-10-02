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
    ['three Etsy shops', 'owe my supplier'],
    'phrases are in the order they were typed, and one never typed is gone',
  );
  assert.deepEqual(p.names, { things: 'Shops' }, 'a list is named in their own word only');
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
  assert.deepEqual(p.heard, [{ phrase: 'mes devoirs', became: 'Student' }]);
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
