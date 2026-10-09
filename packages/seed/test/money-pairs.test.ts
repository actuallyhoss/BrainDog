/**
 * money-core declares `pairs:` on `transactions`, so the kernel marks a transfer's two legs and the ledger stops counting
 * money that only moved.
 *
 * UNTIL THIS, A PERSON MARKED BOTH LEGS OR NOBODY DID. Every Ledger figure says `transfer is false` and the field defaults
 * to false, and an import writes a move between two of one person's accounts as two ordinary rows. The kernel has the
 * register option in the kernel's write path (`packages/kernel/src/pairs.ts`); a register that does not declare it is
 * paired by nothing, so the build did nothing for Money until the pack said it.
 *
 * THE DECLARATION IS `on: [abs(amount)]` AND NOT `on: [currency, abs(amount)]` as it was first spelled, because
 * `transactions` has no `currency` field: the currency is inside the money, and `abs()` on a money compares size and
 * currency together. A GBP 4,000.00 leg and an EGP 4,000.00 leg are not one transfer, and the second test below says so.
 *
 * AND IT SAYS `where: state is cleared`, because every Ledger figure counts only cleared rows, and a void or pending
 * row as a partner hides the real payment beside it: measured, Spent read GBP 0.00 against 250.00. The third test holds
 * that against this pack's own declaration.
 *
 * RED FIRST, AT `bab716a5` with this file and no declaration: the two legs came back with `transfer` false and no
 * `_pair`, and "Spent, 30 days" counted the leg leaving the current account as GBP 4,000.00 spent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, TRANSACTIONS, day, firstPartyDocument, forWrite, installSeed } from '../src/index.ts';

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

/** Two accounts, as the ledger's `account` refs name them. */
function accounts(k: Kernel): [Entry, Entry] {
  const current = value<Entry>(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(-1) }, OWNER));
  const reserve = value<Entry>(k.create('accounts', { name: 'Reserve', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(-1) }, OWNER));
  return [current, reserve];
}

/** The sample's two legs of its one transfer, by what the bank called them. */
const LEGS = ['TRANSFER TO TAX RESERVE', 'TRANSFER FROM CURRENT'];
const legOf = (what: string) => {
  const row = TRANSACTIONS.find((t) => t.what === what);
  assert.ok(row, `the sample lost ${what}`);
  return row;
};

const spent30d = (k: Kernel): number => {
  const read = k.metric(METRICS['spent-30d'] as never);
  assert.ok(read.ok, sayOf(read));
  return read.value.value as number;
};

test("THE SAMPLE'S TWO LEGS, WRITTEN AS THE BANK SENDS THEM, ARE MARKED BY THE RECORD and Spent, 30 days leaves them out", async () => {
  const k = await moneyCore();
  value(k.create('accounts', { name: 'Studio current account', kind: 'bank', balance: { amount: 985_000, currency: 'GBP' }, as_of: day(-1) }, OWNER));
  value(k.create('accounts', { name: 'Tax reserve', kind: 'bank', balance: { amount: 2_400_000, currency: 'GBP' }, as_of: day(-9) }, OWNER));

  /* NOTHING SAYS THEY ARE A TRANSFER. `transfer` is taken off, as a statement or a text message would leave it, and the
     day is moved three days back, inside the figure's window: the sample dates them day -30, which "Spent, 30 days"
     already leaves out as the first day before its window, so the figure could not tell a mark from a miss there. */
  const made: Entry[] = LEGS.map((what) => {
    const { transfer: _typed, ...fields } = legOf(what);
    return value<Entry>(k.create('transactions', { ...forWrite('transactions', fields), on: day(-3) }, OWNER));
  });
  const [out, into] = made.map((e) => k.get(e.id)!);

  assert.equal(out!.fields.transfer, true, 'the leg leaving the current account is not marked');
  assert.equal(into!.fields.transfer, true, 'the leg arriving in the reserve is not marked');
  assert.equal(out!.fields._pair, into!.id, 'the leaving leg does not name the arriving one');
  assert.equal(into!.fields._pair, out!.id, 'the arriving leg does not name the leaving one');
  assert.equal(spent30d(k), 0, 'a move between two of your own accounts was counted as spent');
});

