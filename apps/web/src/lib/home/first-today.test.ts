/**
 * A first Today offers the card to tell it one real thing while nothing is added, then the next steps until they are
 * hidden, one at a time, as use case 6 draws them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addedByHand, addedSaid, countWord, showTell, tellLists, wantMore } from './first-today.ts';
import { optimist } from '../data/optimistic.ts';
import { madeSteps } from '../start/made.ts';
import { listsOfModules, playedBy } from '../start/parts.ts';

/** A boot whose lists are those of these modules, every one empty, with the counts given by list. */
const boot = (modules: string[], counts: Record<string, number> = {}) => ({
  registers: listsOfModules(modules).map((id) => ({ id, name: id, count: counts[id] ?? 0 })),
});

const SHOP = ['portfolio', 'people', 'money-core'];
const people = playedBy('meets')!;
const rates = playedBy('rates')!;
const projects = playedBy('projects')!;

test('A FRESH RECORD HAS HAD NOTHING ADDED: the card shows, and no next step yet', () => {
  const fresh = boot(SHOP);
  assert.equal(addedByHand(fresh), 0);
  assert.equal(showTell(fresh), true);
  assert.deepEqual(wantMore(fresh, {}), [], 'the card is the first act, alone');
});

test('WHAT THE RECORD FILLS ITSELF, AND THE PERSON AS HER OWN FIRST PERSON, are not added by hand', () => {
  const filled = boot(SHOP, { [rates]: 40, [people]: 1 });
  assert.equal(addedByHand(filled), 0);
  assert.equal(showTell(filled), true);
  /* A SECOND PERSON IS SOMEBODY SHE ADDED. */
  assert.equal(addedByHand(boot(SHOP, { [people]: 2 })), 1);
  assert.equal(showTell(boot(SHOP, { [people]: 2 })), false);
});

test('ONCE SOMETHING IS ADDED the card goes and the next steps take its place, in the order her answer puts them', () => {
  const told = boot(SHOP, { [projects]: 1, [people]: 2 });
  assert.equal(showTell(told), false);
  const lists = told.registers.map((r) => r.id);
  assert.deepEqual(wantMore(told, {}), madeSteps(lists));
  assert.equal(wantMore(told, {})[0]?.kind, 'agent');
  /* WORK THAT ARRIVES BY MESSAGES puts forwarding first. */
  assert.deepEqual(wantMore(told, { arrivesBy: 'messages' }), madeSteps(lists, 'messages'));
  assert.equal(wantMore(told, { arrivesBy: 'messages' })[0]?.kind, 'source');
});

test('HIDE IS KEPT: hidden next steps are none, and a hidden first Today offers no card either', () => {
  const told = boot(SHOP, { [projects]: 3 });
  assert.deepEqual(wantMore(told, { nextStepsHidden: true }), []);
  assert.equal(showTell(boot(SHOP), { nextStepsHidden: true }), false);
  assert.equal(showTell(boot(SHOP), { nextStepsHidden: false }), true);
});

test('A COUNT THAT IS NOT A COUNT, from an older host or a broken answer, adds nothing', () => {
  const odd = { registers: [{ id: projects, name: 'Projects', count: Number.NaN }, { id: 'clients', name: 'Clients', count: -2 }] };
  assert.equal(addedByHand(odd), 0);
  assert.equal(showTell(odd), true);
});

test('THE CARD SAYS ITS COUNT AS A WORD, and the receipt names each entry by what its list calls one', () => {
  assert.equal(countWord(3), 'three');
  assert.equal(countWord(8), 'eight');
  assert.equal(countWord(12), '12');
  const lists = [
    { id: 'orders', name: 'Orders', one: 'Order' },
    { id: 'people', name: 'People', one: 'client' },
    { id: 'ledger', name: 'Ledger', one: 'payment' },
    { id: 'notes', name: 'Notes', one: '' },
  ];
  const made = ['orders', 'people', 'ledger'].map((register, i) => ({ register, seq: i + 1, title: 'x' }));
  assert.equal(addedSaid(made, lists), 'Added an order, a client and a payment');
  assert.equal(addedSaid([{ register: 'orders' }], lists), 'Added an order');
  assert.equal(addedSaid([{ register: 'notes' }, { register: 'gone' }], lists), 'Added one in Notes and one in your BrainDog');
  for (const line of [addedSaid(made, lists), addedSaid([{ register: 'gone' }], lists)]) {
    assert.doesNotMatch(line, /—|\brow\b|entity/u, 'no em dash, no "row", no ids');
  }
});

test('THE LISTS A SENTENCE IS READ AGAINST are the ones boot says she holds and this tab has learnt', () => {
  const decl = (id: string) => ({ id, name: id, one: id, title: 'name', fields: [] });
  const b = { registers: [{ id: 'orders', name: 'Orders', count: 0 }, { id: 'people', name: 'People', count: 0 }, { id: 'unlearnt', name: 'X', count: 0 }] };
  assert.deepEqual(
    tellLists(b, { orders: decl('orders'), people: decl('people'), elsewhere: decl('elsewhere') }).map((l) => l.id),
    ['orders', 'people'],
  );
});

test('ADD, THEN UNDO: the receipt names all three, and its one Undo asks the record to put back the whole batch', async () => {
  /* TellOne.svelte's press, through the same runner the app's `run` is: the capture answers `{ batch, made }`, and the
     receipt's Undo is the record's `undo({ batch })` (record capture.test.ts holds that it takes the new client back
     with her order). Here: the batch reaches it, once, and the screen is read again after. */
  const said: { text: string; undo?: () => void }[] = [];
  const asked: string[] = [];
  let reads = 0;
  const { run } = optimist(
    { push: (text, opts) => (said.push({ text, ...(opts?.undo ? { undo: opts.undo } : {}) }), said.length) },
    {
      undoBatch: async (batch) => (asked.push(batch), { from: 'undone', put: 3, skipped: [], said: 'Put back 3 changes.' }),
      reread: () => void (reads += 1),
    },
  );
  const lists = [
    { id: 'orders', name: 'Orders', one: 'order' },
    { id: 'clients', name: 'Clients', one: 'client' },
    { id: 'transactions', name: 'Money', one: 'payment' },
  ];
  const made = lists.map((l, i) => ({ register: l.id, seq: i + 1, title: l.one }));
  const out = await run({
    apply: () => {},
    revert: () => {},
    send: async () => ({ ok: true as const, value: { batch: '01J9CAPTURE', made } }),
    said: (value) => addedSaid(value.made, lists),
  });
  assert.equal(out.ok, true);
  assert.equal(said[0]?.text, 'Added an order, a client and a payment');
  assert.ok(said[0]?.undo, 'the receipt carries one Undo');
  said[0]!.undo!();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, ['01J9CAPTURE'], 'one Undo, the whole batch');
  assert.equal(said[1]?.text, 'Put back 3 changes.');
  assert.equal(reads, 1, 'the screen is read again, so the card comes back on an empty record');
});
