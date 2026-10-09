/**
 * A card bill paid from the bank is a move between two of your own accounts, and reconciling it does not make it
 * spend.
 *
 * WHAT WENT WRONG. money-core 2.2.0 said `settles is empty` in `pairs.where:`, so a row that paid an obligation was
 * nobody's partner. The card bill is both at once: a promise with a date, which a founder keeps in Obligations so the
 * forecast holds it, and a move from Tamarisk to his own card. The import writes both legs bare, the record pairs them, and
 * then Reconcile sets `settles` on the bank leg, which is what Reconcile is. The kernel reads `settles` again on that
 * update, the leg stops matching `where:`, and both marks go false: measured, Spent read EGP 9,500.00 and Received
 * EGP 9,500.00 on top of the purchases the bill paid, which are already in Spent on the card.
 *
 * WHY THE DECLARATION CANNOT SIMPLY ASK FOR THE CARD. The bank leg of a card bill and a rent payment that settles its
 * obligation are the same row: out of a bank account, no Who, a Settles. Their partners are the same row too: in, bare,
 * another account. What tells them apart is the obligation's payee or the other account's kind, and both are a hop
 * through a ref that `pairs.where` refuses (`packages/kernel/src/pairs.ts`, `pairsFault`: no ref lookup on a write).
 * `packages/kernel` knows no card bill, since the kernel carries no use case, so the answer is in money-core.
 *
 * WHAT money-core 2.3.0 SAYS INSTEAD: a leg that settles something may still be a leg when the record already holds it
 * as one. See the declaration in `modules/money.ts` for the clause and the cost, which the last test below records.
 *
 * RED FIRST, AT `653ae663` with money-core 2.2.0 and this file: all three failed. The first on the card leg's mark,
 * `false` once the bank leg was reconciled; the second on the reconciled leg's `_pair`, `null` before any Who was named;
 * the third on the rent, which reconciling parted from the client, as 2.2.0 meant it to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, day, firstPartyDocument } from '../src/index.ts';

const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
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

/** A record holding money-core as the pack document says it, and what it points at, with no example rows. */
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

/** A Tamarisk current account, Corvane savings and the Tamarisk card, which is not cash. Both banks are invented. */
function hisAccounts(k: Kernel): Record<'Tamarisk' | 'Corvane' | 'Card', Entry> {
  const acct = (name: string, kind: string) =>
    value<Entry>(k.create('accounts', { name, kind, balance: { amount: 0, currency: 'EGP' }, as_of: day(-1) }, OWNER));
  return { Tamarisk: acct('Tamarisk current', 'bank'), Corvane: acct('Corvane savings', 'bank'), Card: acct('Tamarisk card', 'card') };
}

const egpRow = (k: Kernel, what: string, on: number, direction: 'in' | 'out', minor: number, account: Entry, more: Record<string, unknown> = {}) =>
  value<Entry>(k.create('transactions', { what, on: day(on), direction, amount: { amount: minor, currency: 'EGP' }, account: account.id, state: 'cleared', ...more }, OWNER));

const owedByMe = (k: Kernel, what: string, minor: number, due: number): Entry =>
  value<Entry>(k.create('obligations', { what, direction: 'owed_by_me', amount: { amount: minor, currency: 'EGP' }, due: day(due), state: 'open' }, OWNER));

const figure = (k: Kernel, id: 'spent-30d' | 'received-30d'): number => {
  const read = k.metric(METRICS[id] as never);
  assert.ok(read.ok, sayOf(read));
  return read.value.value as number;
};

const pairOf = (k: Kernel, e: Entry): unknown => k.get(e.id)!.fields._pair ?? null;

