/**
 * "Tell it one real thing", read on the device. People, the Ledger and Tasks are the seed's own declarations, so a
 * field renamed there breaks a case here; Orders is the shop's list as its scope declares it (who, what, how many,
 * due, paid, state).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstPartyDocument } from '@braindog/seed/packs';

import type { FieldDecl } from '../record/schema.ts';
import { MOST, tellRead, type TellList } from './read.ts';

type Declared = { register?: string; name: string; one?: string; title: string; fields: FieldDecl[]; state?: string; icon?: string };

/** One of a first-party pack's lists, as the record holds it. */
function seeded(pack: string, id: string): TellList {
  const d = ((firstPartyDocument(pack as never)?.declarations ?? []) as Declared[]).find((x) => x.register === id);
  assert.ok(d, `${pack} declares ${id}`);
  return { id, name: d.name, title: d.title, fields: d.fields, ...(d.one ? { one: d.one } : {}), ...(d.state ? { state: d.state } : {}), ...(d.icon ? { icon: d.icon } : {}) };
}

const PEOPLE = seeded('people', 'people');
const LEDGER = seeded('money-core', 'transactions');
const DUE = seeded('money-core', 'obligations');
const ACCOUNTS = seeded('money-core', 'accounts');
const TASKS = seeded('work', 'tasks');
const ORDERS: TellList = {
  id: 'orders',
  name: 'Orders',
  one: 'order',
  title: 'what',
  icon: 'box',
  state: 'state',
  fields: [
    { id: 'who', type: 'ref', to: 'people' },
    { id: 'what', type: 'text', required: true },
    { id: 'how_many', label: 'How many', type: 'int' },
    { id: 'due', type: 'day', deadline: true },
    /* WHAT THE ORDER COMES TO, as the shop use case declares it (uc6-shop-49). */
    { id: 'total', label: 'Total', type: 'money' },
    { id: 'paid', type: 'money' },
    { id: 'state', type: 'enum', values: ['new', 'ready', 'sent', 'paid'], default: 'new', required: true },
  ],
};

/* A Wednesday, so "Friday" is two days on. */
const TODAY = '2026-10-07';
const NADIA = 'Nadia wants 3 vanilla jars for Friday, paid 900 on InstaPay';
/* A shop as the first run makes it, Money and all, before she has kept an account: Mariam's on day one. */
const fresh = { lists: [PEOPLE, ORDERS, LEDGER, DUE, TASKS], today: TODAY, currency: 'EGP' };
/* The same shop once it holds one account, her InstaPay wallet: what was paid goes on the Ledger. */
const shop = { ...fresh, accounts: [{ seq: 1, name: 'InstaPay wallet' }] };

test('the Nadia sentence on a fresh shop record is a client, an order from her and a paid item owed to her', () => {
  const { rows, left } = tellRead(NADIA, fresh);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'orders', 'obligations']);
  assert.deepEqual(left, []);

  const [person, order, paid] = rows;
  assert.deepEqual(person!.fields, { name: 'Nadia', role: 'client' });
  assert.equal(person!.said, 'Nadia, a client');
  assert.equal(person!.detail, 'new in People');

  assert.deepEqual(order!.fields, { what: 'vanilla jars', who: { $row: 0 }, how_many: 3, due: '2026-10-09', paid: { amount: 90000, currency: 'EGP' } });
  assert.equal(order!.said, 'An order from Nadia');
  assert.equal(order!.detail, '3 vanilla jars, due Friday, paid');
  assert.equal(order!.icon, 'box');
  assert.deepEqual(order!.missing, []);

  /* NO ACCOUNT, NO LEDGER ENTRY: owed to her, already paid, due and paid today, and linked to the new client. */
  assert.deepEqual(paid!.fields, {
    what: 'Payment from Nadia, by InstaPay',
    amount: { amount: 90000, currency: 'EGP' },
    state: 'paid',
    direction: 'owed_to_me',
    due: TODAY,
    settled: TODAY,
    party: { $row: 0 },
  });
  assert.equal(paid!.said, 'EGP 900.00 in, by InstaPay');
  assert.equal(paid!.detail, 'into Bills and invoices, marked paid');
  /* Nothing is missing, so one press adds all three. */
  assert.deepEqual(paid!.missing, []);
});

