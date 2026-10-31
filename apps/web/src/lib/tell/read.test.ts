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
  assert.equal(wax!.said, 'EGP\u00a0200 out');
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
  assert.equal(code!.said, '$1,200.50\u00a0USD from Omar, by card');
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
  assert.equal(rows[0]!.said, 'EGP\u00a0200 out');
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
  assert.deepEqual(order.fields, { what: 'mugs', who: { $row: 0 }, how_many: 14, due: '2026-10-08', paid: { amount: 120000, currency: 'EGP' } });
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
  assert.equal(rent[0]!.said, 'EGP 12,000 out');
  /* RG7: a bare "$" is the record's dollar, and a question anywhere else. */
  assert.deepEqual(way('I paid $40 for hosting', { currency: 'CAD' })?.fields.amount, { amount: 4000, currency: 'CAD' });
  /* RG8: lakhs and a decimal comma, by the one money reader. */
  assert.deepEqual(way('INR 1,25,000.00 debited from a/c XX12 at Croma')?.fields.amount, { amount: 12500000, currency: 'INR' });
  assert.deepEqual(way('I paid 12,50 € for coffee')?.fields.amount, { amount: 1250, currency: 'EUR' });
  /* RG9: "30/10" told on 31 Oct is yesterday. */
  assert.equal(way('I paid 900 on 30/10')?.fields.on, '2026-10-30');
  /* RG16: "paid out" with no platform named is money out. */
  assert.equal(way('Paid out 300 to the cleaner')?.said, 'EGP 300 out');
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
  /* "Paid Omar 300" is money out, and nobody new. */
  const omar = tellRead('Paid Omar 300', on).rows;
  assert.deepEqual(omar.map((r) => [r.register, r.fields.direction]), [['transactions', 'out']]);
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
  /* RH12: a limit's own figure is dropped, and the charge after it kept. */
  const limit = way('Your credit limit EGP 50,000 card ending 1234 was charged EGP 500 at Noon');
  assert.deepEqual(limit?.fields.amount, { amount: 50000, currency: 'EGP' });
  assert.equal(limit?.fields.direction, 'out');
  /* RH13: the payment asked about is said back as left beside the order it came with. */
  const mugs = tellRead('14 mugs for Lina, Mark paid 50', on);
  assert.ok(mugs.why);
  assert.deepEqual(mugs.left, ['Mark paid 50']);
});
