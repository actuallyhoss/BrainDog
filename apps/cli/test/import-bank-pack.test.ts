/**
 * The the old tool import offers `bank-hsbc-eg` on Decide when, and only when, his export shows the bank's messages were
 * being read into his money.
 *
 * WHY THIS FILE EXISTS. money-core 1.8.0 stopped declaring HSBC Egypt's six wordings and their six webhook twins and
 * handed them to an optional pack (`packages/seed/src/packs/bank-hsbc-eg.ts`), because one person's bank is not in the
 * core (`loop/DIRECTION.md` section 22). The owner is that person, so the import has to bring the pack for him, and
 * it has to do it by looking at his data rather than by being the one place in the product that still assumes
 * everybody banks in Cairo.
 *
 * WHAT IN THE EXPORT SAYS SO, MEASURED ON 22 SEPTEMBER against his live `/api/money/overview` and `/api/money/txn`
 * (the two routes `scripts/legacy-export.mjs` keeps under `money`; counts only, nothing of his is in this file):
 * two accounts whose id and name say HSBC, and every ledger row on them carrying a `source`, which read `sms` on the
 * rows the bank's texts wrote and `sheet` on the rows he typed in from a spreadsheet before the texts were wired. The
 * export carries no pattern and no inbox, so those two together are the whole of the evidence, and the tests below
 * hold the import to needing both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bankHsbcEgPack } from '@braindog/seed';

import { type Plan } from '../src/legacy.ts';
import { applyPlan, banksOf, said, type Door } from '../src/import.ts';

const QUESTION = 'Read HSBC Egypt texts and mails into Money?';

/** An export's money section as the two routes answer it, with invented rows. */
function exportWith(accounts: Record<string, unknown>[], rows: Record<string, unknown>[]): Record<string, unknown> {
  return { db: { entities: [] }, money: { asOf: '2026-09-15', accounts, ledger: { rows, categories: [] } } };
}

const HSBC_EGP = { id: 'hsbc-egp', name: 'HSBC (EGP)', kind: 'bank', currency: 'EGP', opening_minor: 0, balance_minor: 100000, is_liability: 0 };
const OTHER = { id: 'main', name: 'Main current account', kind: 'bank', currency: 'EGP', opening_minor: 0, balance_minor: 100000, is_liability: 0 };
const txn = (id: number, account: string, source: string) => ({ id, account_id: account, day: '2026-09-10', description: 'IPN outward transfer to A PERSON', amount_minor: -5000, currency: 'EGP', source });

const EMPTY: Plan = { taken: null, rev: null, rows: [], asks: [], polls: [], skipped: [], changed: [] };

/** A record whose Decide is held in memory, on the money-core version given. */
function record(money: string | null) {
  const filed: { id: string; question: string; body: Record<string, unknown> }[] = [];
  const door: Door = {
    schema: async (register) => ({ ok: true, value: { register } }),
    list: async () => ({ ok: true, value: { rows: [], cursor: null } }),
    create: async () => {
      throw new Error('nothing was planned, so nothing should be written');
    },
    update: async () => {
      throw new Error('nothing was planned, so nothing should be changed');
    },
    governance: async () => ({ ok: true, value: filed.map((s) => ({ id: s.id, status: 'open', body: s.body })) }),
    propose: async ({ question, body }) => {
      const id = `SG${String(filed.length + 1)}`;
      filed.push({ id, question, body });
      return { ok: true, value: { id } };
    },
    packs: async () => ({ ok: true, value: money === null ? [] : [{ id: 'money-core', version: money, disabled_at: null, registers: ['accounts', 'transactions'] }] }),
  };
  return { door, filed };
}

test('an HSBC account whose rows came in by text is read as HSBC Egypt use, and the pack document travels with it', () => {
  const banks = banksOf(exportWith([HSBC_EGP, OTHER], [txn(1, 'hsbc-egp', 'sms'), txn(2, 'main', 'sheet')]));
  assert.equal(banks.length, 1);
  assert.equal(banks[0]!.install, 'bank-hsbc-eg');
  assert.equal(banks[0]!.question, QUESTION);
  /* THE DOCUMENT, WHOLE, because the pack is not in the catalogue a record resolves an install id against. */
  assert.deepEqual(banks[0]!.doc, bankHsbcEgPack());
});

test('an alert mail counts as much as a text does', () => {
  assert.equal(banksOf(exportWith([HSBC_EGP], [txn(1, 'hsbc-egp', 'email')])).length, 1);
});

test('nothing is offered to an export with no HSBC account, however many rows arrived by text', () => {
  assert.deepEqual(banksOf(exportWith([OTHER], [txn(1, 'main', 'sms'), txn(2, 'main', 'sms')])), []);
});

test('nothing is offered for an HSBC account whose every row was typed in, because no message of the bank was ever read', () => {
  assert.deepEqual(banksOf(exportWith([HSBC_EGP], [txn(1, 'hsbc-egp', 'sheet'), txn(2, 'hsbc-egp', 'manual')])), []);
});

