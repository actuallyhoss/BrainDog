/**
 * Money this week (use case 6, step 6, "The onboarding target"), read through the kernel
 * on a record that installed Money the way a person does, with no example entries and no account.
 *
 * A shop owner says "Nadia paid 900 on InstaPay" on her first day. She holds no account, so the payment is kept as an
 * invoice to Nadia, paid today, and Today's "Paid" reads `settled-in-7d` beside "Came in", the Ledger's `received-7d`. Both are
 * read here: EGP 900 after the payment, nothing (never nought) before it, and two currencies never one number.
 *
 * RED FIRST: with either figure out of `figures/spending.ts` or `figures/due.ts`, the first test fails on `METRICS`.
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

/** A fresh record holding Money and People as a person installs them, with no example entries and no account. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

type Read = { value: number | null; unit: string | null; rows: number; held: number; parts?: { currency: string; amount: number }[] };

/** One figure as the record reads it now. */
const read = (k: Kernel, id: string): Read => {
  const r = k.metric(METRICS[id] as never);
  assert.ok(r.ok, `${id}: ${sayOf(r)}`);
  return r.value as unknown as Read;
};

/** A client, the way the first sentence makes one. */
const client = (k: Kernel, name: string): Entry => value<Entry>(k.create('people', { name }, OWNER));

/** A payment kept as a paid invoice, the way a record with no account keeps it. */
const paid = (k: Kernel, who: Entry, amount: number, currency: string, settled: number, more: Record<string, unknown> = {}): Entry =>
  value<Entry>(
    k.create(
      'obligations',
      { what: "A client's payment", party: who.id, direction: 'owed_to_me', amount: { amount, currency }, due: day(settled), state: 'paid', settled: day(settled), ...more },
      OWNER,
    ),
  );

test('MONEY DECLARES BOTH HALVES OF THE WEEK, and a fresh record installs them with the rest of Money', async () => {
  for (const id of ['received-7d', 'settled-in-7d']) {
    const f = METRICS[id];
    assert.ok(f, `Money no longer declares ${id}`);
    assert.deepEqual(f.value, { sum: 'amount' });
    assert.equal(f.format, 'money');
  }
  const k = await fresh();
  for (const id of ['received-7d', 'settled-in-7d'])
    assert.ok(k.declarations().some((d) => d.id === `metric.${id}`), `money-core installed without ${id}`);
});

test('NOTHING READS NOUGHT BEFORE THE FIRST PAYMENT: a fresh record matches nothing and holds nothing, in no currency', async () => {
  const k = await fresh();
  for (const id of ['received-7d', 'settled-in-7d']) {
    const r = read(k, id);
    /* The kernel's sum of nothing is a bare 0, so what a reader keys off is these three: no payment matched, the list
       holds nothing (`held: 0`, which `drawn.ts` and `page-live.ts` draw as nothing at all), and no currency is named,
       so no screen can say "EGP 0". */
    assert.equal(r.rows, 0, `${id} matched ${r.rows} on a record that has never been paid`);
    assert.equal(r.held, 0, `${id} said its list holds ${r.held} on a fresh record`);
    assert.equal(r.unit, null, `${id} named ${r.unit} with nothing paid`);
  }
});

test('AN INVOICE STILL OPEN IS NOT A PAYMENT: before the first one is paid the week has matched nothing', async () => {
  const k = await fresh();
  const nadia = client(k, 'Nadia');
  value(k.create('obligations', { what: 'Two candles', party: nadia.id, direction: 'owed_to_me', amount: { amount: 90_000, currency: 'EGP' }, due: day(3), state: 'open' }, OWNER));
  const r = read(k, 'settled-in-7d');
  assert.equal(r.rows, 0, 'an open invoice was read as money in');
  assert.equal(r.unit, null);
});

test('A FRESH SHOP PAID EGP 900 BY A NEW CLIENT, WITH NO ACCOUNT, READS EGP 900 IN', async () => {
  const k = await fresh();
  paid(k, client(k, 'Nadia'), 90_000, 'EGP', 0);
  const r = read(k, 'settled-in-7d');
  assert.equal(r.value, 90_000, 'EGP 900 in minor units');
  assert.equal(r.unit, 'EGP');
  assert.equal(r.rows, 1);
  assert.equal(read(k, 'received-7d').rows, 0, 'the Ledger was never written, so its half matched nothing');
});

test('MARKED PAID WITH NO DAY SAID, THE RECORD STAMPS TODAY and the payment is in this week', async () => {
  const k = await fresh();
  const nadia = client(k, 'Nadia');
  value(k.create('obligations', { what: 'Paid on InstaPay', party: nadia.id, direction: 'owed_to_me', amount: { amount: 90_000, currency: 'EGP' }, due: day(0), state: 'paid' }, OWNER));
  const r = read(k, 'settled-in-7d');
  assert.equal(r.value, 90_000, 'a paid invoice with no day said was left out of the week');
  assert.equal(r.unit, 'EGP');
});

