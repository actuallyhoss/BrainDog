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
  return { id, name: d.name, title: d.title, fields: d.fields, pack, ...(d.one ? { one: d.one } : {}), ...(d.state ? { state: d.state } : {}), ...(d.icon ? { icon: d.icon } : {}) };
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

  assert.deepEqual(order!.fields, { what: 'Vanilla jars', who: { $row: 0 }, how_many: 3, due: '2026-10-09', paid: { amount: 90000, currency: 'EGP' } });
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
  assert.equal(paid!.said, 'EGP\u00a0900 from Nadia, by InstaPay');
  assert.equal(paid!.detail, 'paid, kept in Bills and invoices');
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
  assert.equal(paid.said, 'EGP\u00a0900 from Nadia, by InstaPay');
  assert.equal(paid.detail, 'paid, kept in Ledger');
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
  assert.equal(wax!.said, 'EGP\u00a0200 out, for wax');
  assert.deepEqual(wax!.missing, []);
  const two = tellRead('Nadia wants 3 jars, paid 500, paid US$40', fresh).rows.filter((r) => r.register === 'obligations');
  assert.deepEqual(two.map((r) => r.fields.amount), [{ amount: 50000, currency: 'EGP' }, { amount: 4000, currency: 'USD' }]);
  assert.deepEqual(two.map((r) => r.fields.party), [{ $row: 0 }, { $row: 0 }]);
  /* Paid on a day she names is due and paid that day. */
  const monday = tellRead('Mark paid me 50 on Monday', fresh).rows[1]!;
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
  const euros = tellRead('Nadia paid me 50 euros', shop).rows.find((r) => r.register === 'transactions');
  assert.deepEqual(euros!.fields.amount, { amount: 5000, currency: 'EUR' });
  const code = tellRead('Omar paid me USD 1,200.50 by card', shop).rows.find((r) => r.register === 'transactions');
  assert.deepEqual(code!.fields.amount, { amount: 120050, currency: 'USD' });
  assert.equal(code!.said, '$1,200.50 from Omar, by card');
  const pounds = tellRead('Omar paid me 300 pounds', shop).rows.find((r) => r.register === 'transactions');
  assert.deepEqual(pounds!.fields.amount, { amount: 30000, currency: 'EGP' });
});

test('an amount it cannot put a currency to is left, never guessed', () => {
  const { rows, left } = tellRead('Omar paid me 300 dollars', shop);
  assert.ok(!rows.some((r) => r.register === 'transactions'));
  assert.deepEqual(left, ['Omar paid me 300 dollars']);
  assert.ok(!tellRead('Omar paid me 300', { ...shop, currency: null }).rows.some((r) => r.register === 'transactions'));
});

test('money the reader paid goes out, for what they said', () => {
  const { rows } = tellRead('I paid 200 for wax', shop);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.fields.direction, 'out');
  assert.equal(rows[0]!.fields.what, 'Wax');
  assert.equal(rows[0]!.said, 'EGP\u00a0200 out, for wax');
});

test('a pasted message is from the person who sent it', () => {
  const { rows } = tellRead('[09/10, 14:02] Salma: can I get two lavender candles by tomorrow?', shop);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'orders']);
  assert.deepEqual(rows[1]!.fields, { what: 'Lavender candles', who: { $row: 0 }, how_many: 2, due: '2026-10-08' });
  assert.equal(rows[1]!.detail, '2 lavender candles, due tomorrow');
});

test('a self-introduction is the reader, not a new person', () => {
  const { rows } = tellRead("I'm Mariam, Nadia wants 3 vanilla jars for Friday", shop);
  assert.deepEqual(rows.map((r) => r.fields.name ?? r.fields.what), ['Nadia', 'Vanilla jars']);
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
  const { rows } = tellRead('Nadia wants 3 jars, Omar wants 2 jars, Nadia paid me 900', shop);
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
  assert.deepEqual(tellRead('Salma paid me 900 €', shop).rows[1]!.fields.amount, { amount: 90000, currency: 'EUR' });
  assert.deepEqual(tellRead('Nadia paid me 900 and 300', shop).left, ['300']);
});

test('money paid on a weekday or a date of the month is the one gone, and a comma after a figure still parts', () => {
  assert.equal(tellRead('Mark paid me 50 on Monday', shop).rows[1]!.fields.on, '2026-10-05');
  assert.equal(tellRead('Mark paid me 50 on the 12th', shop).rows[1]!.fields.on, '2026-09-12');
  /* "the 12th" is a day, never twelve of anything. */
  assert.deepEqual(tellRead('Mark paid me 50 on the 12th', shop).rows[1]!.fields.amount, { amount: 5000, currency: 'EGP' });
  const { rows } = tellRead('Nadia paid me 900, Omar wants 2 jars', shop);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'transactions', 'people', 'orders']);
});

test('a clause that places nothing leaves no one behind', () => {
  assert.deepEqual(tellRead('Nadia paid me 0', shop), { rows: [], left: ['Nadia paid me 0'] });
});

test('A BARE "$" IS THE RECORD\'S OWN DOLLAR OR A QUESTION, NEVER US DOLLARS ON EVERY RECORD (ruling 438); a code beside it wins', () => {
  const paid = (said: string, currency: string): unknown => tellRead(`Mark paid me ${said}`, { ...fresh, currency }).rows.find((r) => r.register === 'obligations')?.fields.amount;
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

/* A STRANGER'S FIRST REAL THING: it was "EGP 1,200.00 in / into Bills and invoices", with no Lina, and the
   order left as "Not placed". "N things for X" is an order from X, and "she paid" after it is X paying for it. */
test('"14 MUGS FOR LINA, SHE PAID 1200" IS ONE ORDER FROM LINA, paid, on the day the clause names', () => {
  const { rows, left } = tellRead('Firing on Thursday: 14 mugs for Lina, she paid 1200 already', fresh);
  assert.deepEqual(left, []);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'orders', 'obligations']);
  assert.deepEqual(rows[0]!.fields, { name: 'Lina', role: 'client' });
  const order = rows[1]!;
  assert.deepEqual(order.fields, { what: 'Mugs', who: { $row: 0 }, how_many: 14, due: '2026-10-08', paid: { amount: 120000, currency: 'EGP' } });
  assert.equal(order.said, 'An order from Lina');
  assert.equal(order.detail, '14 mugs, due tomorrow, paid');
  const paid = rows[2]!;
  assert.deepEqual(paid.fields.party, { $row: 0 });
  assert.equal(paid.said, 'EGP 1,200 from Lina');
  assert.equal(paid.detail, 'paid, kept in Bills and invoices');
  /* ONE LINE A PERSON READS, never "in" over "into". */
  for (const r of rows) assert.doesNotMatch(`${r.said} ${r.detail}`, /\bin\b.*\binto\b/u);
});

test('a thing "for" a day or for somebody unnamed is no order from anybody', () => {
  assert.ok(!tellRead('14 mugs for Friday', fresh).rows.some((r) => r.register === 'people'));
  assert.ok(!tellRead('Glaze 14 mugs for the market', fresh).rows.some((r) => r.register === 'people'));
});

/* ── a stranger's first sentence, on every starter (first-hour audit AH1, AH2, AH24) ──────────────────────────────── */

const STEPS: TellList = {
  id: 'assignments',
  name: 'Assignments',
  one: 'assignment',
  title: 'what',
  state: 'state',
  fields: [
    { id: 'what', label: 'Assignment', type: 'text', required: true },
    { id: 'state', label: 'Status', type: 'enum', values: ['to_do', 'doing', 'handed_in', 'marked'], default: 'to_do', required: true },
    { id: 'due', label: 'Due', type: 'day', deadline: true },
  ],
};
const THINGS = seeded('portfolio', 'things');
const NUMBERS = seeded('portfolio', 'datapoints');
/* A Wednesday on 7 Oct: a student with People and Assignments and no Money. */
const student = { lists: [PEOPLE, STEPS], today: TODAY, currency: null };
/* A founder before any account: People, Tasks, Projects, Numbers and Money. */
const founder = { lists: [PEOPLE, TASKS, THINGS, NUMBERS, LEDGER, DUE], today: TODAY, currency: 'EGP' };

