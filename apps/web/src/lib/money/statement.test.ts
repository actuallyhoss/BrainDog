/**
 * Import a statement: a bank's CSV read through the first run's mapper into one account's Ledger lines, with the lines
 * the Ledger already holds left out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { balanceFieldOf, bankless, dayPlus, fieldsOf, freshOf, guessRoles, heldOf, linesOf, readStatement, rolesMissing, sameLine, spanOf, type Held, type Roles } from './statement.ts';
import type { Export } from '../start/export.ts';

const read = (text: string, name = 'statement.csv'): Export => {
  const got = readStatement(name, text);
  assert.ok(!('why' in got), 'the file reads');
  return got as Export;
};

const SIGNED = ['Date,Description,Amount,Balance', '03/10/2026,CORNER BAKERY,-4.50,995.50', '04/10/2026,Salary October,"2,000.00","2,995.50"', '05/10/2026,Rent,-800.00,2195.50'].join('\n');
const TWO = ['Posting date;Narrative;Paid out;Paid in;Running balance', '2026-10-03;Corner bakery;4,50;;995,50', '2026-10-04;Salary;;2.000,00;2.995,50'].join('\n');

test('a statement with one signed amount column is mapped by its headings', () => {
  const exp = read(SIGNED);
  assert.deepEqual(guessRoles(exp, 'en-GB'), { day: 'Date', what: 'Description', amount: 'Amount', out: null, in: null, balance: 'Balance' });
});

test('a statement with money out and money in columns maps both, and its running balance', () => {
  const exp = read(TWO);
  assert.deepEqual(guessRoles(exp, 'en-GB'), { day: 'Posting date', what: 'Narrative', amount: null, out: 'Paid out', in: 'Paid in', balance: 'Running balance' });
});

test('headings it does not know still map by what the cells hold', () => {
  const exp = read(['When,Shop,Value', '2026-10-03,Corner bakery,-4.50', '2026-10-04,Fruit stall,-2.10'].join('\n'));
  const roles = guessRoles(exp, 'en-GB');
  assert.equal(roles.day, 'When');
  assert.equal(roles.what, 'Shop');
  assert.equal(roles.amount, 'Value');
});

test('signed amounts read as money out with a minus, in minor units of the account currency', () => {
  const exp = read(SIGNED);
  const got = linesOf(exp, guessRoles(exp, 'en-GB'), { currency: 'GBP', locale: 'en-GB' });
  assert.equal(got.unread, 0);
  assert.deepEqual(
    got.lines.map((l) => [l.day, l.what, l.way, l.amount, l.balance]),
    [
      ['2026-10-03', 'CORNER BAKERY', 'out', 450, 99550],
      ['2026-10-04', 'Salary October', 'in', 200000, 299550],
      ['2026-10-05', 'Rent', 'out', 80000, 219550],
    ],
  );
});

test('a card statement that shows spending as a plain figure is read the other way round', () => {
  const exp = read(['Date,Description,Amount', '2026-10-03,Corner bakery,4.50', '2026-10-04,Refund,-4.50'].join('\n'));
  const got = linesOf(exp, guessRoles(exp, 'en-GB'), { currency: 'GBP', locale: 'en-GB', sign: 'plus-out' });
  assert.deepEqual(got.lines.map((l) => l.way), ['out', 'in']);
});

test('money out and money in columns are read as sizes, with a comma for the decimal point', () => {
  const exp = read(TWO);
  const got = linesOf(exp, guessRoles(exp, 'de-DE'), { currency: 'EUR', locale: 'de-DE' });
  assert.deepEqual(got.lines.map((l) => [l.way, l.amount, l.balance]), [['out', 450, 99550], ['in', 200000, 299550]]);
});

test('a line in another currency is held back, and a line with no amount is counted as left out', () => {
  const exp = read(['Date,Description,Amount', '2026-10-03,Hotel,USD -120.00', '2026-10-04,Note to self,', '2026-10-05,Bakery,-3.00'].join('\n'));
  const got = linesOf(exp, guessRoles(exp, 'en-GB'), { currency: 'GBP', locale: 'en-GB' });
  assert.equal(got.other, 1);
  assert.equal(got.unread, 1);
  assert.deepEqual(got.lines.map((l) => l.what), ['Bakery']);
});

test('a mapping without a date, a description or an amount says what it needs', () => {
  const none: Roles = { day: null, what: null, amount: null, out: null, in: null, balance: null };
  assert.match(rolesMissing(none) ?? '', /date/u);
  assert.match(rolesMissing({ ...none, day: 'D' }) ?? '', /description/u);
  assert.match(rolesMissing({ ...none, day: 'D', what: 'W' }) ?? '', /amount/u);
  assert.equal(rolesMissing({ ...none, day: 'D', what: 'W', out: 'O' }), null);
});

test('a spreadsheet file is refused in a sentence, never read as text', () => {
  const got = readStatement('october.xlsx', 'PK…');
  assert.ok('why' in got);
});

/* ── the dedupe ── */