test('THE WEEK IS TODAY AND THE SIX DAYS BEFORE IT, money in only, paid only', async () => {
  const k = await fresh();
  const nadia = client(k, 'Nadia');
  paid(k, nadia, 10_000, 'EGP', 0); // today: in
  paid(k, nadia, 20_000, 'EGP', -6); // the sixth day before: in
  paid(k, nadia, 40_000, 'EGP', -7); // the seventh day before: out
  paid(k, nadia, 80_000, 'EGP', 1); // dated ahead: out
  paid(k, nadia, 160_000, 'EGP', -1, { direction: 'owed_by_me' }); // money she paid out: out
  paid(k, nadia, 320_000, 'EGP', -2, { state: 'written_off' }); // given up on, never paid: out
  const r = read(k, 'settled-in-7d');
  assert.equal(r.value, 30_000, `read ${r.value}: today and the sixth day before, and nothing else`);
  assert.equal(r.rows, 2);
});

test('CURRENCIES NEVER MIX: EGP 900 and USD 40 paid this week read as two amounts, never 940', async () => {
  const k = await fresh();
  const nadia = client(k, 'Nadia');
  paid(k, nadia, 90_000, 'EGP', 0);
  paid(k, nadia, 4_000, 'USD', -2);
  const r = read(k, 'settled-in-7d');
  assert.equal(r.value, null, `added two currencies into ${r.value}`);
  assert.deepEqual(
    [...(r.parts ?? [])].sort((a, b) => a.currency.localeCompare(b.currency)),
    [{ currency: 'EGP', amount: 90_000 }, { currency: 'USD', amount: 4_000 }],
  );
});

test('THE LEDGER HALF: money in on an account this week, cleared, not a transfer, one currency at a time', async () => {
  const k = await fresh();
  const account = (name: string, currency: string) =>
    value<Entry>(k.create('accounts', { name, kind: 'bank', balance: { amount: 0, currency }, as_of: day(-40) }, OWNER));
  const instapay = account('InstaPay', 'EGP');
  const dollars = account('Dollars', 'USD');
  let n = 0;
  const entry = (on: number, acc: Entry, amount: number, currency: string, more: Record<string, unknown> = {}) =>
    value<Entry>(k.create('transactions', { what: `Payment ${++n}`, on: day(on), direction: 'in', amount: { amount, currency }, account: acc.id, ...more }, OWNER));

  entry(0, instapay, 90_000, 'EGP'); // today: in
  entry(-6, instapay, 1_000, 'EGP'); // the sixth day before: in
  entry(-7, instapay, 2_000, 'EGP'); // the seventh day before: out
  entry(1, instapay, 4_000, 'EGP'); // dated ahead: out
  entry(-1, instapay, 8_000, 'EGP', { direction: 'out' }); // money out: out
  entry(-1, instapay, 16_000, 'EGP', { transfer: true }); // between her own accounts: out
  entry(-2, instapay, 32_000, 'EGP', { state: 'pending' }); // not settled yet: out
  assert.equal(read(k, 'received-7d').value, 91_000);

  entry(-3, dollars, 4_000, 'USD');
  const both = read(k, 'received-7d');
  assert.equal(both.value, null, `added two currencies into ${both.value}`);
  assert.equal(both.parts?.length, 2);
});

test('A RECORD WITH AN ACCOUNT READS ITS LEDGER MONEY ONCE: an invoice paid and reconciled is in one half, never both', async () => {
  const k = await fresh();
  const instapay = value<Entry>(k.create('accounts', { name: 'InstaPay', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(-40) }, OWNER));
  const invoice = paid(k, client(k, 'Nadia'), 90_000, 'EGP', 0);
  const ledger = (what: string, amount: number, more: Record<string, unknown> = {}) =>
    value<Entry>(k.create('transactions', { what, on: day(0), direction: 'in', amount: { amount, currency: 'EGP' }, account: instapay.id, ...more }, OWNER));
  ledger('Nadia, on InstaPay', 90_000, { settles: invoice.id }); // the same EGP 900 as the invoice
  ledger('A walk-in sale', 15_000); // settles nothing: the Ledger's own
  const week = read(k, 'settled-in-7d');
  const ledgerHalf = read(k, 'received-7d');
  assert.equal(week.value, 90_000);
  assert.equal(ledgerHalf.value, 15_000, `the Ledger half read ${ledgerHalf.value}: a reconciled payment was counted beside its invoice`);
  assert.equal((week.value ?? 0) + (ledgerHalf.value ?? 0), 105_000, 'EGP 1,050 came in this week, not 1,950');
});

test('WHAT HE PAID OUT IS ITS OWN HALF: a bill owed by him and told as paid reads in `settled-out-7d`, never in what was paid to him', async () => {
  const k = await fresh();
  const nadia = client(k, 'Nadia');
  value(k.create('obligations', { what: 'Logo', party: nadia.id, direction: 'owed_by_me', amount: { amount: 30_000, currency: 'EGP' }, due: day(0), state: 'paid', settled: day(0) }, OWNER));
  const out = read(k, 'settled-out-7d');
  assert.equal(out.value, 30_000);
  assert.equal(out.unit, 'EGP');
  assert.equal(read(k, 'settled-in-7d').rows, 0, 'money he paid out was read as money paid to him');
});