test('THE SAME ACCOUNT, ANOTHER CURRENCY, OR TWO EQUALLY NEAR LEGS IS NOT A TRANSFER, so an ordinary payment stays counted', async () => {
  const k = await moneyCore();
  const [current, reserve] = accounts(k);
  const row = (what: string, direction: 'in' | 'out', account: Entry, amount = { amount: 50_000, currency: 'GBP' }) =>
    value<Entry>(k.create('transactions', { what, on: day(-2), direction, amount, account: account.id, state: 'cleared' }, OWNER));
  const marked = (e: Entry) => k.get(e.id)!.fields.transfer;

  /* A REFUND INTO THE SAME ACCOUNT IS NOT A MOVE BETWEEN TWO. */
  const paid = row('FENWICK CLOUD', 'out', current);
  const refund = row('FENWICK CLOUD REFUND', 'in', current);
  /* THE SAME FIGURE IN ANOTHER CURRENCY IS ANOTHER AMOUNT. */
  const egp = row('INSTAPAY IN', 'in', reserve, { amount: 50_000, currency: 'EGP' });
  for (const e of [paid, refund, egp]) assert.equal(marked(e), false, `${String(e.fields.what)} was marked`);

  /* THE REAL OTHER LEG PAIRS WITH THE PAYMENT. */
  const leg = row('FROM CURRENT', 'in', reserve);
  assert.equal(k.get(leg.id)!.fields._pair, paid.id);
  assert.equal(k.get(paid.id)!.fields._pair, leg.id);

  /* A SECOND EQUAL CREDIT ON THE SAME DAY IS AS NEAR AS THE FIRST, and the kernel does not guess which of two equal legs
     was the move (`pairs.ts`, `nearestOf`): the pair it had comes apart and all three are counted, which is the side a
     mistake should fall on. This pack's first draft said the third row "finds nobody
     left to pair with" and checked only the third row, which still passes; measured against `974319fb`,
     the payment and the first credit had lost their `_pair` as well, which is what is checked here. */
  const again = row('FROM CURRENT AGAIN', 'in', reserve);
  for (const e of [paid, leg, again]) assert.equal(marked(e), false, `${String(e.fields.what)} stayed marked beside a tie`);
});

test("A VOID OR PENDING CREDIT IS NOBODY'S PARTNER, so the cleared payment beside it stays in Spent", async () => {
  /* A VOID CREDIT AND A PENDING ONE, ON money-core AS IT SHIPS, EACH ON A RECORD OF ITS OWN. Both credits on one record sat a
     day either side of the payment, and two equally near legs are a tie the kernel does not break, so with `where:`
     taken out the payment still came back unmarked and the test passed for the wrong reason. Measured:
     apart, each credit is the payment's one nearest leg, and without `where:` both cases go red. */
  for (const state of ['void', 'pending'] as const) {
    const k = await moneyCore();
    const [current, reserve] = accounts(k);
    const row = (what: string, direction: 'in' | 'out', account: Entry, rowState: string) =>
      value<Entry>(k.create('transactions', { what, on: day(-3), direction, amount: { amount: 25_000, currency: 'GBP' }, account: account.id, state: rowState }, OWNER));

    const paid = row('RENT SHARE', 'out', current, 'cleared');
    const credit = row(`CREDIT, ${state.toUpperCase()}`, 'in', reserve, state);
    for (const e of [paid, credit]) assert.equal(k.get(e.id)!.fields.transfer, false, `beside a ${state} credit, ${String(e.fields.what)} was marked`);
    assert.equal(spent30d(k), 25_000, `the cleared payment was hidden by a ${state} credit that was never counted`);

    /* AND WHEN A PENDING CREDIT CLEARS, IT IS THE OTHER LEG. A pending row is what a bank alert writes first, and the
       state is one of the fields `where:` reads, so the update is looked at again rather than left as it was written. */
    if (state !== 'pending') continue;
    value(k.update('transactions', credit.id, { state: 'cleared' }, OWNER));
    assert.equal(k.get(paid.id)!.fields._pair, credit.id, 'the credit cleared and the payment did not find it');
    assert.equal(spent30d(k), 0);
  }
});

