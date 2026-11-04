/**
 * A first Today offers the card to tell it one real thing while nothing is added, then the next steps until they are
 * hidden, one at a time, as use case 6 draws them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstPartyDocument } from '@braindog/seed/packs';

import { addedByHand, addedSaid, countWord, heldSaid, readyRows, showTell, tellLists } from './first-today.ts';
import { wantMore } from './want-more.ts';
import { optimist } from '../data/optimistic.ts';
import { madeSteps } from '../start/made.ts';
import { listsOfModules, playedBy } from '../start/parts.ts';
import type { FieldDecl } from '../record/schema.ts';
import { tellRead, type TellList } from '../tell/read.ts';

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
  /* THE RECORD'S OWN LISTS, by their names (uc6-today-49), so the agent line says them as this record does. */
  const lists = told.registers;
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
  assert.equal(addedSaid([{ register: 'notes' }, { register: 'gone' }], lists), 'Added something in Notes and something in your BrainDog');
  for (const line of [addedSaid(made, lists), addedSaid([{ register: 'gone' }], lists)]) {
    assert.doesNotMatch(line, /—|\brow\b|entity|\bone in\b/u, 'no em dash, no "row", no ids, no "one in"');
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

test('WHAT ONE PRESS ADDS IS WHAT IS READY: a payment with no account stays behind, and a pointer is counted over what is sent', () => {
  const nadia = { register: 'people', fields: { name: 'Nadia' }, missing: [] };
  const payment = { register: 'transactions', fields: { amount: { minor: 90000, currency: 'EGP' }, who: { $row: 0 } }, missing: ['account'] };
  const order = { register: 'orders', fields: { what: '3 vanilla jars', who: { $row: 0 } }, missing: [] };
  assert.deepEqual(readyRows([nadia, payment, order]), [
    { register: 'people', fields: { name: 'Nadia' } },
    { register: 'orders', fields: { what: '3 vanilla jars', who: { $row: 0 } } },
  ]);
  /* AN ENTRY POINTING AT ONE THAT STAYS BEHIND STAYS TOO, and so does one pointing at that, since the record writes a
     capture all or none and a pointer to an entry not sent names nothing. */
  const unnamed = { register: 'people', fields: {}, missing: ['name'] };
  const owes = { register: 'orders', fields: { what: 'Candles', who: { $row: 0 } }, missing: [] };
  const paid = { register: 'transactions', fields: { for: [{ $row: 1 }] }, missing: [] };
  const later = { register: 'tasks', fields: { what: 'Wrap them' }, missing: [] };
  assert.deepEqual(readyRows([unnamed, owes, paid, later]), [{ register: 'tasks', fields: { what: 'Wrap them' } }]);
  assert.deepEqual(readyRows([]), []);
});

/* ── the receipt, read from the real lists ───────────────────────────────── */

type Declared = { register?: string; name: string; one?: string; title: string; fields: FieldDecl[]; state?: string; done?: string[] };

/** One of a first-party pack's lists, as the record holds it: People says "person" and Bills and invoices "item". */
function seeded(pack: string, id: string): TellList {
  const d = ((firstPartyDocument(pack as never)?.declarations ?? []) as Declared[]).find((x) => x.register === id);
  assert.ok(d, `${pack} declares ${id}`);
  return { id, name: d.name, title: d.title, fields: d.fields, pack, ...(d.one ? { one: d.one } : {}), ...(d.state ? { state: d.state } : {}), ...(d.done ? { done: d.done } : {}) };
}

const ORDERS: TellList = {
  id: 'orders',
  name: 'Orders',
  one: 'order',
  title: 'what',
  fields: [
    { id: 'who', type: 'ref', to: 'people' },
    { id: 'what', type: 'text', required: true },
    { id: 'how_many', type: 'int' },
    { id: 'due', type: 'day', deadline: true },
    { id: 'paid', type: 'money' },
  ],
};
const NADIA = 'Nadia wants 3 vanilla jars for Friday, paid 900 on InstaPay';
const LISTS = [seeded('people', 'people'), ORDERS, seeded('money-core', 'transactions'), seeded('money-core', 'obligations')];
const FRESH = { lists: LISTS, today: '2026-10-07', currency: 'EGP' };

/** The press, as TellOne.svelte makes it: what is ready is sent, the capture answers in that order, the receipt reads it. */
function press(opts: typeof FRESH & { accounts?: { seq: number; name: string }[] }): { said: string; sent: number } {
  const { rows } = tellRead(NADIA, opts);
  const sent = readyRows(rows);
  const made = sent.map((r, i) => ({ register: r.register, seq: i + 1, title: 'x' }));
  const said = [addedSaid(made.map((m, i) => ({ register: m.register, fields: sent[i]?.fields })), opts.lists), heldSaid(rows)].filter((l) => l !== '').join('. ');
  return { said, sent: sent.length };
}

test('NADIA ON A FRESH SHOP: all three go in one press, and the receipt reads "Added an order, a client and a payment"', () => {
  const fresh = press(FRESH);
  assert.equal(fresh.sent, 3);
  assert.equal(fresh.said, 'Added an order, a client and a payment');
  assert.doesNotMatch(fresh.said, /\ba person\b|\ban item\b|\bone in\b|—/u);
  /* A record that holds an account keeps the payment on its Ledger, and the receipt says the same. */
  assert.equal(press({ ...FRESH, accounts: [{ seq: 1, name: 'InstaPay wallet' }] }).said, 'Added an order, a client and a payment');
});

test('AN ENTRY HELD BACK IS SAID ON THE RECEIPT with what it needs, and the rest still go', () => {
  /* Accounts held but none this sentence names: the payment waits for one, the client and the order go. */
  const two = { ...FRESH, accounts: [{ seq: 1, name: 'CIB current' }, { seq: 2, name: 'Cash box' }] };
  const out = press(two);
  assert.equal(out.sent, 2);
  assert.match(out.said, /^Added an order and a client\. Not added: EGP\u00a0900 from Nadia, by InstaPay\. It needs [Aa]ccount\.$/u);
  assert.equal(heldSaid([{ register: 'people', fields: {}, missing: [], said: 'Nadia' }]), '');
});

test('THE LISTS CARRY THEIR COUNT, so an account held is known before its name is learnt', () => {
  const decl = (id: string) => ({ id, name: id, one: id, title: 'name', fields: [] });
  const b = { registers: [{ id: 'accounts', name: 'Accounts', count: 2 }, { id: 'people', name: 'People', count: 0 }] };
  assert.deepEqual(tellLists(b, { accounts: decl('accounts'), people: decl('people') }).map((l) => [l.id, l.count]), [['accounts', 2], ['people', 0]]);
});

test('WHAT THE MAKING WROTE IS NOT ADDED BY HAND, so a Guide still offers Tell (AH19)', () => {
  const boot = { registers: [{ id: 'milestones', name: 'Milestones', count: 6 }, { id: 'steps', name: 'Steps', count: 5 }] } as Parameters<typeof addedByHand>[0];
  assert.equal(addedByHand(boot), 11);
  assert.equal(addedByHand(boot, { milestones: 6, steps: 5 }), 0);
  assert.equal(showTell(boot, { madeWith: { milestones: 6, steps: 5 } }), true);
  assert.equal(addedByHand({ registers: [{ id: 'steps', name: 'Steps', count: 6 }] } as Parameters<typeof addedByHand>[0], { steps: 5 }), 1);
});
