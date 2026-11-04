/**
 * Who a Ledger entry was paid to or from, in a person's words (the seed half), beside the words the
 * bank wrote.
 *
 * WHAT WAS WRONG. The Ledger held one text for the other side of a payment, `counterparty_text`, and called it "Paid to
 * or from". A bank door fills it with `GEIDEA*BRIDGE ST COFFEE`, so the label promised a name and showed a statement
 * line, and a person who corrected it lost the words a match was made on.
 *
 * WHAT IS HELD HERE. The list declares `payee`, labelled "Paid to or from", searchable and not indexed (the list's
 * eight are spent), and `counterparty_text` keeps its id, stays searchable and is labelled "As the bank wrote it". A
 * record on the released 3.16.0 takes the step with its entries whole, and the example record still draws.
 *
 * RED FIRST: before the field, the first test fails on the list declaring no `payee`, the second on the old label, and
 * the third at the write of `payee`, which the Ledger refuses as a field it does not hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY_VERSIONS, NOW, TRANSACTIONS, day, firstPartyDocument, installSeed } from '../src/index.ts';
import { put, record, value, type Doc } from './money-core-earlier.ts';

const OWNER = { actor: 'p_1' };

type Field = { id: string; label?: string; type: string; search?: boolean; index?: boolean; unique?: boolean; required?: boolean };

/** The Ledger's fields as the document a record installs declares them. */
const ledgerFields = (doc: unknown): Field[] => {
  const list = (doc as Doc).declarations.find((d) => d.register === 'transactions');
  assert.ok(list, 'the document declares no Ledger');
  return list.fields as Field[];
};

/** Money-core as 3.16.0 released it, the frozen document, with no example entries. */
const released316 = (): Doc => ({ ...(JSON.parse(readFileSync(new URL('./fixtures/released/money-core-3.16.0.json', import.meta.url), 'utf8')) as Doc), seeds: [] }) as Doc;

test('THE LEDGER DECLARES payee, labelled Paid to or from, searchable, and spends no index on it', () => {
  const fields = ledgerFields(firstPartyDocument('money-core'));
  const payee = fields.find((f) => f.id === 'payee');
  assert.ok(payee, 'the Ledger declares no payee');
  assert.equal(payee.type, 'text');
  assert.equal(payee.label, 'Paid to or from');
  assert.equal(payee.search, true);
  assert.notEqual(payee.index, true, 'payee is indexed, and the list has no index left to give');
  assert.notEqual(payee.unique, true);
  /* OPTIONAL, because most ways an entry arrives say only what the bank wrote. */
  assert.notEqual(payee.required, true);
  /* AND THE LIST IS STILL AT ITS EIGHT, the ceiling `declare.ts` holds a list to. */
  assert.equal(fields.filter((f) => f.index === true || f.unique === true).length, 8);
});

test('counterparty_text KEEPS ITS ID AND ITS SEARCH, and is labelled As the bank wrote it', () => {
  const fields = ledgerFields(firstPartyDocument('money-core'));
  const bank = fields.find((f) => f.id === 'counterparty_text');
  assert.ok(bank, 'the Ledger no longer declares counterparty_text, which every bank add-on writes');
  assert.equal(bank.type, 'text');
  assert.equal(bank.label, 'As the bank wrote it');
  assert.equal(bank.search, true);
  /* ONE FIELD CARRIES EACH LABEL, so a person is never shown two things called the same. */
  assert.deepEqual(fields.filter((f) => f.label === 'Paid to or from').map((f) => f.id), ['payee']);
  /* THE RELEASED 3.16.0 IS AS IT SHIPPED: the frozen document still calls the bank's words Paid to or from. */
  const was = ledgerFields(released316());
  assert.equal(was.find((f) => f.id === 'counterparty_text')?.label, 'Paid to or from');
  assert.equal(was.find((f) => f.id === 'payee'), undefined);
});

