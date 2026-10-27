/**
 * The ledger is found by what its declaration says, never by its name: a list with an amount, a way, a day and a
 * required link to a list that holds money, and before any other the one that says how its moves pair.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ledgerAmong, ledgerFrom, pageOfLedger } from './ledger.ts';
import type { RegisterDecl } from '../record/schema.ts';

const decl = (d: Partial<RegisterDecl> & { id: string; fields: unknown[] }): RegisterDecl =>
  ({ name: d.id, one: d.id, title: 'label', mobile: ['label', 'sum', 'when'], ...d }) as unknown as RegisterDecl;

const PURSES = decl({
  id: 'purses',
  title: 'label',
  mobile: ['label', 'held', 'when'],
  state: 'status',
  done: ['shut'],
  fields: [
    { id: 'label', type: 'text', required: true },
    { id: 'sort', type: 'enum', values: ['vault', 'pocket'], required: true },
    { id: 'held', type: 'money', required: true },
    { id: 'status', type: 'enum', values: ['open', 'shut'] },
  ],
});

const KINDS = decl({
  id: 'kinds',
  title: 'label',
  state: 'status',
  done: ['gone'],
  fields: [
    { id: 'label', type: 'text', required: true },
    { id: 'goes', type: 'enum', values: ['in', 'out', 'both'], required: true },
    { id: 'how', type: 'enum', values: ['exact', 'starts'] },
    { id: 'glyph', type: 'enum', values: ['shopping-cart', 'utensils', 'tag'] },
    { id: 'hue', type: 'enum', values: ['pink', 'teal', 'slate'] },
    { id: 'status', type: 'enum', values: ['live', 'gone'] },
  ],
});

const PEOPLE = decl({ id: 'folk', fields: [{ id: 'label', type: 'text' }] });

const TILL = decl({
  id: 'till',
  name: 'Till',
  one: 'line',
  title: 'label',
  mobile: ['label', 'sum', 'when'],
  state: 'status',
  pairs: { on: ['abs(sum)'], opposite: 'goes', across: 'purse', within: '4d', mark: 'between' },
  fields: [
    { id: 'label', type: 'text', required: true, search: true },
    { id: 'when', type: 'day', required: true },
    { id: 'goes', type: 'enum', values: ['in', 'out'], required: true },
    { id: 'sum', type: 'money', required: true },
    { id: 'purse', type: 'ref', to: 'purses', required: true },
    { id: 'who', type: 'ref', to: 'folk' },
    { id: 'kind', type: 'ref', to: 'kinds', index: true },
    { id: 'words', type: 'text', search: true },
    { id: 'jot', type: 'text' },
    { id: 'between', type: 'bool' },
    { id: 'status', type: 'enum', values: ['pending', 'cleared'], required: true },
  ],
} as never);

/** A list of what is owed: an amount, a way, a day and a link to an account, and no pairing. */
const OWED = decl({
  id: 'owed',
  fields: [
    { id: 'label', type: 'text', required: true },
    { id: 'due', type: 'day', required: true },
    { id: 'goes', type: 'enum', values: ['owed_to_me', 'owed_by_me'], required: true },
    { id: 'sum', type: 'money', required: true },
    { id: 'purse', type: 'ref', to: 'purses', required: true },
  ],
});

const ALL = [OWED, PURSES, KINDS, PEOPLE, TILL];

test('the ledger is the list that pairs its moves, whatever it and its fields are called', () => {
  const l = ledgerAmong(ALL);
  assert.ok(l);
  assert.equal(l.list, 'till');
  assert.equal(l.title, 'label');
  assert.equal(l.amount, 'sum');
  assert.deepEqual(l.way, { field: 'goes', in: 'in', out: 'out' });
  assert.equal(l.day, 'when');
  assert.equal(l.account.field, 'purse');
  assert.equal(l.account.list, 'purses');
  assert.equal(l.account.money, 'held');
  assert.equal(l.account.kind, 'sort');
  assert.deepEqual(l.account.done, ['shut']);
  assert.equal(l.note, 'jot', 'the plain text that is neither the title nor searched');
  assert.equal(l.mark, 'between', 'the pairing names the mark a move carries');
});

test('the category is the link whose list holds both ways, with its glyph and its colour read off their values', () => {
  const c = ledgerAmong(ALL)?.category;
  assert.ok(c);
  assert.equal(c.field, 'kind');
  assert.equal(c.list, 'kinds');
  assert.deepEqual(c.way, { field: 'goes', in: 'in', out: 'out', either: ['both'] });
  assert.equal(c.icon, 'glyph');
  assert.equal(c.colour, 'hue');
});

test('a list of what is owed reads like a ledger, and the paired list still wins', () => {
  const byId = new Map(ALL.map((d) => [d.id, d]));
  assert.ok(ledgerFrom(OWED, byId), 'it has the shape');
  assert.equal(ledgerAmong([OWED, PURSES, TILL, KINDS])?.list, 'till');
  assert.equal(ledgerAmong([OWED, PURSES])?.list, 'owed', 'with nothing paired the first that reads as one');
});

test('no account that holds money is no ledger, and neither is a list with no way', () => {
  assert.equal(ledgerAmong([TILL, KINDS]), null, 'the account list is not held');
  const noWay = decl({ ...(TILL as unknown as object), id: 'till2', fields: TILL.fields.filter((f) => f.id !== 'goes') } as never);
  assert.equal(ledgerAmong([noWay, PURSES]), null);
});

test('a page draws the ledger when it requires the ledger or its accounts', () => {
  const l = ledgerAmong(ALL);
  assert.equal(pageOfLedger(['register.till', 'register.kinds'], l), true);
  assert.equal(pageOfLedger(['register.purses'], l), true);
  assert.equal(pageOfLedger(['register.folk'], l), false);
  assert.equal(pageOfLedger(undefined, l), false);
  assert.equal(pageOfLedger(['register.till'], null), false);
});