test('THE CARD BILL RECONCILED STAYS A MOVE, so EGP 9,500.00 is neither spent nor received a second time', async () => {
  /* THE CARD BILL AS A REAL LEDGER HOLDS IT: the card's leg lands a day before the bank's, both written bare by the import,
     and the obligation is the one a founder keeps so the forecast holds the bill. */
  const k = await moneyCore();
  const a = hisAccounts(k);
  const bill = owedByMe(k, 'Tamarisk card bill, September', 950_000, -1);
  const cardIn = egpRow(k, 'PAYMENT RECEIVED', -2, 'in', 950_000, a.Card);
  const bankOut = egpRow(k, 'CREDIT CARD PAYMENT', -1, 'out', 950_000, a.Tamarisk);
  assert.equal(pairOf(k, bankOut), cardIn.id, 'the two legs did not pair before anything was reconciled, so this case measures nothing');

  /* RECONCILE IS THIS ONE FIELD (`money.ts`, beside `settles`). */
  value(k.update('transactions', bankOut.id, { settles: bill.id }, OWNER));
  for (const e of [cardIn, bankOut]) assert.equal(k.get(e.id)!.fields.transfer, true, `${String(e.fields.what)} stopped being a move when the bill was reconciled`);
  assert.equal(pairOf(k, bankOut), cardIn.id);
  assert.equal(pairOf(k, cardIn), bankOut.id);
  assert.equal(figure(k, 'spent-30d'), 0, 'paying the card from the bank, reconciled, was counted as spent');
  assert.equal(figure(k, 'received-30d'), 0, "the card's leg of its own bill was counted as received");
});

test('A RECONCILED CARD BILL STILL COMES APART WHEN A PERSON NAMES WHO IT WAS WITH, and a void leg is still nobody\'s partner', async () => {
  /* THE CLAUSE LOOSENS `settles` AND NOTHING ELSE. Naming a Who is the repair `money-pairs.test.ts`'s dinner test relies on, and a
     void leg was never counted; both have to part a pair that a Settles now keeps. */
  const k = await moneyCore();
  const a = hisAccounts(k);
  const bill = owedByMe(k, 'Tamarisk card bill, September', 950_000, -1);
  const cardIn = egpRow(k, 'PAYMENT RECEIVED', -2, 'in', 950_000, a.Card);
  const bankOut = egpRow(k, 'CREDIT CARD PAYMENT', -1, 'out', 950_000, a.Tamarisk);
  value(k.update('transactions', bankOut.id, { settles: bill.id }, OWNER));
  assert.equal(pairOf(k, bankOut), cardIn.id);

  const tamarisk = value<Entry>(k.create('people', { name: 'Tamarisk' }, OWNER));
  value(k.update('transactions', bankOut.id, { party: tamarisk.id }, OWNER));
  for (const e of [cardIn, bankOut]) assert.equal(pairOf(k, e), null, `${String(e.fields.what)} stayed paired after a Who was named`);

  const k2 = await moneyCore();
  const b = hisAccounts(k2);
  const bill2 = owedByMe(k2, 'Tamarisk card bill, September', 950_000, -1);
  const cardIn2 = egpRow(k2, 'PAYMENT RECEIVED', -2, 'in', 950_000, b.Card);
  const bankOut2 = egpRow(k2, 'CREDIT CARD PAYMENT', -1, 'out', 950_000, b.Tamarisk);
  value(k2.update('transactions', bankOut2.id, { settles: bill2.id }, OWNER));
  value(k2.update('transactions', cardIn2.id, { state: 'void' }, OWNER));
  assert.equal(pairOf(k2, bankOut2), null, 'the reconciled leg kept a void partner');
  assert.equal(figure(k2, 'spent-30d'), 950_000);
});