test('A TASK ON A LIST CALLED ANYTHING: a list with a day it is due by takes a plain line (Assignments, Tickets)', () => {
  const { rows } = tellRead('Essay on Keynes due Friday for Economics', student);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.register, 'assignments');
  assert.deepEqual(rows[0]!.fields, { what: 'Essay on Keynes for Economics', due: '2026-10-09' });
  const exam = tellRead('Exam for Statistics on 20 Nov', student).rows[0]!;
  assert.equal(exam.fields.due, '2026-11-20');
});

test('A TASK ASSIGNED TO SOMEBODY IS THEIRS, and its title is short', () => {
  const { rows } = tellRead('Fix the login timeout bug, assign to Omar, due Tuesday', founder);
  const task = rows.find((r) => r.register === 'tasks')!;
  assert.equal(task.fields.what, 'Fix the login timeout bug');
  assert.equal(task.fields.by, '2026-10-13');
  assert.deepEqual(task.fields.owner, { $row: rows.findIndex((r) => r.register === 'people') });
});

test('SOMEBODY MET IS A PERSON, with their address whole and what was said of them (AH24)', () => {
  const { rows, left } = tellRead('Met Lina from Acme, lina@acme.example, interested in a pilot', founder);
  assert.deepEqual(left, []);
  assert.deepEqual(rows.map((r) => r.register), ['people']);
  assert.equal(rows[0]!.fields.name, 'Lina');
  assert.equal(rows[0]!.fields.email, 'lina@acme.example');
  assert.equal(rows[0]!.fields.note, 'From Acme. Interested in a pilot');
  assert.equal(rows[0]!.fields.role, undefined, 'somebody met is not a client until they order');
});

test('"MET SALMA, HER ADDRESS, SHE WANTS 20 CANDLES" IS SALMA, WITH HER ADDRESS, AND AN ORDER FROM HER', () => {
  const { rows, left } = tellRead('Met Salma Fahmy today, salma@example.com, she wants 20 candles by Friday', fresh);
  assert.deepEqual(left, []);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'orders']);
  assert.equal(rows[0]!.fields.email, 'salma@example.com');
  assert.equal(rows[0]!.said, 'Salma Fahmy, a client');
  assert.deepEqual(rows[1]!.fields.who, { $row: 0 });
  assert.equal(rows[1]!.fields.how_many, 20);
});

test('A TUTOR MET AND A TEAMMATE JOINED ARE PEOPLE', () => {
  const tutor = tellRead('Met my tutor Dr Hana Saleh, hana@uni.example', student).rows[0]!;
  assert.equal(tutor.fields.name, 'Hana Saleh');
  assert.equal(tutor.fields.email, 'hana@uni.example');
  const joined = tellRead('Priya joined the team, priya@team.example', founder).rows;
  assert.deepEqual(joined.map((r) => r.fields.name), ['Priya']);
});

test('A CODE TYPED AFTER THE FIGURE IS ITS CURRENCY, and a payout makes nobody a client (AH2)', () => {
  const { rows } = tellRead('Stripe paid out 1,950 USD today', founder);
  assert.deepEqual(rows.map((r) => r.register), ['obligations']);
  assert.deepEqual(rows[0]!.fields.amount, { amount: 195000, currency: 'USD' });
  assert.equal(rows[0]!.fields.what, 'Payout from Stripe');
  assert.equal(rows[0]!.fields.direction, 'owed_to_me');
});

test('A FIGURE KEPT AN EYE ON IS A NUMBER, and a new project is a project', () => {
  const mrr = tellRead('MRR is 4,200 USD this month', founder).rows;
  assert.deepEqual(mrr.map((r) => r.register), ['datapoints']);
  assert.deepEqual(mrr[0]!.fields.amount, { amount: 420000, currency: 'USD' });
  const p = tellRead('New project: Tallow, a habit tracker app', founder).rows;
  assert.deepEqual(p.map((r) => r.register), ['things']);
  assert.equal(p[0]!.fields.name, 'Tallow');
  assert.equal(p[0]!.fields.about, 'A habit tracker app');
  assert.equal(p[0]!.fields.lane, 'building');
});

test('A BILL TO PAY AND AN INVOICE TO SEND ARE BILLS AND INVOICES, due on the day said', () => {
  const rent = tellRead('Pay rent 12000 on the 1st', founder).rows[0]!;
  assert.equal(rent.register, 'obligations');
  assert.deepEqual(rent.fields, { what: 'Rent', amount: { amount: 1200000, currency: 'EGP' }, direction: 'owed_by_me', due: '2026-11-01', state: 'open' });
  const power = tellRead('Electricity bill 850 due 5 Nov', founder).rows[0]!;
  assert.equal(power.fields.what, 'Electricity bill');
  assert.equal(power.fields.due, '2026-11-05');
  const { rows, left } = tellRead('Invoice Acme 1,200 USD for the logo work, due in 14 days', founder);
  assert.deepEqual(left, []);
  const invoice = rows.find((r) => r.register === 'obligations')!;
  assert.equal(invoice.fields.direction, 'owed_to_me');
  assert.equal(invoice.fields.what, 'Logo work');
  assert.equal(invoice.fields.due, '2026-10-21');
  assert.deepEqual(invoice.fields.amount, { amount: 120000, currency: 'USD' });
  /* With no day, the bill says what it needs, and is never given one. */
  assert.deepEqual(tellRead('Gym membership 900 a month', founder).rows[0]!.missing, ['the day it is due']);
});

test('MONEY LENT OR BORROWED IS OWED BETWEEN YOU AND THEM, never "Not sure" (FB3)', () => {
  const { rows, left } = tellRead('Lent Omar 500 yesterday', founder);
  assert.deepEqual(left, []);
  const lent = rows.find((r) => r.register === 'obligations')!;
  assert.equal(lent.fields.what, 'Lent to Omar');
  assert.equal(lent.fields.direction, 'owed_to_me');
  assert.deepEqual(lent.fields.amount, { amount: 50000, currency: 'EGP' });
  assert.equal(lent.fields.due, undefined);
  assert.ok(rows.some((r) => r.register === 'people' && r.fields.name === 'Omar'));
  const owe = tellRead('Borrowed 300 from Sara, pay back by Friday', founder).rows.find((r) => r.register === 'obligations')!;
  assert.equal(owe.fields.direction, 'owed_by_me');
  assert.equal(owe.fields.what, 'Borrowed from Sara');
  const owed = tellRead('Omar owes me 200', founder).rows.find((r) => r.register === 'obligations')!;
  assert.equal(owed.fields.direction, 'owed_to_me');
  assert.equal(owed.fields.what, 'Omar owes you');
  assert.equal(tellRead('I owe Sara 150', founder).rows.find((r) => r.register === 'obligations')!.fields.direction, 'owed_by_me');
});

test("A BANK'S TEXT IS MONEY IN THE CURRENCY IT NAMES, never the record's, where and when it was spent", () => {
  const cib = 'CIB: Your card ending 4421 was charged EGP 1,250.00 at CARREFOUR MAADI on 31/10/2026. Avl bal EGP 18,340.55';
  const { rows } = tellRead(cib, { ...founder, currency: 'USD', today: '2026-10-31' });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.fields.amount, { amount: 125000, currency: 'EGP' });
  assert.equal(rows[0]!.fields.what, 'Carrefour Maadi');
  assert.equal(rows[0]!.fields.direction, 'owed_by_me');
  assert.equal(rows[0]!.fields.due, '2026-10-31');
  /* A text that names no currency keeps nothing, and says so. */
  const bare = tellRead('Your card ending 4421 was debited 300 at UBER', founder);
  assert.deepEqual(bare.rows, []);
  assert.ok(bare.why);
});

