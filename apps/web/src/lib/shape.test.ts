/**
 * "What is this BrainDog for?", read deterministically. Every case is a sentence a person could type
 * into the second field of the product, including §5's six chips on their own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENTS_PACK, FIRST_PARTY, firstPartyManifest } from '@braindog/seed';
import { arrange } from '@braindog/seed/usecases';

import { firstRun } from './first-run.ts';
import { PACKS } from './record/data.ts';
import { INSTALL_ORDER, LEANS_ON, shape, titleOfRow, toTurnOn, writable, type PackId, type Shape } from './shape.ts';

const TODAY = '2026-09-15';
const read = (s: string): Shape => shape(s, TODAY);
const ids = (s: Shape): string[] => s.packs.map((p) => p.id);
const said = (s: Shape): string[] => s.heard.map((h) => h.text);

test('THE SENTENCE IN THE BRIEF: a studio, two people, monthly billing, side projects', () => {
  const s = read('I run a design studio with two people, we bill clients monthly and I track a few side projects');
  assert.deepEqual(ids(s), ['portfolio', 'people', 'money-core']);
  assert.deepEqual(said(s), ['studio', 'two people', 'bill', 'clients', 'monthly', 'side projects']);
  assert.equal(s.team, 2);
  assert.equal(s.currency, null);
  /* No amount and no day were typed, so the invoice is shown as needing both and is not written. */
  assert.deepEqual(s.rows, [{ register: 'obligations', fields: { what: 'Monthly invoice', direction: 'owed_to_me', state: 'open' }, missing: ['amount', 'due'] }]);
  assert.deepEqual(writable(s), []);
});

test('NOTHING TYPED declines, and says why', () => {
  for (const blank of ['', '   ', '\n\t']) assert.deepEqual(read(blank), { currency: null, packs: [], rows: [], heard: [], team: null, declined: 'empty' });
});

test('ANOTHER LANGUAGE declines gracefully rather than guessing from a borrowed word', () => {
  /* "studio" and "design" are English words inside a French sentence; nothing is read from them. */
  for (const s of ['Je dirige un studio de design avec deux personnes', 'Ich habe ein Studio und zwei Kunden', '東京でデザインスタジオを経営しています']) {
    const out = read(s);
    assert.equal(out.declined, 'language', s);
    assert.deepEqual(out.packs, [], s);
    assert.deepEqual(out.rows, [], s);
  }
});

test('WORDS IT DOES NOT KNOW decline as unread', () => {
  assert.equal(read('hello').declined, 'unread');
  assert.equal(read('The weather is nice today').declined, 'unread');
});

test('"I freelance" turns on Money and People, and invents no invoice', () => {
  const s = read('I freelance');
  assert.deepEqual(ids(s), ['money-core', 'people', 'portfolio']);
  assert.deepEqual(s.packs.at(-1), { id: 'portfolio', why: [] }, 'Projects is added because the others point at it');
  assert.deepEqual(s.rows, []);
  assert.equal(s.declined, null);
});

test('AN AMOUNT WITH ITS CURRENCY, a client and a day make a whole invoice', () => {
  const s = read('We bill Fenwick £2,000 a month on the 1st');
  assert.equal(s.currency, 'GBP');
  assert.deepEqual(s.rows, [
    { register: 'people', fields: { name: 'Fenwick', role: 'client' }, missing: [] },
    {
      register: 'obligations',
      fields: { what: 'Monthly invoice to Fenwick', direction: 'owed_to_me', state: 'open', amount: { amount: 200000, currency: 'GBP' }, due: '2026-10-01' },
      missing: [],
      party: 0,
    },
  ]);
  assert.deepEqual(writable(s).map(titleOfRow), ['Fenwick', 'Monthly invoice to Fenwick']);
});

test('MONEY WITHOUT A CURRENCY is said back and never kept', () => {
  const s = read('We bill clients 2000 a month');
  assert.equal(s.currency, null);
  assert.deepEqual(s.heard.find((h) => h.loose), { at: 16, text: '2000', packs: [], loose: true });
  assert.deepEqual(s.rows[0]?.missing, ['amount', 'due']);
  assert.equal(s.rows[0]?.fields.amount, undefined);
});