test('WHAT THE CLAUSE COSTS, HELD ON PURPOSE: which was written first decides, and reconciling no longer parts a pair', async () => {
  /* ORDER DECIDES, WHICH THE KERNEL'S OWN PAIRING TAKES CARE NOT TO LET IT DO (`pairs.ts`, `partnerOf`). A leg that
     settles is let in only while it already holds the mark, so it keeps a pair it has and never starts one. Measured
     with money-core 2.3.0: */

  /* 1. THE BANK LEG RECONCILED BEFORE THE CARD'S LEG ARRIVES pairs with nothing, and the bill is counted both ways, as
        every order was at 2.2.0. An import writes the card's leg first and Reconcile is a person's act afterwards, which
        is the order the first test holds. */
  const k = await moneyCore();
  const a = hisAccounts(k);
  const bill = owedByMe(k, 'Tamarisk card bill, September', 950_000, -1);
  const bankOut = egpRow(k, 'CREDIT CARD PAYMENT', -2, 'out', 950_000, a.Tamarisk, { settles: bill.id });
  const cardIn = egpRow(k, 'PAYMENT RECEIVED', -1, 'in', 950_000, a.Card);
  assert.equal(pairOf(k, bankOut), null, 'a leg that settled before its partner arrived now pairs, so the limit written beside `pairs:` is out of date');
  assert.equal(pairOf(k, cardIn), null);

  /* 1b. AND WHATEVER THE ORDER OF THE TWO LEGS, A RECONCILED LEG HOLDING NO PAIR GAINS NONE. A bank alert writes the leg
         pending, and reconciling it then, before it clears, leaves it unpaired once it has cleared, although a pending
         leg that was not reconciled pairs when it clears. A pair parted for a moment stays parted too: a mistyped amount
         on the card's leg, put right, leaves the bill counted. Both measured. */
  const k3 = await moneyCore();
  const c = hisAccounts(k3);
  const bill3 = owedByMe(k3, 'Tamarisk card bill, September', 950_000, -1);
  egpRow(k3, 'PAYMENT RECEIVED', -2, 'in', 950_000, c.Card);
  const alert = egpRow(k3, 'CREDIT CARD PAYMENT', -1, 'out', 950_000, c.Tamarisk, { state: 'pending' });
  value(k3.update('transactions', alert.id, { settles: bill3.id }, OWNER));
  value(k3.update('transactions', alert.id, { state: 'cleared' }, OWNER));
  assert.equal(pairOf(k3, alert), null, 'a leg reconciled while pending now pairs when it clears, so the cost written beside `pairs:` is out of date');

  const k4 = await moneyCore();
  const d = hisAccounts(k4);
  const bill4 = owedByMe(k4, 'Tamarisk card bill, September', 950_000, -1);
  const cardIn4 = egpRow(k4, 'PAYMENT RECEIVED', -2, 'in', 950_000, d.Card);
  const bankOut4 = egpRow(k4, 'CREDIT CARD PAYMENT', -1, 'out', 950_000, d.Tamarisk);
  value(k4.update('transactions', bankOut4.id, { settles: bill4.id }, OWNER));
  value(k4.update('transactions', cardIn4.id, { amount: { amount: 950_001, currency: 'EGP' } }, OWNER));
  value(k4.update('transactions', cardIn4.id, { amount: { amount: 950_000, currency: 'EGP' } }, OWNER));
  assert.equal(pairOf(k4, bankOut4), null, 'a reconciled leg parted by a typo now pairs again once it is put right, so the cost written beside `pairs:` is out of date');
  assert.equal(figure(k4, 'spent-30d'), 950_000);

  /* 2. RENT AND A CLIENT'S PAYMENT OF THE SAME SUM, BOTH BARE, pair as `money-pairs.test.ts`'s dinner test says two bare rows do; at
        2.2.0 reconciling the rent against its obligation parted them, and now it does not. The two rows are the card
        bill's two rows field for field, so no flat clause can keep the one pair and part the other. Naming a Who still
        parts it, and a rent written already reconciled is never paired. */
  const k2 = await moneyCore();
  const b = hisAccounts(k2);
  const rent = owedByMe(k2, 'Rent, October', 1_500_000, -5);
  const paid = egpRow(k2, 'RENT OCTOBER', -5, 'out', 1_500_000, b.Tamarisk);
  const client = egpRow(k2, 'INVOICE 0412 ACME', -4, 'in', 1_500_000, b.Corvane);
  value(k2.update('transactions', paid.id, { settles: rent.id }, OWNER));
  assert.equal(pairOf(k2, paid), client.id, 'reconciling the rent parted it from the client again, so the cost written beside `pairs:` is out of date');
  const acme = value<Entry>(k2.create('people', { name: 'Acme' }, OWNER));
  value(k2.update('transactions', client.id, { party: acme.id }, OWNER));
  assert.equal(pairOf(k2, paid), null, 'naming the client did not part the rent from it');
  assert.equal(figure(k2, 'spent-30d'), 1_500_000);
});
