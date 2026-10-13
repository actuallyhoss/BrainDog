/**
 * A field a list declares `once` is the add-on's to plant and never to patch (SHL-A09 job 4).
 *
 * THE CASE IS A CATEGORY'S NAME. An add-on plants "Groceries", the person calls theirs "Food", and the add-on's next
 * version carries "Groceries & household" for the same row. Its update goes over the row and the name stays "Food",
 * while the fields it may refresh are refreshed. A row the update makes is new and takes every field it was given.
 *
 * ONLY THE ADD-ON'S OWN WRITE IS NARROWED (`WriteContext.pack`). The person renames the category as they rename
 * anything, which is the difference from `immutable`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const PERSON = { actor: 'p_1' };
/** What an add-on's install or update signs its own writes with. */
const ADDON = { actor: 'p_1', pack: true as const, cascade: false };

const CATEGORIES: Declaration = {
  id: 'register.categories',
  kind: 'register',
  body: {
    id: 'categories',
    name: 'Categories',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'hint', type: 'text' },
      { id: 'colour', type: 'text' },
    ],
    once: ['name', 'colour'],
  } as never,
};

/** A record holding Categories with its `once`, installed as any list is: the install check admits the key (`onceFault`). */
async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([CATEGORIES]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const fieldsOf = (k: Kernel, id: string) => k.get(id)!.fields;

test("an add-on's update keeps a once field as the row holds it and writes the rest", async () => {
  const { k, sql } = await record();
  const made = k.create('categories', { name: 'Groceries', hint: 'Food shops' }, ADDON);
  assert.ok(made.ok);
  const id = made.value.id;
  assert.ok(k.update('categories', id, { name: 'Food' }, PERSON).ok, 'a person renames it as they rename anything');

  const again = k.update('categories', id, { name: 'Groceries & household', hint: 'Food and cleaning' }, ADDON);
  assert.ok(again.ok, JSON.stringify(again));
  assert.equal(fieldsOf(k, id).name, 'Food', 'the name the person gave it stands');
  assert.equal(fieldsOf(k, id).hint, 'Food and cleaning', 'a field the list does not hold back is refreshed');

  /* AND NOTHING IN THE HISTORY CARRIES THE NAME THE ADD-ON SENT, since it was never written. */
  const lines = sql.all<{ to_v: string | null }>('SELECT to_v FROM event WHERE target = ?', `entry:${id}`);
  assert.ok(lines.length > 0);
  assert.ok(lines.every((l) => !String(l.to_v).includes('household')), JSON.stringify(lines));
});

test('a once field the row holds empty stays empty, and one cleared by the add-on stays set', async () => {
  const { k } = await record();
  const made = k.create('categories', { name: 'Rent' }, ADDON);
  assert.ok(made.ok);
  const id = made.value.id;
  assert.ok(k.update('categories', id, { colour: 'teal' }, ADDON).ok);
  assert.equal(fieldsOf(k, id).colour, undefined, 'the person left it empty, and empty is theirs too');

  assert.ok(k.update('categories', id, { colour: 'amber' }, PERSON).ok);
  assert.ok(k.update('categories', id, { colour: null, name: null }, ADDON).ok);
  assert.equal(fieldsOf(k, id).colour, 'amber');
  assert.equal(fieldsOf(k, id).name, 'Rent');
});

test('a row the add-on makes still gets every once field', async () => {
  const { k } = await record();
  const made = k.create('categories', { name: 'Travel', hint: 'Fares', colour: 'blue' }, ADDON);
  assert.ok(made.ok, JSON.stringify(made));
  assert.deepEqual(
    { name: made.value.fields.name, hint: made.value.fields.hint, colour: made.value.fields.colour },
    { name: 'Travel', hint: 'Fares', colour: 'blue' },
  );
});

test('a write that is not the add-on own changes a once field, and a list with no once is not narrowed', async () => {
  const { k } = await record();
  const made = k.create('categories', { name: 'Bills' }, PERSON);
  assert.ok(made.ok);
  assert.ok(k.update('categories', made.value.id, { name: 'Household bills' }, PERSON).ok);
  assert.equal(fieldsOf(k, made.value.id).name, 'Household bills');

  const plain: Declaration = { ...CATEGORIES, id: 'register.labels', body: { id: 'labels', name: 'Labels', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
  assert.ok((await k.install([plain])).ok);
  const label = k.create('labels', { name: 'Old' }, ADDON);
  assert.ok(label.ok);
  assert.ok(k.update('labels', label.value.id, { name: 'New' }, ADDON).ok);
  assert.equal(fieldsOf(k, label.value.id).name, 'New');
});

test("a name the list does not have is still refused on the add-on's update", async () => {
  const { k } = await record();
  const made = k.create('categories', { name: 'Fuel' }, ADDON);
  assert.ok(made.ok);
  const out = k.update('categories', made.value.id, { name: 'Petrol', nope: 1 } as never, ADDON);
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'FIELD_UNKNOWN');
});

test("an amount the add-on refreshes takes its currency from the account the row holds, not the one it sent", async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const accounts: Declaration = {
    id: 'register.accounts',
    kind: 'register',
    body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }] } as never,
  };
  const budgets: Declaration = {
    id: 'register.budgets',
    kind: 'register',
    body: {
      id: 'budgets',
      name: 'Budgets',
      title: 'name',
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'account', type: 'ref', to: 'accounts' },
        { id: 'cap', type: 'money', currency_from: 'account.balance' },
      ],
      once: ['account'],
    } as never,
  };
  const installed = await k.install([accounts, budgets]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const pounds = k.create('accounts', { name: 'Current', balance: { amount: 0, currency: 'GBP' } }, PERSON);
  const dollars = k.create('accounts', { name: 'Travel card', balance: { amount: 0, currency: 'USD' } }, PERSON);
  assert.ok(pounds.ok && dollars.ok, JSON.stringify([pounds, dollars]));
  const made = k.create('budgets', { name: 'Food', account: pounds.value.id, cap: { amount: 5000, currency: 'GBP' } }, ADDON);
  assert.ok(made.ok, JSON.stringify(made));

  /* The add-on's update names the dollar account, which is not written, and a cap with no code of its own. */
  const again = k.update('budgets', made.value.id, { account: dollars.value.id, cap: { amount: 6000 } }, ADDON);
  assert.ok(again.ok, JSON.stringify(again));
  assert.equal(fieldsOf(k, made.value.id).account, pounds.value.id);
  assert.deepEqual(fieldsOf(k, made.value.id).cap, { amount: 6000, currency: 'GBP' });
});

