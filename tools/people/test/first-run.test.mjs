/**
 * Use case 6 for Mariam, walked on a fresh self-host: the test fails on the first red step, with that step's line.
 *
 * AND THE CHECKS FAIL BY THEMSELVES. Before the walk, each pure check is handed what a broken step would show and must
 * go red, and the person file is checked for its shape, so a green walk is never a check that cannot fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkPerson } from '../check-files.mjs';
import { expect, lineOf, notMine, selfHost, STEPS, walk } from '../expect/first-run.mjs';

const MARIAM = JSON.parse(readFileSync(new URL('../mariam.json', import.meta.url), 'utf8'));

test('her file holds every field the walk reads, and one missing is refused by name', () => {
  assert.deepEqual(checkPerson(MARIAM), []);
  const { first: _first, ...noFirst } = MARIAM;
  assert.deepEqual(checkPerson(noFirst), ['first is missing: her first real thing, the sentence she tells the card']);
  const noPlaces = { ...MARIAM, expect: { ...MARIAM.expect, heard: { ...MARIAM.expect.heard, places: undefined } } };
  assert.match(checkPerson(noPlaces).join('\n'), /expect\.heard\.places is missing/u);
});

test('each check goes red on what a broken step shows', () => {
  const who = expect.who({ question: 'Tell us about yourself', chips: ['I freelance'], copy: ['Take the tour', 'Step 1 of 3'] }, MARIAM);
  assert.equal(who.pass, false);
  assert.match(who.saw, /no "I run a small shop"/u);
  assert.match(who.saw, /no promise "free, with no card"/u);

  const at = (phrase) => [MARIAM.said.indexOf(phrase), MARIAM.said.indexOf(phrase) + phrase.length];
  const proposal = {
    usecase: 'business',
    heard: [{ phrase: 'Mariam', became: 'you', you: true, at: at('Mariam') }, { phrase: 'orders', became: 'Shop', at: [0, 6] }],
    title: null,
    places: [{ name: 'Orders' }, { name: 'Today' }],
    rows: [{ register: 'orders', fields: { what: 'Example order' } }],
  };
  const heard = expect.heard({ proposal }, MARIAM);
  assert.equal(heard.pass, false);
  for (const said of [/read as business/u, /not lit where she typed them/u, /first place is Orders/u, /before anything is kept/u]) assert.match(heard.saw, said);

  const choice = { value: 'messages', label: 'Messages', means: '' };
  const question = expect.question({ asked: { about: 'arrivesBy', question: 'Where?', choices: [choice], only: '' }, after: { answers: {} }, again: { question: 'And your name?' } }, MARIAM);
  assert.equal(question.pass, false);
  assert.match(question.saw, /a second question followed/u);

  const keep = expect.keep({ door: 'self-host', failed: [], lists: ['orders', 'products', 'people', 'transactions'], people: ['Mariam', 'Nadia'], examples: 2, currency: 'EGP' }, MARIAM);
  assert.equal(keep.pass, false);
  assert.match(keep.saw, /People holds Mariam, Nadia/u);
  const kept = expect.keep({ door: 'self-host', failed: [], lists: ['orders', 'products', 'people', 'transactions'], people: ['Mariam'], examples: 0, currency: 'EGP' }, MARIAM);
  assert.equal(kept.pass, null);
  assert.match(kept.saw, /^sign-up not walked: self-host/u);

  const counts = { before: { orders: 0 }, previewed: { orders: 1 }, added: { orders: 1 }, undone: { orders: 1 } };
  const rows = MARIAM.expect.tell.lists.map((register) => ({ register, fields: {}, said: register, missing: [] }));
  const tell = expect.tell({ preview: { rows, left: [] }, counts, batch: 'b1', made: rows }, MARIAM);
  assert.equal(tell.pass, false);
  assert.match(tell.saw, /written before the press/u);
  assert.match(tell.saw, /after the one Undo, orders holds 1, was 0/u);

  /* AN UNDO THAT LEAVES ONE ENTRY BEHIND IS RED, whether the counts show it or only the entry's own number does. */
  const told = MARIAM.expect.tell.lists.map((register, seq) => ({ register, fields: {}, said: register, missing: [], seq, title: register }));
  const all = Object.fromEntries(told.map((r) => [r.register, 1]));
  const none = Object.fromEntries(told.map((r) => [r.register, 0]));
  const good = { preview: { rows: told, left: [] }, counts: { before: none, previewed: none, added: all, undone: none }, batch: 'b1', made: told, kept: [] };
  assert.equal(expect.tell(good, MARIAM).pass, true);
  const oneLeft = expect.tell({ ...good, counts: { ...good.counts, undone: { ...none, orders: 1 } }, kept: [told[1]] }, MARIAM);
  assert.equal(oneLeft.pass, false);
  assert.match(oneLeft.saw, /the one Undo left "orders" in orders; after the one Undo, orders holds 1, was 0/u);
  const wrongOne = expect.tell({ ...good, kept: [told[0]] }, MARIAM);
  assert.equal(wrongOne.pass, false);
  assert.match(wrongOne.saw, /the one Undo left "people" in people/u);
  const nothingWritten = expect.tell({ ...good, counts: { ...good.counts, added: none } }, MARIAM);
  assert.equal(nothingWritten.pass, false);
  assert.match(nothingWritten.saw, /the lists grew by 0/u);

  const steps = [{ kind: 'agent', agent: { name: 'An agent' } }];
  const today = expect.today({ ok: true, tellShown: true, steps, hiddenSteps: steps, lists: ['orders', 'people'], offers: [{ title: 'Orders this week' }] }, MARIAM);
  assert.equal(today.pass, false);
  for (const said of [/still up/u, /not the source/u, /Hide left/u, /on her first day/u]) assert.match(today.saw, said);

  const offer = expect.offer({ early: [{ id: 'week:orders' }], earlyDay: 13, late: [], lateDay: 15, weeks: 2, thisWeek: 3 }, MARIAM);
  assert.equal(offer.pass, false);
  assert.match(offer.saw, /before day 14/u);
  assert.match(offer.saw, /read on 2 weeks/u);
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
  assert.match(notMine({ ...fresh, record: { slug: 'sam', name: 'Sam' } }, MARIAM), /in Sam, not mariams-candles/u);
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