/**
 * THE SAMPLE KEEPS ITS TYPED MARK, because the browser's sample reads the same rows with no write path (`money.ts`,
 * beside the two legs). A typed `true` on a create is a person's say (`pairs.ts`, `markPinned`), so the record pairs
 * neither leg and writes no `_pair`; what this holds is that the declaration pairs nothing else among the sample's rows.
 */
test('THE SAMPLE RECORD PAIRS NOTHING IN ITS LEDGER, and its three typed marks stand', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await installSeed(k)).ok);
  const rows = value<{ rows: Entry[] }>(k.list({ register: 'transactions', limit: 500 })).rows;
  assert.ok(rows.length >= 30, `the sample ledger holds ${rows.length} rows`);
  const paired = rows.filter((r) => r.fields._pair !== undefined && r.fields._pair !== null).map((r) => String(r.fields.what));
  assert.deepEqual(paired, [], 'the record paired rows of the sample');
  /* THE CARD BILL STAYS MARKED BY HAND. Its other leg is the card's own statement, which the ledger does not hold. */
  const marked = rows.filter((r) => r.fields.transfer === true).map((r) => String(r.fields.what)).sort();
  assert.deepEqual(marked, ['COMPANY CARD, AUGUST BILL', ...LEGS].sort());
});

/* ── moves that are not moves: rent and a client, a repaid dinner, a refund ─────────────────────────────────────── */

/** Tamarisk and Corvane in pounds and a card, the three EGP accounts a ledger moves between (both banks invented), and people to name as Who. */
function hisAccounts(k: Kernel): Record<'Tamarisk' | 'Corvane' | 'Card', Entry> {
  const acct = (name: string, kind: string) =>
    value<Entry>(k.create('accounts', { name, kind, balance: { amount: 0, currency: 'EGP' }, as_of: day(-1) }, OWNER));
  return { Tamarisk: acct('Tamarisk', 'bank'), Corvane: acct('Corvane', 'bank'), Card: acct('Card', 'card') };
}
const who = (k: Kernel, name: string): Entry => value<Entry>(k.create('people', { name }, OWNER));
const egpRow = (k: Kernel, what: string, on: number, direction: 'in' | 'out', minor: number, account: Entry, more: Record<string, unknown> = {}) =>
  value<Entry>(k.create('transactions', { what, on: day(on), direction, amount: { amount: minor, currency: 'EGP' }, account: account.id, state: 'cleared', ...more }, OWNER));
const pairOf = (k: Kernel, e: Entry): unknown => k.get(e.id)!.fields._pair ?? null;

test("RENT TO THE LANDLORD AND A CLIENT'S PAYMENT OF THE SAME ROUND SUM A DAY LATER ARE NOT ONE MOVE, once either says who it was with", async () => {
  /* RENT AND A CLIENT'S PAYMENT OF ONE SUM, with the one thing a person writes on these two
     rows and never on a move between his own accounts: who the other side was. Only the client's row names anybody,
     because one leg that cannot be a leg is enough to keep the pair apart. */
  const k = await moneyCore();
  const a = hisAccounts(k);
  const rent = egpRow(k, 'RENT OCTOBER', -5, 'out', 1_500_000, a.Tamarisk);
  const invoice = egpRow(k, 'INVOICE 0412 ACME', -4, 'in', 1_500_000, a.Corvane, { party: who(k, 'Acme').id });
  for (const e of [rent, invoice]) assert.equal(k.get(e.id)!.fields.transfer, false, `${String(e.fields.what)} was marked a move between his own accounts`);
  assert.equal(pairOf(k, rent), null);
  assert.equal(spent30d(k), 1_500_000, 'the rent left Spent');

  /* AND THE RENT THAT PAID ITS OBLIGATION, with nobody named on either row. A payment that discharged a promise was
     money to or from somebody, which is what `settles` says when reconcile has run. */
  const k2 = await moneyCore();
  const b = hisAccounts(k2);
  const owed = value<Entry>(
    k2.create('obligations', { what: 'Rent, October', direction: 'owed_by_me', amount: { amount: 1_500_000, currency: 'EGP' }, due: day(-5), state: 'open' }, OWNER),
  );
  const paid = egpRow(k2, 'RENT OCTOBER', -5, 'out', 1_500_000, b.Tamarisk, { settles: owed.id });
  const client = egpRow(k2, 'INVOICE 0412 ACME', -4, 'in', 1_500_000, b.Corvane);
  for (const e of [paid, client]) assert.equal(k2.get(e.id)!.fields.transfer, false, `${String(e.fields.what)} was marked beside a settled rent`);
});