test('a record that holds an account keeps the payment on its Ledger, filed to that account', () => {
  const { rows } = tellRead(NADIA, shop);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'orders', 'transactions']);
  const paid = rows[2]!;
  assert.equal(paid.fields.direction, 'in');
  assert.deepEqual(paid.fields.amount, { amount: 90000, currency: 'EGP' });
  assert.equal(paid.fields.on, TODAY);
  assert.equal(paid.fields.state, 'cleared');
  assert.equal(paid.fields.account, 'accounts#1');
  assert.equal(paid.fields.what, 'Payment from Nadia, by InstaPay');
  assert.equal(paid.said, 'EGP 900.00 in, by InstaPay');
  assert.equal(paid.detail, 'into Ledger, marked paid');
  assert.deepEqual(paid.missing, []);
});

test('accounts counted but not yet named still mean the Ledger, and which account is asked, never guessed', () => {
  const counted = tellRead(NADIA, { ...fresh, lists: [...fresh.lists, { ...ACCOUNTS, count: 2 }] }).rows[2]!;
  assert.equal(counted.register, 'transactions');
  assert.deepEqual(counted.missing, ['account']);
  /* An accounts list that holds none is a record with no account. */
  assert.equal(tellRead(NADIA, { ...fresh, lists: [...fresh.lists, { ...ACCOUNTS, count: 0 }] }).rows[2]!.register, 'obligations');
});

test('with no account and no Bills and invoices, the Ledger entry says the account it needs', () => {
  const { rows } = tellRead(NADIA, { ...fresh, lists: [PEOPLE, ORDERS, LEDGER, TASKS] });
  assert.equal(rows[2]!.register, 'transactions');
  assert.deepEqual(rows[2]!.missing, ['account']);
});

test('on a fresh record, money the reader paid is a paid item owed by her, and two currencies stay two items', () => {
  const [wax] = tellRead('I paid 200 for wax', fresh).rows;
  assert.deepEqual(wax!.fields, { what: 'Wax', amount: { amount: 20000, currency: 'EGP' }, state: 'paid', direction: 'owed_by_me', due: TODAY, settled: TODAY });
  assert.equal(wax!.said, 'EGP 200.00 out');
  assert.deepEqual(wax!.missing, []);
  const two = tellRead('Nadia wants 3 jars, paid 500, paid US$40', fresh).rows.filter((r) => r.register === 'obligations');
  assert.deepEqual(two.map((r) => r.fields.amount), [{ amount: 50000, currency: 'EGP' }, { amount: 4000, currency: 'USD' }]);
  assert.deepEqual(two.map((r) => r.fields.party), [{ $row: 0 }, { $row: 0 }]);
  /* Paid on a day she names is due and paid that day. */
  const monday = tellRead('Mark paid 50 on Monday', fresh).rows[1]!;
  assert.equal(monday.fields.due, '2026-10-05');
  assert.equal(monday.fields.settled, '2026-10-05');
  for (const r of tellRead(NADIA, fresh).rows) for (const line of [r.said, r.detail]) assert.doesNotMatch(line, /#\d|—|\brow\b|[0-9A-HJKMNP-TV-Z]{26}/u);
});

test('a payment through an account the record holds is filed to it', () => {
  const { rows } = tellRead(NADIA, { ...shop, accounts: [{ seq: 1, name: 'CIB current' }, { seq: 2, name: 'InstaPay wallet' }] });
  assert.equal(rows[2]!.fields.account, 'accounts#2');
  assert.deepEqual(rows[2]!.missing, []);
});

test('a person already on the record is linked, never made twice', () => {
  const { rows } = tellRead(NADIA, { ...shop, people: [{ seq: 4, name: 'Nadia Samir' }] });
  assert.deepEqual(rows.map((r) => r.register), ['orders', 'transactions']);
  assert.equal(rows[0]!.fields.who, 'people#4');
});

test('on a record with no orders list, the same sentence is a client and money in, and the order is said back', () => {
  const { rows, left } = tellRead(NADIA, { ...shop, lists: [PEOPLE, LEDGER, TASKS] });
  assert.deepEqual(rows.map((r) => r.register), ['people', 'transactions']);
  assert.deepEqual(rows[0]!.fields, { name: 'Nadia', role: 'client' });
  assert.equal(rows[1]!.fields.direction, 'in');
  assert.deepEqual(left, ['Nadia wants 3 vanilla jars for Friday']);
});

test('an amount with a currency word keeps it, and one with none takes the record\'s', () => {
  const euros = tellRead('Nadia paid 50 euros', shop).rows.find((r) => r.register === 'transactions');
  assert.deepEqual(euros!.fields.amount, { amount: 5000, currency: 'EUR' });
  const code = tellRead('Omar paid USD 1,200.50 by card', shop).rows.find((r) => r.register === 'transactions');
  assert.deepEqual(code!.fields.amount, { amount: 120050, currency: 'USD' });
  assert.equal(code!.said, 'USD 1,200.50 in, by card');
  const pounds = tellRead('Omar paid 300 pounds', shop).rows.find((r) => r.register === 'transactions');
  assert.deepEqual(pounds!.fields.amount, { amount: 30000, currency: 'EGP' });
});

test('an amount it cannot put a currency to is left, never guessed', () => {
  const { rows, left } = tellRead('Omar paid 300 dollars', shop);
  assert.ok(!rows.some((r) => r.register === 'transactions'));
  assert.deepEqual(left, ['Omar paid 300 dollars']);
  assert.ok(!tellRead('Omar paid 300', { ...shop, currency: null }).rows.some((r) => r.register === 'transactions'));
});

test('money the reader paid goes out, for what they said', () => {
  const { rows } = tellRead('I paid 200 for wax', shop);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.fields.direction, 'out');
  assert.equal(rows[0]!.fields.what, 'Wax');
  assert.equal(rows[0]!.said, 'EGP 200.00 out');
});