test('"POUNDS" AND "DOLLARS" name more than one currency, so they are not one', () => {
  for (const sentence of ['2,000 dollars a month from retainers', 'hosting costs 20 pounds a month']) {
    const s = read(sentence);
    assert.equal(s.currency, null, sentence);
    assert.ok(s.heard.some((h) => h.loose), sentence);
    assert.ok(s.rows.every((r) => r.fields.amount === undefined), sentence);
  }
});

test('A CODE, before or after the figure, in minor units by that currency\'s own exponent', () => {
  const egp = read('I invoice Halden EGP 5,000 every month on the 20th');
  assert.deepEqual(egp.rows.map(titleOfRow), ['Halden', 'Monthly invoice to Halden'], 'the code is not part of the name');
  assert.deepEqual(egp.rows[1]?.fields.amount, { amount: 500000, currency: 'EGP' });
  assert.equal(egp.rows[1]?.fields.due, '2026-09-20');

  assert.deepEqual(read('I bill 120000 JPY a month').rows[0]?.fields.amount, { amount: 120000, currency: 'JPY' });
  assert.deepEqual(read('I invoice €1.5k per month').rows[0]?.fields.amount, { amount: 150000, currency: 'EUR' });
});

test('A FRACTION OF A PENNY is not an amount', () => {
  const s = read('I bill £10.505 a month');
  assert.equal(s.rows[0]?.fields.amount, undefined);
  assert.deepEqual(s.rows[0]?.missing, ['amount', 'due']);
});

test('A DAY OF THE MONTH is the next one, today included', () => {
  assert.equal(read('I bill Kiln £50 a week on the 15th').rows[1]?.fields.due, '2026-09-15');
  assert.equal(read('I bill Kiln £50 a week on the 31st').rows[1]?.fields.due, '2026-10-31');
});

test('PROJECTS NAMED, one row each, and a status only the sentence implies', () => {
  assert.deepEqual(read("I'm building Kiln and Portage").rows, [
    { register: 'things', fields: { name: 'Kiln', lane: 'building' }, missing: [] },
    { register: 'things', fields: { name: 'Portage', lane: 'building' }, missing: [] },
  ]);
  const foundry = read('A type foundry called Kiln');
  assert.deepEqual(foundry.rows.map(titleOfRow), ['Kiln']);
  assert.deepEqual(foundry.packs, [{ id: 'portfolio', why: [{ at: 7, text: 'foundry' }, { at: 22, text: 'Kiln' }] }]);
  assert.deepEqual(read('I run BrainDog').rows.map(titleOfRow), ['BrainDog']);
});

test('CLIENTS NAMED, including one with an ampersand', () => {
  const s = read('Clients like Fenwick and Pell & Vine');
  assert.deepEqual(s.rows, [
    { register: 'people', fields: { name: 'Fenwick', role: 'client' }, missing: [] },
    { register: 'people', fields: { name: 'Pell & Vine', role: 'client' }, missing: [] },
  ]);
});

test('A WORD THE LEXICON READS IS NEVER A NAME', () => {
  const s = read("I'm building MCP servers for AI agents");
  assert.deepEqual(s.rows, []);
  assert.deepEqual(ids(s), ['agents', 'estate', 'portfolio']);
});

test('SERVICES, AGENTS AND WORK, with a team size', () => {
  assert.deepEqual(ids(read('Domains and hosting for my clients')), ['estate', 'people', 'portfolio']);
  assert.deepEqual(ids(read('I use Claude and Codex to ship apps')), ['agents', 'portfolio']);
  const work = read('Tasks and deadlines for a team of 4');
  assert.deepEqual(ids(work), ['work', 'people', 'portfolio']);
  assert.equal(work.team, 4);
  const solo = read('just me, invoicing a few clients');
  assert.equal(solo.team, 1);
  assert.deepEqual(solo.rows.map(titleOfRow), ['Invoice']);
});

test('EVERY CHIP, on its own, turns something on or suggests a use case', () => {
  for (const chip of firstRun.shapeChips) assert.ok(read(chip).packs.length > 0 || arrange(chip).pick !== null, chip);
});

