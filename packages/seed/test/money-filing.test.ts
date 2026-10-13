/**
 * Filing rules (REC-B10 job 3), read through the kernel on a record that installed Money the way a person does, with
 * no example entries. "Categorising rules: prefix, contains, regex, ranked, dry run" and "no category is better than a
 * wrong one" (the owner's words).
 *
 * WHAT WAS WRONG. One rule filed a Ledger entry by finding a category whose "Matches" was the entry's description. It
 * read neither which way the category goes nor whether it was retired, so a category for money in was put on money
 * going out, and one category held one spelling.
 *
 * RED FIRST: before the list there is no `filing_rules` to write a rule into, so every test here fails at its first
 * create. With the list in and the category rule still linking on `categories`, each fails on the entry's category.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, REGISTERS, day, firstPartyDocument } from '../src/index.ts';

const OWNER = { actor: 'p_1' };

type Result<T> = { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Result<T>;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

type Fresh = { k: Kernel; outing: Entry; clients: Entry; card: Entry; cash: Entry };

/** A fresh record holding Money: a category for money out, one for money in, and two accounts in pounds. */
async function fresh(): Promise<Fresh> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const outing = value<Entry>(k.create('categories', { name: 'Outing', direction: 'out', state: 'live' }, OWNER));
  const clients = value<Entry>(k.create('categories', { name: 'Clients', direction: 'in', state: 'live' }, OWNER));
  const account = (name: string): Entry => value<Entry>(k.create('accounts', { name, kind: 'bank', balance: { amount: 100_000, currency: 'GBP' }, as_of: day(-1) }, OWNER));
  return { k, outing, clients, card: account('Card'), cash: account('Cash box') };
}

/** One filing rule. What a test does not say is left to the list's own defaults. */
const rule = (k: Kernel, fields: Record<string, unknown>): Entry => value<Entry>(k.create('filing_rules', fields, OWNER));

/** One cleared Ledger entry with no category, read back after the record's rules have run over it. */
const paid = (k: Kernel, on: Entry, direction: 'in' | 'out', fields: Record<string, unknown>): Entry => {
  const made = value<Entry>(k.create('transactions', { on: day(-2), direction, amount: { amount: 1_250, currency: 'GBP' }, account: on.id, state: 'cleared', ...fields }, OWNER));
  return k.get(made.id) as Entry;
};

test('THE LIST IS DECLARED, and the Ledger says which rule filed an entry without spending an index', () => {
  const fields = (list: string) => REGISTERS[list]?.fields ?? [];
  const field = (list: string, id: string) => fields(list).find((f) => f.id === id) as Record<string, unknown> | undefined;
  assert.deepEqual(
    fields('filing_rules').map((f) => f.id),
    ['match', 'match_by', 'reads', 'direction', 'category', 'account', 'rank', 'state', 'note'],
  );
  assert.deepEqual(field('filing_rules', 'match_by')?.values, ['exact', 'starts', 'contains', 'pattern']);
  /* THE CHOICE SAYS THE FIELD IT READS. A rule that reads `payee` is tried on the Ledger's `counterparty_text`, which
     the Ledger labels "As the bank wrote it", so the choice carries those words and not the name of another field.
     The value it stores stays `payee`, so no rule already written moves. */
  assert.deepEqual(field('filing_rules', 'reads')?.values, ['payee', 'description']);
  assert.equal(field('filing_rules', 'reads')?.default, 'payee');
  assert.equal(field('transactions', 'counterparty_text')?.label, 'As the bank wrote it');
  assert.deepEqual(field('filing_rules', 'reads')?.labels, { payee: 'As the bank wrote it', description: 'The description' });
  assert.deepEqual(field('filing_rules', 'direction')?.values, ['in', 'out', 'either']);
  assert.deepEqual(field('filing_rules', 'state')?.values, ['on', 'off']);
  assert.equal(field('filing_rules', 'account')?.required, undefined);
  /* THE FOURTH RUNG ON A CATEGORY TOO, for the one version its "Matches" stays (rules-link-54, item 5). */
  assert.deepEqual(field('categories', 'match_by')?.values, ['exact', 'starts', 'contains', 'pattern']);
  assert.equal((field('categories', 'match_by')?.labels as Record<string, string>).pattern, 'A pattern');
  assert.equal(field('transactions', 'filed_by')?.to, 'filing_rules');
  assert.equal(field('transactions', 'filed_by')?.index, undefined);
  /* A list is declared before the list that links to it, so the Ledger's link finds its target at install. */
  const order = Object.keys(REGISTERS);
  assert.ok(order.indexOf('categories') < order.indexOf('filing_rules'));
  assert.ok(order.indexOf('filing_rules') < order.indexOf('transactions'));
});