test('a pasted message is from the person who sent it', () => {
  const { rows } = tellRead('[09/10, 14:02] Salma: can I get two lavender candles by tomorrow?', shop);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'orders']);
  assert.deepEqual(rows[1]!.fields, { what: 'lavender candles', who: { $row: 0 }, how_many: 2, due: '2026-10-08' });
  assert.equal(rows[1]!.detail, '2 lavender candles, due tomorrow');
});

test('a self-introduction is the reader, not a new person', () => {
  const { rows } = tellRead("I'm Mariam, Nadia wants 3 vanilla jars for Friday", shop);
  assert.deepEqual(rows.map((r) => r.fields.name ?? r.fields.what), ['Nadia', 'vanilla jars']);
});

test('with no list that fits, one task with the words as its title', () => {
  const { rows, left } = tellRead('call the bank tomorrow', shop);
  assert.deepEqual(left, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.register, 'tasks');
  assert.deepEqual(rows[0]!.fields, { what: 'Call the bank', by: '2026-10-08' });
  assert.equal(rows[0]!.detail, 'new in Tasks, due tomorrow');
});

test('nothing becomes more than eight entries, and the rest is said back', () => {
  const names = ['Nadia', 'Omar', 'Salma', 'Karim', 'Laila', 'Youssef'];
  const { rows, left } = tellRead(names.map((n) => `${n} wants 2 jars for Friday`).join('. '), shop);
  assert.equal(rows.length, MOST);
  assert.ok(left.length > 0);
  /* Every link points back at an entry that is in the call. */
  for (const r of rows) for (const v of Object.values(r.fields)) if (typeof v === 'object' && v && '$row' in v) assert.ok(v.$row < rows.indexOf(r));
});

test('nothing typed is nothing', () => {
  assert.deepEqual(tellRead('   ', shop), { rows: [], left: [] });
});