test('A FRIEND REPAYING DINNER INTO THE OTHER BANK STOPS BEING A MOVE THE MOMENT HIS NAME IS ON IT, and a refund that names the shop is never one', async () => {
  const k = await moneyCore();
  const a = hisAccounts(k);
  const dinner = egpRow(k, 'ZOOBA DINNER', -9, 'out', 150_000, a.Card);
  const back = egpRow(k, 'INSTAPAY FROM OMAR', -7, 'in', 150_000, a.Corvane);
  /* WRITTEN BARE, AS A BANK TEXT FILES IT, THE TWO STILL PAIR. Nothing on either row differs from a real move: see the
     declaration in `money.ts` for why the record cannot tell, and what it would need. */
  assert.equal(pairOf(k, dinner), back.id, 'the bare rows no longer pair, so the limit written beside `pairs:` is out of date');
  /* SAYING WHO PAID IS THE REPAIR, and it is an edit a person makes on the row: `party` is one of the fields the
     declaration reads, so the update is looked at again and the pair comes apart. */
  value(k.update('transactions', back.id, { party: who(k, 'Omar').id }, OWNER));
  for (const e of [dinner, back]) {
    assert.equal(k.get(e.id)!.fields.transfer, false, `${String(e.fields.what)} stayed marked after Omar was named on the repayment`);
    assert.equal(pairOf(k, e), null);
  }
  assert.equal(spent30d(k), 150_000, 'the dinner is money spent, whoever paid it back');

  const amazon = who(k, 'Amazon');
  const charge = egpRow(k, 'AMAZON EG', -14, 'out', 320_000, a.Card, { party: amazon.id });
  const refund = egpRow(k, 'AMAZON EG REFUND', -12, 'in', 320_000, a.Tamarisk, { party: amazon.id });
  for (const e of [charge, refund]) assert.equal(k.get(e.id)!.fields.transfer, false, `${String(e.fields.what)} was marked a move`);
});

test("HIS OWN MOVES STILL PAIR, FILED UNDER A CATEGORY: the card paid off from Corvane, as a real ledger holds it on 24 and 25 August", async () => {
  /* THE OBVIOUS REPAIR, `category is empty`, WOULD HAVE UNDONE THIS. Read from a real ledger through the route
     its import reads: both real moves between his own accounts since 13 July, EGP
     63,313.46 on 2 August and EGP 48,000.27 on 24 and 25 August, carry the category Transfers on both legs, and his
     import carries the category over. So a category cannot be what keeps a row out, and this is his second move, the
     card's leg landing a day before the bank's. */
  const k = await moneyCore();
  const a = hisAccounts(k);
  const transfers = value<Entry>(k.create('categories', { name: 'Transfers', direction: 'out', state: 'live' }, OWNER));
  const out = egpRow(k, 'Internet Banking Transfer', -3, 'out', 4_800_027, a.Corvane, { category: transfers.id });
  const into = egpRow(k, 'Internet Banking Transfer', -4, 'in', 4_800_027, a.Card, { category: transfers.id });
  assert.equal(pairOf(k, out), into.id);
  assert.equal(pairOf(k, into), out.id);
  assert.equal(spent30d(k), 0);
});
