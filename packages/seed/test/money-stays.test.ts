/**
 * Money that stays yours is not spending: an entry filed under a category that says so (`transfer` on `categories`,
 * read on the Ledger as `stays`) is left out of every figure of spending and income, and an entry with no category
 * is still counted.
 *
 * The clock is 18 September 2026. Groceries of E£1,200.00 on the card, the card paid off from the bank for E£5,000.00,
 * cash taken out for E£2,000.00 and $100.00 sent from the dollar account to the pound one, the last three filed under a
 * category the person made for moves, and E£300.00 to somebody nobody has filed. Before the category says so, the
 * moves are spent; after, only the groceries and the unfiled payment are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, firstPartyDocument } from '../src/index.ts';

const OWNER = { actor: 'p_1' };
const TODAY = Date.UTC(2026, 8, 18, 12);

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

type Kept = { k: Kernel; moves: Entry; groceries: Entry; card: Entry; bank: Entry; dollars: Entry; rows: Entry[] };

async function fresh(): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(TODAY));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const category = (name: string): Entry => value<Entry>(k.create('categories', { name, direction: 'out', state: 'live' }, OWNER));
  const account = (name: string, kind: string, currency: string): Entry =>
    value<Entry>(k.create('accounts', { name, kind, balance: { amount: 0, currency }, as_of: '2026-09-01' }, OWNER));
  const moves = category('Moves');
  const groceries = category('Groceries');
  const card = account('Card', 'card', 'EGP');
  const bank = account('Bank', 'bank', 'EGP');
  const dollars = account('Dollars', 'bank', 'USD');
  const row = (what: string, on: string, amount: number, currency: string, account: Entry, more: Record<string, unknown> = {}): Entry =>
    value<Entry>(k.create('transactions', { what, on, direction: 'out', amount: { amount, currency }, account: account.id, state: 'cleared', ...more }, OWNER));
  const rows = [
    row('Green grocer', '2026-09-10', 120_000, 'EGP', card, { category: groceries.id }),
    row('Card paid off', '2026-09-11', 500_000, 'EGP', bank, { category: moves.id }),
    row('Cash taken out', '2026-09-12', 200_000, 'EGP', bank, { category: moves.id }),
    row('Sent to the pound account', '2026-09-13', 10_000, 'USD', dollars, { category: moves.id }),
    row('A payment nobody filed', '2026-09-14', 30_000, 'EGP', bank),
  ];
  return { k, moves, groceries, card, bank, dollars, rows };
}

type Money = { currency: string; amount: number };
type Said = { value: number | null; parts?: Money[] };
type Read = Said & { groups?: (Said & { key: string })[] };

const read = (k: Kernel, id: string): Read => {
  const r = k.metric(METRICS[id] as never);
  assert.ok(r.ok, `${id}: ${sayOf(r)}`);
  return r.value as unknown as Read;
};

/** One currency's amount of a reading, in minor units: the value when it is one currency, else its part. */
const inCurrency = (said: Said | undefined, currency: string): number => {
  if (said === undefined) return 0;
  const part = said.parts?.find((p) => p.currency === currency);
  return part !== undefined ? part.amount : said.parts?.length ? 0 : (said.value ?? 0);
};

test('A CATEGORY THAT SAYS THE MONEY STAYS YOURS takes what is filed under it out of Spent, in both currencies', async () => {
  const r = await fresh();
  const before = read(r.k, 'spent-30d');
  assert.equal(inCurrency(before, 'EGP'), 850_000, 'before the category says so, the moves are spent');
  assert.equal(inCurrency(before, 'USD'), 10_000);

  value(r.k.update('categories', r.moves.id, { transfer: true }, { ...OWNER, version: r.moves.version }));

  const after = read(r.k, 'spent-30d');
  assert.equal(inCurrency(after, 'EGP'), 150_000, 'the groceries and the unfiled payment, and nothing that only moved');
  assert.equal(after.parts?.find((p) => p.currency === 'USD'), undefined, 'the dollars sent to the pound account are not spent either');

  const month = read(r.k, 'spent-by-category-month');
  assert.equal(month.groups?.find((g) => g.key === r.moves.id), undefined, 'the moves category is no bar of the month');
  assert.equal(inCurrency(month.groups?.find((g) => g.key === r.groceries.id), 'EGP'), 120_000);
});

test('AN ENTRY READS stays THROUGH ITS CATEGORY, and one with no category reads nothing there and is counted', async () => {
  const r = await fresh();
  value(r.k.update('categories', r.moves.id, { transfer: true }, { ...OWNER, version: r.moves.version }));
  assert.equal(r.k.get(r.rows[1]!.id)?.fields.stays, true);
  const listed = r.k.list({ register: 'transactions', where: { field: 'stays', not: true } });
  assert.ok(listed.ok, sayOf(listed));
  assert.deepEqual(listed.value.rows.map((e) => e.fields.what).sort(), ['A payment nobody filed', 'Green grocer']);
});

test('MOVING AN ENTRY OFF THE CATEGORY COUNTS IT AGAIN, and untick the category and all of them are spent', async () => {
  const r = await fresh();
  const ticked = value<Entry>(r.k.update('categories', r.moves.id, { transfer: true }, { ...OWNER, version: r.moves.version }));
  const cash = r.rows[2]!;
  value(r.k.update('transactions', cash.id, { category: r.groceries.id }, { ...OWNER, version: cash.version }));
  assert.equal(inCurrency(read(r.k, 'spent-30d'), 'EGP'), 350_000);
  value(r.k.update('categories', r.moves.id, { transfer: false }, { ...OWNER, version: ticked.version }));
  assert.equal(inCurrency(read(r.k, 'spent-30d'), 'EGP'), 850_000);
});

test('A CATEGORY WRITTEN BEFORE THE FLAG HOLDS NOTHING THERE, and what is filed under it is still counted', async () => {
  const r = await fresh();
  const listed = r.k.list({ register: 'transactions', where: { field: 'stays', is: true } });
  assert.ok(listed.ok, sayOf(listed));
  assert.equal(listed.value.rows.length, 0);
});