const line = (day: string, what: string, amount: number, way: 'in' | 'out' = 'out'): Held => ({ day, what, amount, currency: 'GBP', way });

test('one movement seen twice: the same amount and way, three days apart at most, the same payee', () => {
  assert.ok(sameLine(line('2026-10-03', 'CORNER BAKERY LONDON GB', 450), line('2026-10-04', 'Corner Bakery London', 450)));
  assert.ok(sameLine(line('2026-10-03', 'Café Lumière', 300), line('2026-10-03', 'CAFE LUMIERE', 300)));
  assert.ok(sameLine(line('2026-10-03', 'Corner bakery', 450), line('2026-10-06', 'Corner bakery', 450)), 'an alert and the day the bank posted it');
  assert.ok(!sameLine(line('2026-10-03', 'Corner bakery', 450), line('2026-10-07', 'Corner bakery', 450)), 'four days apart');
  assert.ok(!sameLine(line('2026-10-03', 'Corner bakery', 450), line('2026-10-03', 'Corner bakery', 451)), 'another amount');
  assert.ok(!sameLine(line('2026-10-03', 'Corner bakery', 450), line('2026-10-03', 'Corner bakery', 450, 'in')), 'the other way');
  assert.ok(!sameLine(line('2026-10-03', 'Corner bakery', 450), { ...line('2026-10-03', 'Corner bakery', 450), currency: 'EUR' }), 'another currency');
  assert.ok(!sameLine(line('2026-10-03', 'Corner bakery', 450), line('2026-10-03', 'Fruit stall', 450)), 'other words');
});

test('a statement line and the alert the Ledger holds are one, past what the bank wraps the payee in', () => {
  /* Live check of 30 October, 11: the alert wrote the payee, the statement the bank's line around it. */
  assert.ok(sameLine(line('2026-10-21', 'IPN outward transfer to AHMED EMAD SAIED ABDELAZIZ', 150150), line('2026-10-19', 'AHMED EMAD SAIED ABDELAZIZ', 150150)));
  assert.ok(sameLine(line('2026-10-07', '05OCT26 PAYMOB*UNITRADE Purchase', 27747), line('2026-10-05', 'UNITRADE', 27747)));
  assert.ok(sameLine(line('2026-10-29', '28OCT26 TALABAT CAIRO EG Purchase', 101587), line('2026-10-28', 'Talabat', 101587)));
  assert.ok(!sameLine(line('2026-10-29', '28OCT26 BREADFAST CAIRO EG Purchase', 101587), line('2026-10-28', 'Talabat', 101587)), 'another shop');
  assert.equal(bankless('IPN inward transfer from LAYLA AHMED'), 'layla ahmed');
});

test('the Ledger is matched by its other words for the payee too, and a balance both say must agree', () => {
  const held = { ...line('2026-10-17', 'Account ending 8307', 235235), also: ['8307'] };
  assert.ok(sameLine(line('2026-10-19', 'IPN outward transfer to 8307', 235235), held));
  assert.ok(sameLine({ ...line('2026-10-17', 'Rent', 80000), balance: 5000 }, { ...line('2026-10-17', 'Rent', 80000), balance: 5000 }));
  assert.ok(!sameLine({ ...line('2026-10-17', 'Rent', 80000), balance: 5000 }, { ...line('2026-10-18', 'Rent', 80000), balance: -75000 }), 'two balances, two payments');
});