test('NOTHING PLACED IS SAID, WITH THE WAY ON, never a card over nothing to press (AH1)', () => {
  /* Money said where no money is kept. */
  const paid = tellRead('Paid 300 for textbooks', student);
  assert.deepEqual(paid.rows, []);
  assert.match(paid.why ?? '', /no money/u);
  /* A line no list takes as a task is offered to the lists it could go into. */
  const shopNoTasks = { lists: [PEOPLE, ORDERS, THINGS], today: TODAY, currency: 'EGP' };
  const told = tellRead('Call the printer about the new labels tomorrow', shopNoTasks);
  assert.deepEqual(told.rows, []);
  assert.ok(told.why);
  assert.deepEqual(told.offers?.map((r) => r.register), ['things']);
  /* AJ8: never the record's own lists or Money's parts, whatever their shape. */
  const runs = { ...THINGS, id: 'session', name: 'Agent runs' };
  const plans = { ...THINGS, id: 'plans', name: 'Plans', pack: 'money-core' };
  const own = tellRead('Call the printer about the new labels tomorrow', { ...shopNoTasks, lists: [PEOPLE, ORDERS, runs, plans, THINGS] });
  assert.deepEqual(own.offers?.map((r) => r.register), ['things']);
  /* RI4: a list he made and called Plans, with no Money, is his own and is offered. */
  const his = tellRead('Call the printer about the new labels tomorrow', { ...shopNoTasks, lists: [PEOPLE, ORDERS, runs, { ...THINGS, id: 'plans', name: 'Plans' }, THINGS] });
  assert.ok(his.offers?.some((r) => r.register === 'plans'), 'a list of his own called Plans was never offered');
});

test('A BANK TEXT AND A BILL WORD ARE READ THE WAY THE MONEY MOVED (review 31 Oct g, RG4-RG9, RG16)', () => {
  const on = { ...shop, today: '2026-10-31' };
  const way = (s: string, c: Partial<typeof on> = {}) => tellRead(s, { ...on, ...c }).rows.find((r) => r.register === 'transactions');
  /* RG4: a refund is money back, and money put into the account is in. */
  assert.equal(way('Refund of EGP 500 credited to your card ending 1234 for your purchase at Amazon')?.said, 'EGP 500 in, from Amazon');
  assert.equal(way('EGP 500 transferred to your a/c from Ahmed')?.said, 'EGP 500 in, from Ahmed');
  /* RG5: a balance is never the amount, so a text whose amount names no currency keeps nothing. */
  assert.equal(way('Purchase of 450.00 at CARREFOUR. Your available balance is EGP 12,000.00'), undefined);
  /* RG6: "Rent paid 12000" is the rent paid, out, and nobody called Rent. */
  const rent = tellRead('Rent paid 12000', on).rows;
  assert.deepEqual(rent.map((r) => r.register), ['transactions']);
  assert.equal(rent[0]!.said, 'EGP 12,000 out, for rent');
  /* RG7: a bare "$" is the record's dollar, and a question anywhere else. */
  assert.deepEqual(way('I paid $40 for hosting', { currency: 'CAD' })?.fields.amount, { amount: 4000, currency: 'CAD' });
  /* RG8: lakhs and a decimal comma, by the one money reader. */
  assert.deepEqual(way('INR 1,25,000.00 debited from a/c XX12 at Croma')?.fields.amount, { amount: 12500000, currency: 'INR' });
  assert.deepEqual(way('I paid 12,50 € for coffee')?.fields.amount, { amount: 1250, currency: 'EUR' });
  /* RG9: "30/10" told on 31 Oct is yesterday. */
  assert.equal(way('I paid 900 on 30/10')?.fields.on, '2026-10-30');
  /* RG16: "paid out" with no platform named is money out. */
  assert.equal(way('Paid out 300 to the cleaner')?.said, 'EGP 300 out, for the cleaner');
});

test('A NEW NAME BEFORE A BARE "PAID" IS ASKED WHICH WAY, never made a person who paid you (MC1)', () => {
  const on = { ...shop, today: '2026-10-31' };
  for (const s of ['Plumber paid 300', 'Mark paid 50'])
    assert.deepEqual(tellRead(s, on), { rows: [], left: [s], why: `Did ${s.split(' ')[0]} pay you, or did you pay ${s.split(' ')[0]}?` });
  /* Somebody on the record, or a line that says "paid me", is money in from them. */
  const known = tellRead('Mark paid 50', { ...on, people: [{ seq: 7, name: 'Mark Adel' }] }).rows;
  assert.deepEqual(known.map((r) => [r.register, r.fields.direction]), [['transactions', 'in']]);
  const sara = tellRead('Sara paid me 200', on).rows;
  assert.deepEqual(sara.map((r) => r.register), ['people', 'transactions']);
  assert.equal(sara[1]!.fields.direction, 'in');
  /* "Paid Omar 300" is money out, to Omar, who is new in People (AL2). */
  const omar = tellRead('Paid Omar 300', on).rows;
  assert.deepEqual(omar.map((r) => [r.register, r.fields.direction]), [['people', undefined], ['transactions', 'out']]);
});

test('A PAYOUT, A CARD SPEND AND A DINAR ARE READ THE WAY THEY WERE SAID (review 31 Oct h, RH1, RH5, RH6, RH11-RH13)', () => {
  const on = { ...shop, today: '2026-10-31' };
  const way = (s: string, c: Partial<typeof on> = {}) => tellRead(s, { ...on, ...c }).rows.find((r) => r.register === 'transactions');
  /* RH1: "paid out" after a platform is its payout, never "Did Stripe pay you". */
  const stripe = tellRead('Stripe paid out 1,950 USD today', on);
  assert.equal(stripe.why, undefined);
  assert.deepEqual(stripe.rows.map((r) => r.register), ['transactions']);
  assert.equal(stripe.rows[0]!.fields.direction, 'in');
  assert.deepEqual(stripe.rows[0]!.fields.amount, { amount: 195000, currency: 'USD' });
  /* RH11: and so is "Paid out ... from Stripe". */
  const from = way('Paid out 1,950 USD from Stripe today');
  assert.equal(from?.fields.direction, 'in');
  assert.deepEqual(from?.fields.amount, { amount: 195000, currency: 'USD' });
  /* RH5: a typed "1,250" in dinars is twelve hundred and fifty of them; a point still says the fils. */
  assert.deepEqual(way('I paid 1,250 KWD for rent')?.fields.amount, { amount: 1250000, currency: 'KWD' });
  assert.deepEqual(way('I paid 1,250 for rent', { currency: 'JOD' })?.fields.amount, { amount: 1250000, currency: 'JOD' });
  assert.deepEqual(way('I paid 1.250 KWD for coffee')?.fields.amount, { amount: 1250, currency: 'KWD' });
  /* RH6: a charge or a purchase is out, and a cashback offer after it is no money back. */
  assert.equal(way('EGP 500 charged to your account ending 12 at Netflix')?.fields.direction, 'out');
  assert.equal(way('Purchase of EGP 1,250.00 at CARREFOUR on your card ending 1234. Earn 2% cashback')?.fields.direction, 'out');
  assert.equal(way('EGP 500 refunded to your card ending 1234 for your purchase at Amazon')?.fields.direction, 'in');
  /* MB1: a credit word names the way, whatever purchase it was for. */
  assert.equal(way('EGP 500 credited to your account for purchase return')?.fields.direction, 'in');
  assert.equal(way('EGP 500 refund for your purchase at Amazon')?.fields.direction, 'in');
  /* RK6: a credit word elsewhere, or of a reward or a shop's returns, does not turn a purchase into money in. */
  assert.equal(way('EGP 500 charged on your card ending 1234 at Noon. 5% cashback will be credited to your account')?.fields.direction, 'out');
  assert.equal(way('Purchase of EGP 750 at Carrefour. Points credited: 75')?.fields.direction, 'out');
  assert.equal(way('EGP 900 spent at H&M on your card ending 1234. Free returns within 14 days')?.fields.direction, 'out');
  /* RH12: a limit's own figure is dropped, and the charge after it kept. */
  const limit = way('Your credit limit EGP 50,000 card ending 1234 was charged EGP 500 at Noon');
  assert.deepEqual(limit?.fields.amount, { amount: 50000, currency: 'EGP' });
  assert.equal(limit?.fields.direction, 'out');
  /* RH13: the payment asked about is said back as left beside the order it came with. */
  const mugs = tellRead('14 mugs for Lina, Mark paid 50', on);
  assert.ok(mugs.why);
  assert.deepEqual(mugs.left, ['Mark paid 50']);
});