test('nothing is offered to an export with no money section or no ledger', () => {
  assert.deepEqual(banksOf({ db: { entities: [] } }), []);
  assert.deepEqual(banksOf({ db: { entities: [] }, money: { accounts: [HSBC_EGP] } }), []);
});

test('on money-core 1.8.0 the pack is filed once on Decide, and a second run finds it there and files nothing', async () => {
  const { door, filed } = record('1.8.0');
  const banks = banksOf(exportWith([HSBC_EGP], [txn(1, 'hsbc-egp', 'sms')]));

  const first = await applyPlan(EMPTY, door, { dryRun: false, banks });
  assert.deepEqual(first.banks, { filed: 1, before: 0, waiting: [] });
  assert.equal(filed.length, 1);
  assert.equal(filed[0]!.question, QUESTION);
  assert.deepEqual(filed[0]!.body, { install: 'bank-hsbc-eg', doc: bankHsbcEgPack() });
  assert.ok(said(first, { dryRun: false, file: 'export.json' }).some((l) => /^Banks: 1 filed on Decide for you to approve, 0 filed before\.$/u.test(l)));

  const again = await applyPlan(EMPTY, door, { dryRun: false, banks });
  assert.deepEqual(again.banks, { filed: 0, before: 1, waiting: [] });
  assert.equal(filed.length, 1, 'the pack was offered a second time');
});

test('a dry run counts the pack it would file and files nothing', async () => {
  const { door, filed } = record('1.8.0');
  const report = await applyPlan(EMPTY, door, { dryRun: true, banks: banksOf(exportWith([HSBC_EGP], [txn(1, 'hsbc-egp', 'sms')])) });
  assert.deepEqual(report.banks, { filed: 1, before: 0, waiting: [] });
  assert.equal(filed.length, 0);
});

test('on money-core 1.7.0 nothing is filed, and the report says which update comes first', async () => {
  const { door, filed } = record('1.7.0');
  const report = await applyPlan(EMPTY, door, { dryRun: false, banks: banksOf(exportWith([HSBC_EGP], [txn(1, 'hsbc-egp', 'sms')])) });
  assert.equal(filed.length, 0, 'a proposal the record will refuse was filed anyway');
  assert.equal(report.banks?.filed, 0);
  assert.equal(report.banks?.waiting.length, 1);
  const line = said(report, { dryRun: false, file: 'export.json' }).find((l) => l.includes('HSBC Egypt'));
  assert.ok(line, 'the report is silent about the pack it did not file');
  assert.match(line, /Money 1\.7\.0/u);
  /* THE RANGE AS A SENTENCE, not as `>=1.8.0 <3.0.0`: since bank-hsbc-eg 1.0.1 the range has two ends, and read as
     written a person meets two operators where a caret was one. The floor is still the update that has to come first. */
  assert.match(line, /needs Money 1\.8\.0 or later, before 3\.0\.0/u);
  assert.match(line, /Take the Money update/u);
});

test('a record with no money-core at all is told so rather than offered a pack that needs it', async () => {
  const { door, filed } = record(null);
  const report = await applyPlan(EMPTY, door, { dryRun: false, banks: banksOf(exportWith([HSBC_EGP], [txn(1, 'hsbc-egp', 'sms')])) });
  assert.equal(filed.length, 0);
  assert.match(report.banks?.waiting[0] ?? '', /no Money/u);
});

test('an export that shows no HSBC use adds no line to the report', async () => {
  const { door } = record('1.8.0');
  const report = await applyPlan(EMPTY, door, { dryRun: false, banks: [] });
  assert.ok(!said(report, { dryRun: false, file: 'export.json' }).some((l) => l.startsWith('Banks:') || l.includes('HSBC')));
});

test('an HSBC account whose rows were typed, beside another account whose rows came by text, is not HSBC Egypt use', () => {
  /* THE TEXT HAS TO BE ON THE HSBC ACCOUNT. Checked by mutation on 22 September: with the account match taken out of
     `banksOf`, every test above still passed, because none of them held an HSBC account and a text on some other one. */
  assert.deepEqual(banksOf(exportWith([HSBC_EGP, OTHER], [txn(1, 'hsbc-egp', 'sheet'), txn(2, 'main', 'sms')])), []);
});

test('a record that already holds the pack is not offered it again, however it came to hold it', async () => {
  /* INSTALLED BY HAND, with nothing on Decide to say so. The pack's own header names that road ("whoever banks with
     HSBC Egypt installs it"), and `propose` does not refuse a pack the record already holds, so reading Decide alone
     filed a second offer of a pack that was already reading his texts. */
  const { door, filed } = record('1.8.0');
  const held = door.packs!;
  door.packs = async () => {
    const got = await held();
    return got.ok ? { ok: true, value: [...got.value, { id: 'bank-hsbc-eg', version: '1.0.0' }] } : got;
  };
  const report = await applyPlan(EMPTY, door, { dryRun: false, banks: banksOf(exportWith([HSBC_EGP], [txn(1, 'hsbc-egp', 'sms')])) });
  assert.equal(filed.length, 0, 'the pack was offered to a record that holds it');
  assert.deepEqual(report.banks, { filed: 0, before: 1, waiting: [] });
});