test('a once that does not name written fields of its own list is refused at install, naming the one', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const fields = [
    { id: 'name', type: 'text', required: true },
    { id: 'made', type: 'text', derived: true },
  ];
  const withOnce = (once: unknown): Declaration => ({ ...CATEGORIES, body: { id: 'categories', name: 'Categories', title: 'name', fields, once } as never });
  const refused = async (once: unknown) => {
    const out = await k.install([withOnce(once)]);
    assert.equal(out.ok, false, JSON.stringify(once));
    return (out as unknown as { refusal: { code: string; at?: string; fix: string } }).refusal;
  };

  const unknown = await refused(['name', 'colour']);
  assert.equal(unknown.code, 'DECLARATION_INVALID');
  assert.equal(unknown.at, 'once[1]');
  assert.match(JSON.stringify(unknown), /colour/, 'the refusal names the id the list does not have');

  const derived = await refused(['made']);
  assert.equal(derived.code, 'DECLARATION_INVALID');
  assert.equal(derived.at, 'once[0]');
  assert.match(JSON.stringify(derived), /made/);

  for (const shape of ['name', ['name', 7], { name: true }]) assert.equal((await refused(shape)).at, 'once');

  /* NOTHING WAS INSTALLED BY A REFUSED BATCH, and the same list with a good `once`, or an empty one, goes in. */
  assert.equal(k.create('categories', { name: 'Rent' }, PERSON).ok, false);
  assert.ok((await k.install([withOnce([])])).ok);
  assert.ok((await k.install([withOnce(['name'])])).ok);
});