test('the nearest pairs are made first, whatever order the file lists its lines in', () => {
  /* Newest first, as a bank prints it: the coffee of the 5th must not take the Ledger's coffee of the 3rd. */
  const file = [line('2026-10-05', 'Coffee', 300), line('2026-10-03', 'Coffee', 300)];
  const { fresh, already } = freshOf(file, [line('2026-10-03', 'Coffee', 300)]);
  assert.deepEqual(already.map((l) => l.day), ['2026-10-03']);
  assert.deepEqual(fresh.map((l) => l.day), ['2026-10-05']);
});

test('lines already in the Ledger are skipped, each kept line standing for one line of the file', () => {
  const file = [line('2026-10-03', 'Coffee', 300), line('2026-10-03', 'Coffee', 300), line('2026-10-04', 'Rent', 80000)];
  const held = [line('2026-10-03', 'Coffee', 300)];
  const { fresh, already } = freshOf(file, held);
  assert.equal(already.length, 1);
  assert.deepEqual(fresh.map((l) => l.what), ['Coffee', 'Rent']);
});

test('the same file imported twice adds nothing the second time', () => {
  const exp = read(SIGNED);
  const first = linesOf(exp, guessRoles(exp, 'en-GB'), { currency: 'GBP', locale: 'en-GB' }).lines;
  assert.equal(freshOf(first, first).fresh.length, 0);
});

test('a Ledger row is read for the dedupe by its own fields, and one it cannot compare is not', () => {
  const l = { title: 'what', amount: 'amount', day: 'on', way: { field: 'direction', in: 'in', out: 'out' } };
  assert.deepEqual(heldOf({ what: 'Rent', amount: { amount: 80000, currency: 'GBP' }, on: '2026-10-05', direction: 'out' }, l), line('2026-10-05', 'Rent', 80000));
  assert.equal(heldOf({ what: 'Rent', on: '2026-10-05', direction: 'out' }, l), null);
  const full = { what: 'WOPLEK', counterparty_text: 'WOPLEK OFFICE FURNITURE', payee: 'Woplek Office Furniture', amount: { amount: 3462000, currency: 'GBP' }, on: '2026-10-17', direction: 'out', after: { amount: 100, currency: 'GBP' } };
  assert.deepEqual(heldOf(full, l, 'after'), { ...line('2026-10-17', 'WOPLEK', 3462000), also: ['WOPLEK OFFICE FURNITURE', 'Woplek Office Furniture'], balance: 100 });
});

test('the span the Ledger is read over, a day either side', () => {
  assert.deepEqual(spanOf([{ day: '2026-10-05' }, { day: '2026-09-30' }]), { from: '2026-09-30', to: '2026-10-05' });
  assert.equal(dayPlus('2026-10-01', -1), '2026-09-30');
  assert.equal(spanOf([]), null);
});

/* ── the write ── */

test('a line is written as the Ledger stores it, its balance only where the Ledger keeps one', () => {
  const l = { title: 'what', amount: 'amount', day: 'on', way: { field: 'direction', in: 'in', out: 'out' }, account: { field: 'account' } };
  const decl = [
    { id: 'amount', type: 'money' },
    { id: 'available', type: 'money', label: 'Available after' },
    { id: 'after', type: 'money', label: 'Balance after' },
  ];
  const balance = balanceFieldOf(decl, 'amount');
  assert.equal(balance, 'after');
  const one = { at: 0, day: '2026-10-03', what: 'Bakery', amount: 450, currency: 'GBP', way: 'out' as const, balance: 99550 };
  assert.deepEqual(fieldsOf(one, l as never, 'acc-1', balance), {
    what: 'Bakery',
    on: '2026-10-03',
    direction: 'out',
    amount: { amount: 450, currency: 'GBP' },
    account: 'acc-1',
    after: { amount: 99550, currency: 'GBP' },
  });
  assert.equal('after' in fieldsOf({ ...one, balance: null }, l as never, 'acc-1', balance), false);
});
