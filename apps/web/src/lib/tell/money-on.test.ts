/**
 * Money turned back on reads the line against the lists it brought, as the record counts them now (RN4).
 *
 * A Money switched off on a record with a bank account, then turned on again from Tell, brought its lists back as
 * declarations holding nothing, so "Paid Nadia 300 for the logo" became a paid bill and the account's balance never moved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstPartyDocument } from '@braindog/seed/packs';

import type { FieldDecl } from '../record/schema.ts';
import { listsOn } from './money-on.ts';
import { tellRead, type TellList } from './read.ts';

type Declared = { register?: string; name: string; title: string; fields: FieldDecl[]; state?: string };

const declared = Object.fromEntries(
  ((firstPartyDocument('money-core' as never)?.declarations ?? []) as Declared[]).flatMap((d) =>
    d.register ? [[d.register, { id: d.register, name: d.name, title: d.title, fields: d.fields, ...(d.state ? { state: d.state } : {}) }]] : [],
  ),
);
const PEOPLE: TellList = { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] as FieldDecl[] };
const IDS = ['accounts', 'transactions', 'obligations', 'recurring'];
const LINE = 'Paid Nadia 300 for the logo';

test('Money turned back on over a held account puts a payment on the Ledger', () => {
  const lists = listsOn([PEOPLE], IDS, [{ id: 'people', count: 4 }, { id: 'accounts', count: 1 }, { id: 'transactions', count: 12 }, { id: 'obligations', count: 0 }], declared);
  assert.equal(lists.find((l) => l.id === 'accounts')?.count, 1, 'the accounts list keeps what it holds');
  const told = tellRead(LINE, { lists, today: '2026-10-31', currency: 'EGP', accounts: [{ seq: 1, name: 'CIB current' }] });
  const paid = told.rows.find((r) => r.register === 'transactions');
  assert.ok(paid, `the payment went to ${told.rows.map((r) => r.register).join(', ')}`);
  assert.equal(paid.fields.account, 'accounts#1');
  assert.equal(paid.fields.direction, 'out');
});

test('Money turned on where no account was ever kept still keeps the payment as a paid bill', () => {
  const lists = listsOn([PEOPLE], IDS, [{ id: 'people', count: 4 }, { id: 'accounts', count: 0 }], declared);
  const told = tellRead(LINE, { lists, today: '2026-10-31', currency: 'EGP', accounts: [] });
  assert.ok(told.rows.some((r) => r.register === 'obligations'));
  assert.ok(!told.rows.some((r) => r.register === 'transactions'));
});