test('THE FIRST RUN ASKS WHAT THIS BRAINDOG IS FOR, not what the business is (`loop/research-spark.md` §1)', () => {
  const first = [firstRun.shapeQuestion, firstRun.shapePlaceholder, ...firstRun.shapeChips, ...firstRun.whoChips, firstRun.firstLede];
  for (const line of first) assert.doesNotMatch(line, /business/iu, line);
  const kinds = new Set(firstRun.shapeChips.map((c) => arrange(c).pick?.usecase).filter(Boolean));
  assert.ok(kinds.has('student') && kinds.has('founder') && kinds.has('business'), [...kinds].join(', '));
});

const SENTENCES = [
  'I run a design studio with two people, we bill clients monthly and I track a few side projects',
  'We bill Fenwick £2,000 a month on the 1st',
  'I invoice Halden EGP 5,000 every month on the 20th',
  'I invoice €1.5k per month',
  "I'm building Kiln and Portage",
  'Clients like Fenwick and Pell & Vine',
  'hosting costs 20 pounds a month',
  'I freelance',
  ...firstRun.shapeChips,
];

test('NEVER INVENTED: every amount is digits the sentence holds, every span is the sentence\'s own text', () => {
  for (const sentence of SENTENCES) {
    const s = read(sentence);
    for (const h of s.heard) assert.equal(sentence.slice(h.at, h.at + h.text.length), h.text, sentence);
    for (const r of s.rows) {
      const money = r.fields.amount;
      if (typeof money === 'object') assert.match(sentence, /\d/u, sentence);
      if (r.register !== 'obligations') assert.ok(sentence.includes(titleOfRow(r)), `${sentence}: ${titleOfRow(r)}`);
    }
    assert.deepEqual(read(sentence), s, `${sentence} read twice gave two shapes`);
  }
});

test('EVERY PACK IS ONE THE APP SHIPS, and every row lands in a register of a pack the shape turns on', () => {
  for (const sentence of SENTENCES) {
    const s = read(sentence);
    for (const p of s.packs) assert.ok(PACKS.some((x) => x.id === p.id), `${p.id} is not a pack`);
    for (const r of s.rows)
      assert.ok(
        s.packs.some((p) => PACKS.find((x) => x.id === p.id)?.registers.includes(r.register)),
        `${sentence}: ${r.register} belongs to no pack the shape turns on`,
      );
  }
});

test('WHAT TURNS ON: dependencies first, and People whenever turn 1 heard a name', () => {
  assert.deepEqual(toTurnOn(read('I freelance'), false), ['portfolio', 'people', 'money-core']);
  assert.deepEqual(toTurnOn(read(''), false), []);
  /* A name alone is a person, not a project: People goes in without Projects. */
  assert.deepEqual(toTurnOn(read(''), true), ['people']);
  assert.deepEqual(toTurnOn(read('I use Claude'), true), ['portfolio', 'people', 'agents']);
  /* An invoice is to somebody, so Money brings People with it. */
  assert.deepEqual(toTurnOn(read('I send invoices'), false), ['portfolio', 'people', 'money-core']);
  assert.deepEqual(toTurnOn(read('Domains and hosting'), false), ['portfolio', 'estate']);
});

test('WHAT EACH LIST LEANS ON is what the seed says its pack requires, and comes before it', () => {
  const ownerOf = new Map<string, PackId>();
  for (const id of FIRST_PARTY) for (const p of firstPartyManifest(id).provides) ownerOf.set(p, id);
  const leans = (requires: readonly string[]) => [...new Set(requires.map((r) => ownerOf.get(r) ?? r))].sort();

  for (const id of FIRST_PARTY) assert.deepEqual([...LEANS_ON[id]].sort(), leans(firstPartyManifest(id).requires), id);
  assert.deepEqual([...LEANS_ON.agents].sort(), leans(AGENTS_PACK.manifest.requires));
  for (const id of INSTALL_ORDER)
    for (const needs of LEANS_ON[id]) assert.ok(INSTALL_ORDER.indexOf(needs) < INSTALL_ORDER.indexOf(id), `${id} is before ${needs}`);
});