test('A REFUND AFTER THE AMOUNT, A FEE LINE, A BALANCE FIRST AND "PAID OUT" ARE READ THE WAY THEY WERE SAID (review 31 Oct j, RJ4, RJ5, RJ8)', () => {
  const on = { ...shop, today: '2026-10-31' };
  const way = (s: string, c: Partial<typeof on> = {}) => tellRead(s, { ...on, ...c }).rows.find((r) => r.register === 'transactions');
  /* RJ4: "refund" and "reversal" as nouns after the amount are money back, and "No fees charged" is no charge of it. */
  assert.equal(way('EGP 500 refund credited to your card ending 1234 for your purchase at Amazon')?.fields.direction, 'in');
  assert.equal(way('EGP 1,250.00 reversal for purchase at Carrefour on your card ending 1234')?.fields.direction, 'in');
  assert.equal(way('EGP 500 received in your a/c XX12 from Ahmed. No fees charged.')?.fields.direction, 'in');
  assert.equal(way('EGP 500 charged to your account ending 12 at Netflix')?.fields.direction, 'out');
  /* RJ8: a balance said first, in the order banks print it, is not the spend. */
  const spend = way('Balance available: EGP 45,500. Purchase EGP 500 at Noon on your card ending 1234');
  assert.deepEqual(spend?.fields.amount, { amount: 50000, currency: 'EGP' });
  assert.equal(spend?.fields.direction, 'out');
  /* RJ5: somebody who is no payment provider "paid out" is asked which way. */
  assert.equal(tellRead('Ahmed paid out 300 for the delivery', on).why, 'Did Ahmed pay you, or did you pay Ahmed?');
  /* His own account paying out is money out, through that account or not. */
  assert.equal(way('Paid out 500 from Revolut for the plumber')?.fields.direction, 'out');
  assert.equal(way('Paid out 500 from Revolut for the plumber', { accounts: [{ seq: 2, name: 'Revolut' }] })?.fields.direction, 'out');
  /* And a provider's payout to his bank is in. */
  const stripe = way('Paid out 1,950 USD from Stripe to my bank');
  assert.equal(stripe?.fields.direction, 'in');
  assert.deepEqual(stripe?.fields.amount, { amount: 195000, currency: 'USD' });
});

/* ── audit 31 Oct l: who was paid, plain money lines, the offers, and currencies said by name ────────────────────── */

const RECURRING = seeded('money-core', 'recurring');

test('"PAID NADIA 300 FOR THE LOGO" KEEPS NADIA AND THE LOGO (AL2)', () => {
  const { rows, left } = tellRead('Paid Nadia 300 for the logo', founder);
  assert.deepEqual(left, []);
  assert.deepEqual(rows.map((r) => r.register), ['people', 'obligations']);
  assert.equal(rows[0]!.fields.name, 'Nadia');
  const paid = rows[1]!;
  assert.equal(paid.fields.what, 'Logo');
  assert.equal(paid.fields.direction, 'owed_by_me');
  assert.deepEqual(paid.fields.party, { $row: 0 });
  assert.equal(paid.said, 'EGP\u00a0300 to Nadia, for the logo');
  /* "to Nadia" after the figure is the same, and somebody on the record is linked, never made again. */
  const to = tellRead('I paid 300 to Nadia Samir', { ...founder, people: [{ seq: 4, name: 'Nadia Samir' }] }).rows;
  assert.deepEqual(to.map((r) => r.register), ['obligations']);
  assert.equal(to[0]!.fields.party, 'people#4');
  /* A thing paid for is nobody. */
  assert.ok(!tellRead('Paid Netflix 180', founder).rows.some((r) => r.register === 'people'));
});