test('A RULE THAT IS ON FILES AN ENTRY, and the entry says which rule filed it', async () => {
  const { k, outing, card } = await fresh();
  const talabat = rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: outing.id });
  const filed = paid(k, card, 'out', { what: 'POS purchase 4471', counterparty_text: 'TALABAT CAIRO' });
  assert.equal(filed.fields.category, outing.id);
  assert.equal(filed.fields.filed_by, talabat.id);
  /* NOTHING MATCHES, SO NOTHING IS FILED: no category is better than a wrong one. */
  const other = paid(k, card, 'out', { what: 'POS purchase 4472', counterparty_text: 'FENWICK CLOUD' });
  assert.equal(other.fields.category, undefined);
  assert.equal(other.fields.filed_by, undefined);
});

test('A RULE THAT IS OFF FILES NOTHING', async () => {
  const { k, outing, card } = await fresh();
  rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: outing.id, state: 'off' });
  const left = paid(k, card, 'out', { what: 'POS purchase', counterparty_text: 'Talabat Cairo' });
  assert.equal(left.fields.category, undefined);
  assert.equal(left.fields.filed_by, undefined);
});

test('A DEBIT NEVER TAKES AN INCOME CATEGORY, and a rule for either way files both', async () => {
  const { k, outing, clients, card } = await fresh();
  const income = rule(k, { match: 'Fenwick', match_by: 'starts', direction: 'in', category: clients.id });
  const debit = paid(k, card, 'out', { what: 'Card payment', counterparty_text: 'FENWICK CLOUD LTD' });
  assert.equal(debit.fields.category, undefined);
  assert.equal(debit.fields.filed_by, undefined);
  const credit = paid(k, card, 'in', { what: 'Transfer received', counterparty_text: 'FENWICK CLOUD LTD' });
  assert.equal(credit.fields.category, clients.id);
  assert.equal(credit.fields.filed_by, income.id);

  const either = rule(k, { match: 'Talabat', match_by: 'contains', direction: 'either', category: outing.id });
  for (const way of ['in', 'out'] as const) {
    const filed = paid(k, card, way, { what: 'Card', counterparty_text: 'POS TALABAT 99' });
    assert.equal(filed.fields.category, outing.id, way);
    assert.equal(filed.fields.filed_by, either.id, way);
  }
});

test('A PATTERN FILES EVERY SPELLING IT NAMES, and one the record could not run is refused as it is written', async () => {
  const { k, outing, card } = await fresh();
  const both = rule(k, { match: 'TALABAT|TLBT', match_by: 'pattern', direction: 'out', category: outing.id });
  for (const said of ['Talabat Cairo', 'TLBT*ORDER 5512']) {
    const filed = paid(k, card, 'out', { what: 'Card', counterparty_text: said });
    assert.equal(filed.fields.category, outing.id, said);
    assert.equal(filed.fields.filed_by, both.id, said);
  }
  assert.equal(paid(k, card, 'out', { what: 'Card', counterparty_text: 'Tallyard' }).fields.category, undefined);
  /* A REPEAT INSIDE A REPEATED GROUP can take for ever on one long text, and it would take the write with it. */
  const refused = k.create('filing_rules', { match: '(a+)+$', match_by: 'pattern', direction: 'out', category: outing.id }, OWNER) as Result<Entry>;
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'VALUE_MALFORMED');
});

test('A RULE THAT NAMES AN ACCOUNT FILES ON THAT ACCOUNT ALONE', async () => {
  const { k, outing, card, cash } = await fresh();
  const onCard = rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: outing.id, account: card.id });
  assert.equal(paid(k, cash, 'out', { what: 'Lunch', counterparty_text: 'Talabat' }).fields.category, undefined);
  const filed = paid(k, card, 'out', { what: 'Lunch', counterparty_text: 'Talabat' });
  assert.equal(filed.fields.category, outing.id);
  assert.equal(filed.fields.filed_by, onCard.id);
});