test('A RECORD ON 3.16.0 TAKES THE STEP, and its entries keep the words the bank wrote', async () => {
  const { k } = await record();
  await put(k, firstPartyDocument('portfolio', { seeds: [] }));
  await put(k, firstPartyDocument('people', { seeds: [] }));
  await put(k, released316());
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, '3.16.0');

  const account = value<Entry>(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 100_000, currency: 'GBP' }, as_of: day(-1) }, OWNER));
  const entry = (what: string, bank: string): Entry =>
    value<Entry>(k.create('transactions', { what, on: day(-2), direction: 'out', amount: { amount: 1_250, currency: 'GBP' }, account: account.id, state: 'cleared', counterparty_text: bank }, OWNER));
  const coffee = entry('Card payment', 'GEIDEA*BRIDGE ST COFFEE');
  const rail = entry('Card payment', 'NORTHERN RAIL 4471');

  await put(k, firstPartyDocument('money-core', { seeds: [] }));
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, FIRST_PARTY_VERSIONS['money-core']);

  /* WHAT THE BANK WROTE IS WHERE IT WAS, and nothing made up a name for it. */
  assert.equal(k.get(coffee.id)?.fields.counterparty_text, 'GEIDEA*BRIDGE ST COFFEE');
  assert.equal(k.get(rail.id)?.fields.counterparty_text, 'NORTHERN RAIL 4471');
  assert.equal(k.get(coffee.id)?.fields.payee ?? '', '');

  /* A NAME IS WRITTEN BESIDE IT AND TAKES NOTHING AWAY. */
  value(k.update('transactions', coffee.id, { payee: 'Bridge Street Coffee' }, OWNER));
  const named = k.get(coffee.id)!;
  assert.equal(named.fields.payee, 'Bridge Street Coffee');
  assert.equal(named.fields.counterparty_text, 'GEIDEA*BRIDGE ST COFFEE');

  /* BOTH ARE WHAT A PERSON REMEMBERS, so both find the entry. */
  const found = (q: string): string[] => k.search(q, { registers: ['transactions'] }).map((h) => (h as unknown as { id: string }).id);
  assert.deepEqual(found('GEIDEA'), [coffee.id], 'the bank\'s words no longer find the entry');
  assert.deepEqual(found('Street'), [coffee.id], 'the name does not find the entry');
  assert.deepEqual(found('NORTHERN'), [rail.id]);
});

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

test('THE EXAMPLE RECORD STILL DRAWS: every entry is held with the words the bank wrote, and Money opens with no block refused', async () => {
  const k = await seeded();
  const held = value<{ rows: Entry[] }>(k.list({ register: 'transactions', limit: 200 } as never)).rows;
  assert.equal(held.length, TRANSACTIONS.length);

  /* EACH EXAMPLE ENTRY THAT SAYS WHAT THE BANK WROTE STILL SAYS IT, counted by the words. */
  const count = (rows: readonly { counterparty_text?: unknown }[]): Record<string, number> => {
    const n: Record<string, number> = {};
    for (const r of rows) if (typeof r.counterparty_text === 'string') n[r.counterparty_text] = (n[r.counterparty_text] ?? 0) + 1;
    return n;
  };
  assert.deepEqual(count(held.map((e) => e.fields)), count(TRANSACTIONS));
  assert.ok(Object.keys(count(TRANSACTIONS)).length > 5, 'the example entries say nothing the bank wrote, so this test holds nothing');
  /* THE NAME EACH EXAMPLE TYPES IS THE NAME IT HOLDS, SINCE 3c699b60d gave the sample its payees: none is invented. */
  const payees = (rows: readonly { payee?: unknown }[]): string[] => rows.map((r) => String(r.payee ?? '')).sort();
  assert.deepEqual(payees(held.map((e) => e.fields)), payees(TRANSACTIONS));

  const page = k.page('money');
  assert.ok(page.ok, sayOf(page));
  for (const b of page.value.blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)}: ${JSON.stringify(b.refusals)}`);
  const ledger = page.value.blocks.find((b) => b.heading === 'Ledger');
  assert.ok(ledger, 'the page has no Ledger tile');
  assert.equal((ledger.rows ?? []).length, 6);
});