test('nothing a person reads holds an id, an em dash or the word row', () => {
  const { rows } = tellRead(NADIA, shop);
  for (const r of rows) for (const line of [r.said, r.detail]) assert.doesNotMatch(line, /#\d|—|\brow\b|[0-9A-HJKMNP-TV-Z]{26}/u);
});

test('a first name two people share is asked, never guessed and never made a third time', () => {
  const { rows, left } = tellRead(NADIA, { ...shop, people: [{ seq: 4, name: 'Nadia Samir' }, { seq: 5, name: 'Nadia Fahmy' }] });
  assert.deepEqual(rows.map((r) => r.register), ['orders', 'transactions']);
  assert.equal(rows[0]!.fields.who, undefined);
  assert.deepEqual(left, ['which Nadia']);
  /* The whole name settles it. */
  assert.equal(tellRead('Nadia Fahmy wants 2 jars', { ...shop, people: [{ seq: 4, name: 'Nadia Samir' }, { seq: 5, name: 'Nadia Fahmy' }] }).rows[0]!.fields.who, 'people#5');
});

test('a payment is put on an order only when the same person placed it', () => {
  const { rows } = tellRead('Nadia wants 3 jars, Omar wants 2 jars, Nadia paid 900', shop);
  const orders = rows.filter((r) => r.register === 'orders');
  assert.deepEqual(orders.map((r) => r.fields.paid), [undefined, undefined]);
  assert.equal(rows.filter((r) => r.register === 'transactions').length, 1);
});

test('money never mixes two currencies: a second payment adds in only in the same one', () => {
  const same = tellRead('Nadia wants 3 jars, paid 500, paid 400', shop).rows;
  assert.deepEqual(same[1]!.fields.paid, { amount: 90000, currency: 'EGP' });
  assert.equal(same.filter((r) => r.register === 'transactions').length, 2);
  const two = tellRead('Nadia wants 3 jars, paid 500, paid US$40', shop).rows;
  assert.deepEqual(two[1]!.fields.paid, { amount: 50000, currency: 'EGP' });
  assert.deepEqual(two.filter((r) => r.register === 'transactions').map((r) => r.fields.amount), [{ amount: 50000, currency: 'EGP' }, { amount: 4000, currency: 'USD' }]);
  /* A symbol after the figure is still its currency, and a second figure in one clause is said back. */
  assert.deepEqual(tellRead('Salma paid 900 €', shop).rows[1]!.fields.amount, { amount: 90000, currency: 'EUR' });
  assert.deepEqual(tellRead('Nadia paid 900 and 300', shop).left, ['300']);
});

test('money paid on a weekday or a date of the month is the one gone, and a comma after a figure still parts', () => {
  assert.equal(tellRead('Mark paid 50 on Monday', shop).rows[1]!.fields.on, '2026-10-05');
  assert.equal(tellRead('Mark paid 50 on the 12th', shop).rows[1]!.fields.on, '2026-09-12');
  /* "the 12th" is a day, never twelve of anything. */
  assert.deepEqual(tellRead('Mark paid 50 on the 12th', shop).rows[1]!.fields.amount, { amount: 5000, currency: 'EGP' });
  const { rows } = tellRead('Nadia paid 900, Omar wants 2 jars', shop);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'transactions', 'people', 'orders']);
});

test('a clause that places nothing leaves no one behind', () => {
  assert.deepEqual(tellRead('Nadia paid 0', shop), { rows: [], left: ['Nadia paid 0'] });
});

test('A BARE "$" IS THE RECORD\'S OWN DOLLAR OR A QUESTION, NEVER US DOLLARS ON EVERY RECORD (ruling 438); a code beside it wins', () => {
  const paid = (said: string, currency: string): unknown => tellRead(`Mark paid ${said}`, { ...fresh, currency }).rows.find((r) => r.register === 'obligations')?.fields.amount;
  assert.equal(paid('$40', 'EGP'), undefined, 'a dollar on a pound record is asked, not written');
  assert.deepEqual(paid('$40', 'USD'), { amount: 4000, currency: 'USD' });
  assert.deepEqual(paid('$40', 'CAD'), { amount: 4000, currency: 'CAD' });
  for (const said of ['$12 EGP', 'EGP $12', '12$ EGP']) assert.deepEqual(paid(said, 'USD'), { amount: 1200, currency: 'EGP' }, said);
  assert.deepEqual(paid('US$5', 'EGP'), { amount: 500, currency: 'USD' });
  assert.deepEqual(paid('£5', 'EGP'), { amount: 500, currency: 'GBP' });
  assert.deepEqual(paid('E£12', 'USD'), { amount: 1200, currency: 'EGP' });
  assert.deepEqual(paid('900 LE', 'USD'), { amount: 90000, currency: 'EGP' });
});

test("AN AMOUNT SAID BESIDE AN ORDER WITH NO PAYMENT IS WHAT IT COMES TO (uc6-walk-50): the order's total, not a payment", () => {
  for (const tail of ['1,350 not paid yet', 'EGP 1,350', 'total 1,350']) {
    const { rows, left } = tellRead(`Salma wants 6 amber jars for Saturday, ${tail}`, fresh);
    const order = rows.find((r) => r.register === 'orders');
    assert.deepEqual(order?.fields.total, { amount: 135000, currency: 'EGP' }, tail);
    assert.equal(order?.fields.paid, undefined, tail);
    assert.equal(rows.some((r) => r.register === 'obligations' || r.register === 'transactions'), false, tail);
    assert.deepEqual(left, [], tail);
  }
});