test('"AS THE BANK WROTE IT" IS READ FIRST, and a rule on the description files where no such rule fits', async () => {
  const { k, outing, clients, card } = await fresh();
  const byDescription = rule(k, { match: 'Lunch', match_by: 'starts', reads: 'description', direction: 'out', category: clients.id });
  const byPayee = rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: outing.id });
  /* An entry typed by hand has a description and nothing else, and a rule that reads the payee does not read it. */
  const typed = paid(k, card, 'out', { what: 'Lunch with the team' });
  assert.equal(typed.fields.category, clients.id);
  assert.equal(typed.fields.filed_by, byDescription.id);
  assert.equal(paid(k, card, 'out', { what: 'Talabat order' }).fields.category, undefined);
  /* Both fit, and the two fields agree: the category is the payee rule's, and so is the rule named. */
  const both = paid(k, card, 'out', { what: 'Lunch with the team', counterparty_text: 'Talabat Cairo' });
  assert.equal(both.fields.category, outing.id);
  assert.equal(both.fields.filed_by, byPayee.id);
});

test('TWO RULES THAT FIT EQUALLY FILE NOTHING, and the longer text wins where one is longer', async () => {
  const { k, outing, clients, card } = await fresh();
  rule(k, { match: 'Fenwick', match_by: 'starts', direction: 'out', category: outing.id });
  rule(k, { match: 'Fenwick', match_by: 'starts', direction: 'either', category: clients.id });
  assert.equal(paid(k, card, 'out', { what: 'Card', counterparty_text: 'Fenwick Cloud' }).fields.category, undefined);
  const longer = rule(k, { match: 'Fenwick Cloud', match_by: 'starts', direction: 'out', category: outing.id });
  const filed = paid(k, card, 'out', { what: 'Card', counterparty_text: 'Fenwick Cloud Ltd' });
  assert.equal(filed.fields.category, outing.id);
  assert.equal(filed.fields.filed_by, longer.id);
});

test('A CATEGORY SET BY HAND IS LEFT ALONE, and so is an entry between a person\'s own accounts', async () => {
  const { k, outing, clients, card } = await fresh();
  rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: outing.id });
  const byHand = paid(k, card, 'out', { what: 'Card', counterparty_text: 'Talabat', category: clients.id });
  assert.equal(byHand.fields.category, clients.id);
  assert.equal(byHand.fields.filed_by, undefined);
  const moved = paid(k, card, 'out', { what: 'Card', counterparty_text: 'Talabat', transfer: true });
  assert.equal(moved.fields.category, undefined);
});

/**
 * Whether a rule's category is live is a question about the row the rule points at. The rule's filter reads one list
 * (`via` is refused), so the answer is the link's: `take` leaves out a category that was deleted or that its own list
 * calls done, and `also` writes the rule found into `filed_by` only where the category was taken. It was a second
 * lookup that never asked, and the entry named a rule and held no category.
 */
test('A RETIRED CATEGORY FILES NOTHING', async () => {
  const { k, outing, card } = await fresh();
  rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: outing.id });
  value(k.update('categories', outing.id, { state: 'retired' }, OWNER));
  const left = paid(k, card, 'out', { what: 'Card', counterparty_text: 'Talabat Cairo' });
  assert.equal(left.fields.category, undefined);
  assert.equal(left.fields.filed_by, undefined);
});

test('A CATEGORY\'S OWN "MATCHES" STILL FILES FOR THE VERSION IT STAYS, the right way only, and a filing rule wins over it', async () => {
  const { k, outing, clients, card } = await fresh();
  value(k.update('categories', clients.id, { match: 'FENWICK CLOUD' }, OWNER));
  /* Money out is not filed under a category for money in, which the old link did. */
  assert.equal(paid(k, card, 'out', { what: 'FENWICK CLOUD' }).fields.category, undefined);
  const credit = paid(k, card, 'in', { what: 'FENWICK CLOUD' });
  assert.equal(credit.fields.category, clients.id);
  assert.equal(credit.fields.filed_by, undefined);
  /* A retired category's "Matches" files nothing: this link reads the category itself, so it can ask. */
  value(k.update('categories', clients.id, { state: 'retired' }, OWNER));
  assert.equal(paid(k, card, 'in', { what: 'FENWICK CLOUD' }).fields.category, undefined);

  value(k.update('categories', outing.id, { match: 'TALLYARD', direction: 'both' }, OWNER));
  const refund = rule(k, { match: 'TALLYARD', match_by: 'exact', reads: 'description', direction: 'in', category: clients.id, state: 'off' });
  assert.equal(paid(k, card, 'in', { what: 'TALLYARD' }).fields.category, outing.id);
  value(k.update('categories', clients.id, { state: 'live' }, OWNER));
  value(k.update('filing_rules', refund.id, { state: 'on' }, OWNER));
  const filed = paid(k, card, 'in', { what: 'TALLYARD' });
  assert.equal(filed.fields.category, clients.id);
  assert.equal(filed.fields.filed_by, refund.id);
});
