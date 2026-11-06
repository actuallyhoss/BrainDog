/**
 * A walk ahead held while the lists it walked stand, and never an old day or another person's money.
 *
 * MEASURED: `page(money)` warm spent 73 of its 150 ms on `everydayOf`, on a walk asked three times over rows nothing had
 * touched. The walk read each row by its id alone, which reads past every list (`notice`), so no walk with a row in it was
 * held. What is asserted is that a second ask reads no row, and that every way the answer can change changes it at once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 20, 12);
const DAY = 86_400_000;
const P = { actor: 'p_owner' };
const money = (amount: number, currency = 'EGP') => ({ amount, currency });

const register = (id: string, title: string, fields: unknown[]): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title, fields } }) as never;
const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const ACCOUNTS = register('accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);
const TRANSACTIONS = register('transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
]);
const BILLS = register('bills', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'every', type: 'enum', values: ['monthly', 'none'], index: true },
  { id: 'next_due', type: 'day', index: true },
]);
const CASH = {
  metric: 'cash',
  name: 'Cash now',
  source: 'register.accounts',
  value: { rolled: { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } } },
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};
const LEGS = [{ register: 'bills', on: 'next_due', amount: 'amount', incoming: { field: 'direction', is: 'in' }, every: { field: 'every', months: { monthly: 1 } } }];
const LEFT = { metric: 'left', name: 'left', source: 'forecast.runway', legs: LEGS, value: { walk: 'out', within: '30d' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };
const LASTS = { metric: 'lasts', name: 'lasts', source: 'forecast.runway', legs: LEGS, value: { walk: 'days_to_zero' }, opening: { metric: 'cash' }, format: 'days', target: { gte: 0 }, window: '30d', compare: 'none' };

async function made() {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  const one = sql.one.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  sql.one = ((q: string, ...a: never[]) => (statements.push(q), one(q, ...a))) as typeof sql.one;
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const installed = await k.install([ACCOUNTS, TRANSACTIONS, BILLS, metric(CASH), metric(LEFT), metric(LASTS)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const account = k.create('accounts', { name: 'Current', balance: money(1_000_000), as_of: '2026-09-19' }, P);
  assert.ok(account.ok, JSON.stringify(account));
  const bill = (what: string, amount: number, next_due = '2026-10-01', every = 'none'): Entry => {
    const out = k.create('bills', { what, direction: 'out', amount: money(amount), every, next_due }, P);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as Entry;
  };
  const left = (viewer?: string): Reading => {
    const r = k.metric(LEFT as never, viewer === undefined ? {} : { viewer });
    assert.ok(r.ok, JSON.stringify(r));
    return r.value;
  };
  /* Each row the walk carries is one read of a row by id, on a list or not. */
  const walked = () => statements.filter((q) => /FROM entry WHERE (register = \? AND )?id = \?/u.test(q)).length;
  return { sql, k, clock, bill, left, statements, walked, account: account.value as Entry };
}

test('A SECOND ASK READS NO ROW, and answers the same', async () => {
  const { bill, left, statements, walked } = await made();
  bill('Rent', 100_000);
  bill('Tax', 200_000);
  const first = left();
  assert.equal(first.value, 300_000);
  statements.length = 0;
  assert.deepEqual(left(), first);
  assert.equal(walked(), 0, 'a held walk read its rows again');
});

test('A BILL ADDED, EDITED OR DELETED IS IN THE NEXT ANSWER', async () => {
  const { sql, k, bill, left } = await made();
  const rent = bill('Rent', 100_000);
  assert.equal(left().value, 100_000);
  const tax = bill('Tax', 200_000);
  assert.equal(left().value, 300_000);
  const edited = k.update('bills', rent.id, { amount: money(300_000) }, P);
  assert.ok(edited.ok, JSON.stringify(edited));
  assert.equal(left().value, 500_000);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), tax.id);
  assert.equal(left().value, 300_000);
});

test('A REPAIR WITH NO LINE IN THE LOG MOVES IT TOO', async () => {
  const { sql, bill, left } = await made();
  const rent = bill('Rent', 100_000);
  assert.equal(left().value, 100_000);
  sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify({ ...rent.fields, amount: money(2_500_000) }), rent.id);
  assert.equal(left().value, 2_500_000);
});

test('WHAT IT OPENS FROM MOVES IT: money spent on the list the opening reads', async () => {
  const { k, bill, account } = await made();
  /* 10,000.00 held: 9,000.00 goes on the 1st, 1,500.00 on the 10th. Under on the 10th, twenty days on. */
  bill('Rent', 900_000, '2026-10-01');
  bill('Tax', 150_000, '2026-10-10');
  const lasts = () => {
    const r = k.metric(LASTS as never);
    assert.ok(r.ok, JSON.stringify(r));
    return r.value.value;
  };
  assert.equal(lasts(), 20);
  /* 1,500.00 spent today, so the 1st takes it under, eleven days on. */
  const spent = k.create('transactions', { what: 'Lunch', account: account.id, on: '2026-09-20', amount: money(150_000), direction: 'out' }, P);
  assert.ok(spent.ok, JSON.stringify(spent));
  assert.equal(lasts(), 11);
});

test('THE NEXT DAY IS WALKED AGAIN: a bill that fell behind today is not carried on an old answer', async () => {
  const { clock, bill, left, statements, walked } = await made();
  bill('Rent', 100_000, '2026-10-01');
  left();
  clock.set(NOW + DAY);
  statements.length = 0;
  left();
  assert.ok(walked() > 0, 'yesterday\'s walk was handed out today');
});

test('A ROW KEPT PRIVATE IS HELD APART BY WHO ASKS', async () => {
  const { sql, bill, left } = await made();
  bill('Rent', 100_000);
  const secret = bill('Secret', 200_000);
  sql.exec('INSERT INTO entry_private (entry_id, person_id) VALUES (?, ?)', secret.id, 'p_owner');
  const owner = left('p_owner').value;
  const member = left('p_member').value;
  assert.equal(left('p_owner').value, owner);
  assert.equal(left('p_member').value, member);
  /* And letting it go moves both at once, whatever the walk did with it. */
  sql.exec('DELETE FROM entry_private WHERE entry_id = ?', secret.id);
  assert.equal(left('p_owner').value, left('p_member').value);
});

test('A WRITE TAKEN BACK IS NOT SEEN', async () => {
  const { k, bill, left } = await made();
  bill('Rent', 100_000);
  assert.equal(left().value, 100_000);
  assert.throws(() =>
    k.transaction(() => {
      bill('Taken back', 300_000);
      assert.equal(left().value, 400_000, 'inside the write its own row counts');
      throw new Error('taken back');
    }),
  );
  assert.equal(left().value, 100_000);
});