test('PLAIN MONEY LINES ARE MONEY, never tasks (AL4)', () => {
  const power = tellRead('Electricity 850 due Thursday', founder).rows;
  assert.deepEqual(power.map((r) => r.register), ['obligations']);
  assert.equal(power[0]!.fields.what, 'Electricity');
  assert.equal(power[0]!.fields.direction, 'owed_by_me');
  assert.equal(power[0]!.fields.due, '2026-10-08');
  const salary = tellRead('Salary 30,000 came in today', founder).rows;
  assert.deepEqual(salary.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_to_me', 'Salary']]);
  assert.deepEqual(salary[0]!.fields.amount, { amount: 3000000, currency: 'EGP' });
  const refund = tellRead('Refund from Amazon 450', founder).rows;
  assert.deepEqual(refund.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_to_me', 'Refund from Amazon']]);
  /* A cost that comes round is Repeating, where the record keeps it, and a bill that repeats where it does not. */
  const netflix = tellRead('Netflix 180 a month', { ...founder, lists: [...founder.lists, RECURRING] }).rows;
  assert.deepEqual(netflix.map((r) => [r.register, r.fields.direction, r.fields.every]), [['recurring', 'out', 'monthly']]);
  assert.deepEqual(netflix[0]!.missing, ['the day it is due']);
  assert.equal(tellRead('Netflix 180 a month', founder).rows[0]!.fields.repeats, 'monthly');
  /* Where nothing is a task list, they are still money, never "Not sure". */
  const personal = { lists: [PEOPLE, LEDGER, DUE], today: TODAY, currency: 'EGP' };
  assert.equal(tellRead('Electricity 850 due Thursday', personal).why, undefined);
  /* A count, a time and a small figure due are not money. */
  for (const s of ['Glaze 14 mugs due Friday', 'Call the bank at 3 tomorrow', 'Chapter 3 due Friday', '3 boxes arrived'])
    assert.ok(!tellRead(s, founder).rows.some((r) => r.register === 'obligations'), s);
});

test("PERSONAL'S TELL OFFERS GOALS, never the agents' Instructions (AL5)", () => {
  const goals: TellList = {
    id: 'goals',
    name: 'Goals',
    one: 'goal',
    title: 'what',
    state: 'state',
    pack: 'usecase-personal',
    fields: [
      { id: 'what', label: 'Goal', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['habit', 'goal'], default: 'goal' },
      { id: 'target', label: 'Aim', type: 'decimal', required: true },
      { id: 'by', label: 'By', type: 'day' },
      { id: 'state', type: 'enum', values: ['active', 'paused', 'done'], default: 'active', required: true },
    ],
  };
  const instructions: TellList = { ...THINGS, id: 'instructions', name: 'Instructions', pack: 'kernel' };
  const told = tellRead('Running: train for the Cairo half marathon', { lists: [PEOPLE, instructions, THINGS, goals, DUE], today: TODAY, currency: 'EGP' });
  assert.deepEqual(told.offers?.map((r) => r.register), ['goals', 'things']);
  assert.equal(told.offers?.[0]!.fields.target, 0);
});

test('A FOREIGN AMOUNT IS SAID BY ITS OWN SIGN, AND "DINARS" IS ASKED IN WORDS (AL8)', () => {
  const mrr = tellRead('MRR is 4,200 USD this month', { ...founder, home: 'EGP' }).rows[0]!;
  assert.equal(mrr.said, 'MRR, $4,200');
  /* "dinars" on an Egyptian record is asked which, by name; said by name, it is read. */
  const asked = tellRead('Sent mum 1,000 dinars', { ...founder, home: 'EGP', held: ['EGP'] });
  assert.deepEqual(asked.rows, []);
  assert.match(asked.why ?? '', /^Which dinars are they: .*Kuwaiti.*\? Say it with the figure, like 1,000 /u);
  const kwd = tellRead('Sent mum 1,000 Kuwaiti dinars', { ...founder, home: 'EGP', held: ['EGP'] }).rows;
  assert.deepEqual(kwd[0]!.fields.amount, { amount: 1000000, currency: 'KWD' });
  /* The record's own dinars need no asking. */
  const held = tellRead('Sent mum 1,000 dinars', { ...founder, home: 'EGP', held: ['EGP', 'JOD'] }).rows;
  assert.deepEqual(held[0]!.fields.amount, { amount: 1000000, currency: 'JOD' });
});

test('MONEY THAT COMES ROUND WITH NO DAY ASKS WHEN IT IS NEXT DUE, and takes the answer (never a day made up)', () => {
  const withRepeating = { ...founder, lists: [...founder.lists, RECURRING] };
  /* Asked as Tell asks which way a payment went, with the entry waiting for its day. */
  const asked = tellRead('Netflix 180 a month', withRepeating);
  assert.equal(asked.why, 'When is it next due? Say the day with it, like on the 5th or next Friday.');
  assert.equal(asked.rows[0]!.fields.next_due, undefined);
  assert.deepEqual(asked.rows[0]!.missing, ['the day it is due']);
  /* A repeating bill, where the record keeps no Repeating, is asked the same. */
  assert.equal(tellRead('Gym membership 900 a month', founder).why, 'When is it next due? Say the day with it, like on the 5th or next Friday.');
  /* The answer, said with the line in any of the ways a person says it. */
  for (const said of ['Netflix 180 a month on the 5th', 'Netflix 180 a month, next on the 5th', 'Netflix 180 a month next due 5 Nov', 'Netflix 180 a month, next due 5 Nov']) {
    const told = tellRead(said, withRepeating);
    assert.equal(told.why, undefined, said);
    assert.deepEqual(told.left, [], said);
    assert.equal(told.rows.length, 1, said);
    assert.equal(told.rows[0]!.fields.what, 'Netflix', said);
    assert.equal(told.rows[0]!.fields.next_due, '2026-11-05', said);
    assert.deepEqual(told.rows[0]!.missing, [], said);
  }
  const friday = tellRead('Netflix 180 a month next Friday', withRepeating);
  assert.equal(friday.why, undefined);
  assert.equal(typeof friday.rows[0]!.fields.next_due, 'string');
});

/* ── review 31 Oct l: no way nobody said, and nobody who is a place or a company ─────────────────────────────────── */

test('A PLAIN MONEY LINE THAT SAYS NO WAY IS ASKED, never kept as in or out (RL5)', () => {
  const inOrOut = 'Is that money you get, or money you pay? Say which with it, like got 12,000 or paid 12,000.';
  assert.deepEqual(tellRead('Wages 12,000 due Friday', founder), { rows: [], left: ['Wages 12,000 due Friday'], why: inOrOut });
  assert.deepEqual(tellRead('Acme 1,200 due Friday', founder), { rows: [], left: ['Acme 1,200 due Friday'], why: 'Did Acme pay you, or did you pay Acme?' });
  for (const [s, who] of [
    ['Bonus for Omar 500', 'Omar'],
    ['Commission to Sara 3,000', 'Sara'],
    ["Omar's deposit 2,000 due Monday", 'Omar'],
    ['Omar 3,000 a month', 'Omar'],
  ] as const) {
    const told = tellRead(s, founder);
    assert.deepEqual(told.rows, [], s);
    assert.equal(told.why, `Did ${who} pay you, or did you pay ${who}?`, s);
  }
  const kids = tellRead('Allowance for the kids 500 a week', { ...founder, lists: [...founder.lists, RECURRING] });
  assert.deepEqual(kids.rows, []);
  assert.match(kids.why ?? '', /^Is that money you get, or money you pay\?/u);
  /* A word of arriving, "from", "my" or a thing paid for still settles it. */
  assert.equal(tellRead('Salary 30,000 came in today', founder).rows[0]!.fields.direction, 'owed_to_me');
  assert.equal(tellRead('My salary 30,000', founder).rows[0]!.fields.direction, 'owed_to_me');
  assert.equal(tellRead('Refund from Amazon 450', founder).rows[0]!.fields.direction, 'owed_to_me');
  assert.equal(tellRead('Electricity 850 due Thursday', founder).rows[0]!.fields.direction, 'owed_by_me');
  assert.equal(tellRead('Vodafone 450 due Friday', founder).rows[0]!.fields.direction, 'owed_by_me');
});

test('A PLACE, A COMPANY OR A BANK AFTER "TO" OR "PAID" IS NOBODY NEW (RL7)', () => {
  const dubai = tellRead('Paid 2,000 for tickets to Dubai', founder).rows;
  assert.ok(!dubai.some((r) => r.register === 'people'));
  assert.equal(dubai[0]!.fields.what, 'Tickets to Dubai');
  for (const s of ['Paid Vodafone 450', 'Sent CIB 1,000', 'Paid Etisalat 300', 'Paid 500 to Carrefour', 'Paid 900 to Cairo Airways'])
    assert.ok(!tellRead(s, founder).rows.some((r) => r.register === 'people'), s);
  assert.equal(tellRead('Paid Vodafone 450', founder).rows[0]!.fields.what, 'Vodafone');
  /* Somebody who reads as a person, or is already in People, is still the payee. */
  assert.deepEqual(tellRead('Paid Nadia 300 for the logo', founder).rows.map((r) => r.register), ['people', 'obligations']);
  assert.equal(tellRead('Paid Dubai 300', { ...founder, people: [{ seq: 9, name: 'Dubai' }] }).rows[0]!.fields.party, 'people#9');
});

/* ── audit 31 Oct m: what money was for, a team's lines, a bill said first ───────────────────────────────────────── */

const ORGS = seeded('people', 'organisations');

test('MONEY KEEPS WHAT IT WAS FOR AND WHERE (AM8)', () => {
  const personal = { lists: [PEOPLE, DUE], today: TODAY, currency: 'EGP' };
  const groceries = tellRead('Spent 850 on groceries at Carrefour', personal).rows;
  assert.deepEqual(groceries.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_by_me', 'Groceries at Carrefour']]);
  assert.equal(groceries[0]!.said, 'EGP\u00a0850 at Carrefour, for groceries');
  /* On the Ledger the shop is who was paid. */
  const ledger = tellRead('Spent 850 on groceries at Carrefour', shop).rows[0]!;
  assert.equal(ledger.fields.direction, 'out');
  assert.equal(ledger.fields.counterparty_text, 'Carrefour');
  const salary = tellRead('Got paid 45,000 salary today', personal).rows;
  assert.deepEqual(salary.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_to_me', 'Salary']]);
  assert.equal(salary[0]!.said, 'EGP\u00a045,000 in, salary');
  /* "Bought wax for 2,300" is money out, never offered to Projects or Organisations. */
  const wax = tellRead('Bought wax for 2,300', { lists: [PEOPLE, ORDERS, THINGS, ORGS, DUE], today: TODAY, currency: 'EGP' });
  assert.equal(wax.offers, undefined);
  assert.deepEqual(wax.rows.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_by_me', 'Wax']]);
  assert.deepEqual(wax.rows[0]!.fields.amount, { amount: 230000, currency: 'EGP' });
  /* A count bought for somebody is still their order. */
  assert.ok(tellRead('Bought 3 candles for Salma', fresh).rows.some((r) => r.register === 'orders'));
});

test('A SERVICE SAID FIRST IS A BILL TO PAY, AND A SALARY THAT COMES ROUND IS MONEY IN (rl-tell)', () => {
  const dentist = tellRead('Dentist 800 due Monday', founder);
  assert.equal(dentist.why, undefined);
  assert.deepEqual(dentist.rows.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_by_me', 'Dentist']]);
  const withRepeating = { ...founder, lists: [...founder.lists, RECURRING] };
  const salary = tellRead('Salary 30,000 a month', withRepeating).rows;
  assert.deepEqual(salary.map((r) => [r.register, r.fields.direction, r.fields.every]), [['recurring', 'in', 'monthly']]);
  /* Where no Repeating is kept, an invoice to come in that repeats, never one payment made today. */
  const owed = tellRead('Salary 30,000 a month', founder).rows[0]!;
  assert.deepEqual([owed.register, owed.fields.direction, owed.fields.repeats, owed.fields.state], ['obligations', 'owed_to_me', 'monthly', 'open']);
  /* Wages and a salary for somebody are still asked. */
  assert.ok(tellRead('Wages 12,000 due Friday', founder).why);
  assert.equal(tellRead('Salary for Omar 5,000', founder).why, 'Did Omar pay you, or did you pay Omar?');
});

test("TEAM'S TELL: A SPRINT IS A SPRINT, A PROSPECT KEEPS THEIR COMPANY, AND A TRAILING NAME IS WHO IT IS FOR (AM12)", () => {
  const sprints: TellList = {
    id: 'cycles',
    name: 'Sprints',
    one: 'sprint',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', label: 'Sprint', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['planned', 'active', 'done'], default: 'planned', required: true },
      { id: 'starts', label: 'Starts', type: 'day' },
      { id: 'ends', label: 'Ends', type: 'day' },
    ],
  };
  const team = { lists: [PEOPLE, ORGS, TASKS, sprints], today: TODAY, currency: null };
  const sprint = tellRead('Sprint 14 starts Monday', team).rows;
  assert.deepEqual(sprint.map((r) => [r.register, r.fields.name, r.fields.starts]), [['cycles', 'Sprint 14', '2026-10-12']]);
  const hana = tellRead('Met Hana from Brightside, hana@brightside.example, wants a demo', team);
  assert.deepEqual(hana.left, []);
  assert.deepEqual(hana.rows.map((r) => r.register), ['organisations', 'people']);
  assert.deepEqual(hana.rows[1]!.fields.org, { $row: 0 });
  assert.equal(hana.rows[1]!.fields.note, 'Wants a demo');
  assert.equal(hana.rows[1]!.fields.email, 'hana@brightside.example');
  /* A company already kept is linked, never made twice. */
  const kept = tellRead('Met Hana from Brightside', { ...team, orgs: [{ seq: 3, name: 'Brightside' }] }).rows;
  assert.deepEqual(kept.map((r) => [r.register, r.fields.org]), [['people', 'organisations#3']]);
  const ticket = tellRead('Fix the login bug on Android, Karim, by Tuesday', team).rows;
  const task = ticket.find((r) => r.register === 'tasks')!;
  assert.equal(task.fields.what, 'Fix the login bug on Android');
  assert.deepEqual(task.fields.owner, { $row: ticket.findIndex((r) => r.register === 'people') });
  assert.equal(ticket.find((r) => r.register === 'people')!.fields.name, 'Karim');
});

/* ── review 31 Oct m: a company the record keeps, a service, a month ─────────────────────────────────────────────── */

test('A NAME THE RECORD KEEPS AS NOBODY, A SERVICE HE PAYS OR A MONTH IS NEVER A NEW PERSON OR A PAYER (RM5)', () => {
  const nobody = (s: string, o: Partial<Parameters<typeof tellRead>[1]> = {}) => !tellRead(s, { ...founder, ...o }).rows.some((r) => r.register === 'people');
  /* Halden kept as an organisation, a bill, money that comes round or a past payment is who was paid, never somebody new. */
  for (const titled of [
    { organisations: [{ seq: 2, name: 'Halden' }] },
    { obligations: [{ seq: 5, name: 'Halden' }] },
    { obligations: [{ seq: 6, name: 'Paid to Halden' }] },
    { transactions: [{ seq: 7, name: 'Groceries at Halden' }] },
  ]) {
    assert.ok(nobody('Paid Halden 1,200', { titled }), JSON.stringify(titled));
    assert.equal(tellRead('Paid Halden 1,200', { ...founder, titled }).rows[0]!.said, 'EGP 1,200 to Halden', JSON.stringify(titled));
  }
  assert.ok(nobody('Paid Halden 1,200', { orgs: [{ seq: 2, name: 'Halden' }] }));
  /* A company kept by its whole name is that company said short as well. */
  assert.ok(nobody('Sent Kiln 900', { orgs: [{ seq: 3, name: 'Kiln Studio' }] }));
  /* With nothing kept, somebody who reads as a person is still the payee, and somebody in People always is (AL2). */
  assert.deepEqual(tellRead('Paid Nadia 300 for the logo', founder).rows.map((r) => r.register), ['people', 'obligations']);
  assert.equal(tellRead('Paid Halden 300', { ...founder, people: [{ seq: 9, name: 'Halden' }], titled: { organisations: [{ seq: 2, name: 'Halden' }] } }).rows[0]!.fields.party, 'people#9');
  /* A service he pays, on a record that holds none of them yet. */
  for (const s of ['Paid Netflix 200', 'Paid Spotify 60', 'Paid Uber 200', 'Paid Yango 150']) assert.ok(nobody(s), s);
  for (const s of ['Netflix 200 due Friday', 'Uber 200 due Friday', 'Spotify 60 due Friday', 'Yango 150 due Friday']) {
    const told = tellRead(s, founder);
    assert.equal(told.why, undefined, s);
    assert.deepEqual(told.rows.map((r) => [r.register, r.fields.direction]), [['obligations', 'owed_by_me']], s);
  }
  /* A month is never who paid, and never the first digits of the figure after it. */
  const march = tellRead('Bonus for March 5,000', founder);
  assert.deepEqual(march.rows, []);
  assert.equal(march.why, 'Is that money you get, or money you pay? Say which with it, like got 5,000 or paid 5,000.');
  const rent = tellRead('Rent for March 5,000', founder).rows;
  assert.deepEqual(rent.map((r) => [r.register, r.fields.what, r.fields.amount]), [['obligations', 'Rent for March', { amount: 500000, currency: 'EGP' }]]);
  const omar = tellRead('Paid Omar March 300', founder).rows;
  assert.equal(omar[0]!.fields.name, 'Omar');
});

/* ── audit 31 Oct m: the rent's name and its next day, and money told where none is kept ───────────────────────────── */

test('"RENT 12,000 DUE ON THE 1ST EVERY MONTH" IS "RENT", DUE ON ITS DAY (AM23)', () => {
  const rows = tellRead('Rent 12,000 due on the 1st every month', { ...founder, lists: [...founder.lists, RECURRING] }).rows;
  assert.deepEqual(rows.map((r) => r.register), ['recurring']);
  assert.equal(rows[0]!.said, 'Rent');
  assert.equal(rows[0]!.fields.what, 'Rent');
  assert.ok(!/next tomorrow/u.test(rows[0]!.detail), rows[0]!.detail);
  assert.match(rows[0]!.detail, /\bdue (?:tomorrow|today|on \S+)/u, rows[0]!.detail);
});

test('MONEY TOLD WHERE NONE IS KEPT OFFERS TO TURN MONEY ON (AM4)', () => {
  const told = tellRead('Paid 1,200 USD for the Figma team plan', { lists: [PEOPLE, TASKS], today: TODAY, currency: null });
  assert.equal(told.needsMoney, true);
  assert.deepEqual(told.rows, []);
});

/* ── review 31 Oct n: a salary he pays, a trailing project, a place somebody is from ────────────────────────────────── */

test('A SALARY OR A PENSION THAT NAMES WHO GETS IT IS ASKED, NEVER MONEY IN (RN1)', () => {
  const withRepeating = { ...founder, lists: [...founder.lists, RECURRING] };
  for (const s of ['Salary for the team 45,000 every month', 'Salary Karim 8,000 a month', 'Pension for mum 2,000 a month', 'Salary 45,000 for the team every month']) {
    for (const o of [founder, withRepeating]) {
      const told = tellRead(s, o);
      assert.deepEqual(told.rows, [], s);
      assert.ok(told.why, s);
    }
  }
  /* A salary said with nothing but its figure and its cadence, "my", or where it came from is still his. */
  assert.deepEqual(tellRead('Salary 30,000 a month', withRepeating).rows.map((r) => [r.register, r.fields.direction]), [['recurring', 'in']]);
  assert.equal(tellRead('Salary 30,000 a month', founder).rows[0]!.fields.direction, 'owed_to_me');
  assert.equal(tellRead('My salary 30,000', founder).rows[0]!.fields.direction, 'owed_to_me');
  assert.equal(tellRead('Salary 30,000 from Acme', founder).rows.find((r) => r.register === 'obligations')!.fields.direction, 'owed_to_me');
});

test('A TRAILING NAME THE RECORD KEEPS AS A PROJECT OR A COMPANY IS NOBODY NEW (RN2)', () => {
  const roomy = { ...founder, titled: { things: [{ seq: 4, name: 'Nook' }] } };
  const fix = tellRead('Fix the login bug, Roomy', roomy).rows;
  assert.ok(!fix.some((r) => r.register === 'people'));
  assert.deepEqual(fix.map((r) => [r.register, r.fields.what, r.fields.thing, r.fields.owner]), [['tasks', 'Fix the login bug', 'things#4', undefined]]);
  /* An organisation tasks do not link to stays in the title. */
  const reply = tellRead('Reply to Priya, Lumen', { ...founder, orgs: [{ seq: 2, name: 'Lumen' }] }).rows;
  assert.ok(!reply.some((r) => r.register === 'people' && r.fields.name === 'Lumen'));
  assert.equal(reply.find((r) => r.register === 'tasks')!.fields.owner, undefined);
  /* A word of how it stands is nobody. */
  const urgent = tellRead('Ship the post, Urgent', founder).rows;
  assert.ok(!urgent.some((r) => r.register === 'people'));
  /* Somebody in People, or a name that reads as a person, is still who it is for. */
  const karim = tellRead('Fix the login bug, Karim', { ...founder, people: [{ seq: 7, name: 'Karim' }] }).rows;
  assert.deepEqual(karim.map((r) => [r.register, r.fields.owner]), [['tasks', 'people#7']]);
});

test('A PLACE SOMEBODY IS FROM IS NO ORGANISATION, AND A KEPT ONE IS FOUND BY ITS SHORT NAME (RN6)', () => {
  const team = { lists: [PEOPLE, ORGS, TASKS], today: TODAY, currency: null };
  const lina = tellRead('Met Lina from Dubai', team).rows;
  assert.deepEqual(lina.map((r) => r.register), ['people']);
  assert.equal(lina[0]!.fields.org, undefined);
  assert.match(String(lina[0]!.fields.note ?? ''), /From Dubai/u);
  const hana = tellRead('Met Hana from Brightside', { ...team, orgs: [{ seq: 3, name: 'Brightside Ltd' }] }).rows;
  assert.deepEqual(hana.map((r) => [r.register, r.fields.org]), [['people', 'organisations#3']]);
});

/* ── audit 31 Oct n: a cost by the month, money already paid, a platform, whole lines, money in ───────────────────── */

test('"HOSTING 45 USD A MONTH" IS A COST THAT COMES ROUND, never "Did Hosting pay you" (AN6)', () => {
  const withRepeating = { ...founder, lists: [...founder.lists, RECURRING] };
  const hosting = tellRead('Hosting 45 USD a month', withRepeating);
  assert.deepEqual(hosting.rows.map((r) => [r.register, r.fields.direction, r.fields.every, r.fields.what]), [['recurring', 'out', 'monthly', 'Hosting']]);
  assert.deepEqual(hosting.rows[0]!.fields.amount, { amount: 4500, currency: 'USD' });
  assert.doesNotMatch(hosting.why ?? '', /pay you/u);
  /* A person named is still asked. */
  assert.equal(tellRead('Omar 3,000 a month', withRepeating).why, 'Did Omar pay you, or did you pay Omar?');
});

test('"MAY RENT 12,000 PAID" IS MONEY ALREADY PAID OUT, NAMED "MAY RENT" (AN7)', () => {
  const told = tellRead('May rent 12,000 paid', founder);
  assert.equal(told.why, undefined);
  assert.deepEqual(told.rows.map((r) => [r.register, r.fields.direction, r.fields.state, r.fields.what]), [['obligations', 'owed_by_me', 'paid', 'May rent']]);
  assert.deepEqual(told.rows[0]!.missing, []);
  assert.match(told.rows[0]!.said, /12,000 out, for May rent$/u);
  /* "Not paid" is still a bill to pay. */
  assert.ok(!tellRead('Rent 12,000 not paid', founder).rows.some((r) => r.fields.state === 'paid'));
});

test('A PLATFORM THAT PAID HIM IS NOBODY IN PEOPLE (AN8)', () => {
  for (const s of ['Got 3,000 from Upwork', 'Got 500 from Fiverr', 'Received 200 USD from PayPal', 'Got 900 from Payoneer']) {
    const told = tellRead(s, founder);
    assert.ok(!told.rows.some((r) => r.register === 'people'), s);
    assert.equal(told.rows.find((r) => r.register === 'obligations')?.fields.direction, 'owed_to_me', s);
  }
  assert.equal(tellRead('Upwork paid 3,000', founder).why, undefined);
  /* Somebody who reads as a person is still made. */
  assert.ok(tellRead('Got 2,000 from Dad', founder).rows.some((r) => r.register === 'people'));
});

test('TELL KEEPS WHOLE LINES: A BIRTHDAY, A UNIT, A PROJECT\'S NUMBER, A SPEND, AND SOMEBODY KEPT (AN9)', () => {
  /* The birthday is said with the person, kept in their note, and among the dates where the record keeps them. */
  const mum = tellRead("Mum's birthday is 14 Nov", founder).rows;
  assert.deepEqual(mum.map((r) => r.register), ['people']);
  assert.match(mum[0]!.detail, /birthday 14 Nov/u);
  assert.match(String(mum[0]!.fields.note), /Birthday 14 Nov/u);
  /* The Dates add-on's list, as its manifest declares it. */
  const DATES: TellList = {
    id: 'fixed_dates',
    name: 'Dates',
    one: 'date',
    title: 'what',
    pack: 'dates',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'day', type: 'day', required: true },
      { id: 'until', type: 'day' },
      { id: 'kind', type: 'enum', values: ['deadline', 'event'], default: 'deadline', required: true },
      { id: 'comes_round', type: 'enum', values: ['no', 'weekly', 'monthly', 'yearly', 'month_start', 'month_end'], default: 'no', required: true },
      { id: 'repeats_from', type: 'day' },
    ],
  };
  const dated = tellRead("Mum's birthday is 14 Nov", { ...founder, lists: [...founder.lists, DATES] }).rows;
  assert.deepEqual(dated.map((r) => [r.register, r.fields.name ?? r.fields.what, r.fields.day, r.fields.comes_round]), [['people', 'Mum', undefined, undefined], ['fixed_dates', "Mum's birthday", '2026-11-14', 'yearly']]);
  const kept = tellRead("Mum's birthday is 14 Nov", { ...founder, lists: [...founder.lists, DATES], people: [{ seq: 3, name: 'Mum' }] }).rows;
  assert.deepEqual(kept.map((r) => r.register), ['fixed_dates']);
  /* "Runway is 9 months" keeps its months. */
  const runway = tellRead('Runway is 9 months', founder).rows;
  assert.deepEqual(runway.map((r) => [r.register, r.fields.name, r.fields.value, r.fields.unit]), [['datapoints', 'Runway', 9, 'months']]);
  assert.equal(runway[0]!.said, 'Runway, 9 months');
  /* "Tallow hit 1,000 signups" is a number for Tallow, linked where Tallow is kept. */
  const signups = tellRead('Tallow hit 1,000 signups', { ...founder, titled: { things: [{ seq: 2, name: 'Tallow' }] } }).rows;
  assert.deepEqual(signups.map((r) => [r.register, r.fields.name, r.fields.value, r.fields.thing]), [['datapoints', 'Signups', 1000, 'things#2']]);
  assert.equal(tellRead('Tallow hit 1,000 signups', founder).rows[0]!.fields.name, 'Tallow signups');
  /* "Uber 85" is money spent, never a task. */
  const uber = tellRead('Uber 85', founder).rows;
  assert.deepEqual(uber.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_by_me', 'Uber']]);
  /* A line that fits nothing and names somebody kept offers their page. */
  const goals: TellList = { id: 'goals', name: 'Goals', one: 'goal', title: 'what', pack: 'usecase-personal', fields: [{ id: 'what', type: 'text', required: true }, { id: 'by', type: 'day' }] };
  const mona = tellRead('Coffee with Mona on Sunday', { lists: [PEOPLE, goals, DUE], today: TODAY, currency: 'EGP', people: [{ seq: 6, name: 'Mona Adel' }] });
  assert.deepEqual(mona.about, { name: 'Mona Adel', href: '/r/people/6' });
  assert.match(mona.why ?? '', /Mona Adel/u);
});

test('MONEY IN THAT NOBODY OWED IS NEVER "KEPT IN BILLS" (AN10)', () => {
  const personal = { lists: [PEOPLE, DUE], today: TODAY, currency: 'EGP' };
  const salary = tellRead('Got paid 45,000 salary today', personal).rows[0]!;
  assert.equal(salary.fields.what, 'Salary');
  assert.equal(salary.detail, 'kept in Money');
  /* A client's payment is still the invoice it settles. */
  assert.equal(tellRead(NADIA, fresh).rows[2]!.detail, 'paid, kept in Bills and invoices');
});

/* ── review 31 Oct o: paid only when it was, a platform that pays him, a number a thing is known by, a count, a day gone ── */

test('"ISN\'T PAID", "WILL GET PAID" AND "HALF PAID" ARE NEVER PAID IN FULL (RO1)', () => {
  for (const s of ["Rent 12,000 isn't paid", "Rent 12,000 hasn't been paid", "Rent 12,000 wasn't paid", 'Rent 12,000 never paid', 'Rent 12,000 will get paid', 'Rent 12,000 gets paid on the 1st', 'Rent 12,000 half paid', 'Rent 12,000 partly paid'])
    assert.ok(!tellRead(s, founder).rows.some((r) => r.fields.state === 'paid'), s);
  /* Not paid yet is a bill to pay, named without the words that said so. */
  const owed = tellRead("Rent 12,000 isn't paid", founder).rows;
  assert.deepEqual(owed.map((r) => [r.register, r.fields.direction, r.fields.what]), [['obligations', 'owed_by_me', 'Rent']]);
  /* Part of it paid asks how much. */
  const half = tellRead('Rent 12,000 half paid', founder);
  assert.deepEqual(half.rows, []);
  assert.equal(half.why, 'How much of the 12,000 was paid? Say it with the figure, like paid 6,000 for rent.');
  /* Paid is still paid. */
  assert.equal(tellRead('Rent 12,000 already paid', founder).rows[0]!.fields.state, 'paid');
});

test('A FIGURE AFTER A PLATFORM THAT PAYS HIM IS ASKED WHICH WAY, never money spent (RO2)', () => {
  for (const s of ['App Store 1,200 USD', 'Apple 1,200', 'YouTube 3,000', 'Airbnb 4,500', 'Amazon 2,000', 'Booking.com 900', 'Stripe 1,200', 'Gumroad 300']) {
    const told = tellRead(s, founder);
    assert.deepEqual(told.rows, [], s);
    assert.match(told.why ?? '', /^Is that money you get, or money you pay\?/u, s);
  }
  /* A ride, a meal or a subscription is still money spent today (23 Oct). */
  for (const s of ['Uber 85', 'Netflix 180', 'Talabat 240']) assert.deepEqual(tellRead(s, founder).rows.map((r) => [r.register, r.fields.direction]), [['obligations', 'owed_by_me']], s);
});

test('A NUMBER A THING IS KNOWN BY IS NEVER THE AMOUNT (RO3)', () => {
  for (const s of ['Order 57 paid', 'Invoice 1042 paid', 'Order #57 paid', 'Bill 1042 paid']) {
    const told = tellRead(s, founder);
    assert.deepEqual(told.rows, [], s);
    assert.match(told.why ?? '', /^How much was paid for /u, s);
  }
  assert.equal(tellRead('Order 57 paid', founder).why, 'How much was paid for Order 57, and which way? Say it like got 1,350 for Order 57 or paid 1,350 for Order 57.');
  /* With the amount said beside it, the number stays in the name. */
  const paid = tellRead('Invoice 1042 3,000 paid', founder).rows;
  assert.deepEqual(paid.map((r) => [r.register, r.fields.what, r.fields.amount]), [['obligations', 'Invoice 1042', { amount: 300000, currency: 'EGP' }]]);
  assert.deepEqual(tellRead('Paid 900 for order 57', founder).left, []);
  /* A bill's own figure is still its amount. */
  assert.equal(tellRead('Electricity bill 850 paid', founder).rows[0]!.fields.state, 'paid');
});

test('A COUNT, OR WHAT HE SELLS, SAID WITH A FIGURE IS NO SPEND (RO4)', () => {
  for (const s of ['Tickets 40', 'Books 3', 'Classes 4', 'Lessons 2', 'Flights 2', 'Training 15,000', 'Course 3,000', 'Delivery 50']) {
    const told = tellRead(s, founder);
    assert.deepEqual(told.rows, [], s);
    assert.match(told.why ?? '', /^Is that money you get, or money you pay\?/u, s);
  }
  /* With a currency, or a figure that reads as money, a count of things bought is spent. */
  assert.equal(tellRead('Tickets 400', founder).rows[0]!.fields.direction, 'owed_by_me');
  assert.equal(tellRead('Books 30 EGP', founder).rows[0]!.fields.direction, 'owed_by_me');
  /* A word his own Products list holds is never a spend. */
  const PRODUCTS: TellList = { id: 'products', name: 'Products', one: 'product', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
  const candles = tellRead('Candles 300', { ...founder, lists: [...founder.lists, PRODUCTS], titled: { products: [{ seq: 1, name: 'Lavender candles' }] } });
  assert.deepEqual(candles.rows, []);
  assert.match(candles.why ?? '', /^Is that money you get, or money you pay\?/u);
});

test('A DAY GONE ON A SPEND IS WHEN IT WAS SPENT, never the next one to come (RO5)', () => {
  const uber = tellRead('Uber 85 on Monday', founder).rows;
  assert.deepEqual(uber.map((r) => [r.register, r.fields.direction, r.fields.what, r.fields.due]), [['obligations', 'owed_by_me', 'Uber', '2026-10-05']]);
  assert.equal(tellRead('Coffee 45 on 6 Oct', founder).rows[0]!.fields.due, '2026-10-06');
  assert.equal(tellRead('Taxi 60 on 5/10', founder).rows[0]!.fields.due, '2026-10-05');
  /* A day to come is still a bill to pay. */
  const due = tellRead('Uber 200 due Friday', founder).rows;
  assert.deepEqual(due.map((r) => [r.register, r.fields.direction, r.fields.due]), [['obligations', 'owed_by_me', '2026-10-09']]);
  assert.notEqual(due[0]!.fields.state, 'paid');
});

test('SEATS, LICENCES, SOFTWARE AND ADS ASK WHICH WAY; HOSTING IS STILL A COST (RO6)', () => {
  const withRepeating = { ...founder, lists: [...founder.lists, RECURRING] };
  for (const s of ['Seats 1,200 a month', 'Licences 4,000 a month', 'Software 900 a month', 'Ads paid 300']) {
    const told = tellRead(s, withRepeating);
    assert.deepEqual(told.rows, [], s);
    assert.match(told.why ?? '', /^Is that money you get, or money you pay\?/u, s);
  }
  assert.equal(tellRead('Hosting 45 USD a month', withRepeating).rows[0]!.fields.direction, 'out');
});

test("A DAY OR A TIME IS NEVER A NUMBER'S UNIT, AND SOMEBODY IS NO NUMBER (RO7)", () => {
  const sales = tellRead('Sales were 40 yesterday', founder).rows;
  assert.deepEqual(sales.map((r) => [r.register, r.fields.name, r.fields.value, r.fields.unit]), [['datapoints', 'Sales', 40, undefined]]);
  assert.equal(tellRead('MRR is 4,200 now', founder).rows[0]!.fields.unit, undefined);
  for (const s of ['Karim is at 3pm', 'Sara is at 3 meetings', 'Sara hit 3 meetings']) assert.ok(!tellRead(s, founder).rows.some((r) => r.register === 'datapoints'), s);
  /* A project's number is still its own. */
  assert.equal(tellRead('Tallow hit 1,000 signups', founder).rows[0]!.fields.name, 'Tallow signups');
});

test('A NAME ENDING IN "ING" CAN BE SOMEBODY; A WORD FOR WORK STAYS NOBODY (RO8)', () => {
  const meiling = tellRead('Meiling paid me 300', founder).rows;
  assert.deepEqual(meiling.map((r) => r.register), ['people', 'obligations']);
  assert.equal(meiling[0]!.fields.name, 'Meiling');
  assert.deepEqual(tellRead('Paid Xiaoling 300', founder).rows.map((r) => r.register), ['people', 'obligations']);
  assert.ok(!tellRead('Paid Cleaning 300', founder).rows.some((r) => r.register === 'people'));
});
