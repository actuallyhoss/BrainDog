/**
 * Money's tile "Spent this month" (REC-B19 job 3), read through the kernel on a record that installed Money the
 * way a person does and then kept two months of spending in four categories.
 *
 * WHAT IS HELD HERE: `parts/spending.ts` gives one block under that heading over `spent-vs-last-month`, it is drawn
 * only while this month has spending, nothing in it or in what it answers is an id where a name goes, and a category
 * whose two months do not compare is answered a difference and no change.
 *
 * The clock is 18 September 2026, as in `money-spend-vs-last.test.ts`, whose figures this tile reads.
 *
 * RED FIRST: with no `parts/spending.ts`, this file fails on its import.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, firstPartyDocument } from '../src/index.ts';
import { SPENDING } from '../src/modules/money/pages/parts/spending.ts';

const OWNER = { actor: 'p_1' };
/** Noon on 18 September 2026. */
const TODAY = Date.UTC(2026, 8, 18, 12);
/** A row's id as the record mints it, which no person reads. */
const ULID = /[0-9A-HJKMNP-TV-Z]{26}/;

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

type Kept = { k: Kernel; card: Entry; outing: Entry; groceries: Entry; rent: Entry; software: Entry };

/** A fresh record holding Money as a person installs it, one account and four categories of spending. */
async function fresh(): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(TODAY));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const category = (name: string): Entry => value<Entry>(k.create('categories', { name, direction: 'out', state: 'live' }, OWNER));
  const card = value<Entry>(k.create('accounts', { name: 'Card', kind: 'bank', balance: { amount: 5_000_000, currency: 'EGP' }, as_of: '2026-07-01' }, OWNER));
  return { k, card, outing: category('Outing'), groceries: category('Groceries'), rent: category('Rent'), software: category('Software') };
}

/** One cleared Ledger entry of money out on a day, in piastres. */
const spent = (r: Kept, on: string, amount: number, category: Entry | null): Entry =>
  value<Entry>(
    r.k.create(
      'transactions',
      { what: category ? `${String(category.fields.name)} ${on}` : `A payment ${on}`, on, direction: 'out', amount: { amount, currency: 'EGP' }, account: r.card.id, state: 'cleared', transfer: false, ...(category ? { category: category.id } : {}) },
      OWNER,
    ),
  );

/** August to the 18th and September so far: Outing up 40%, Groceries down by half, Rent the same, Software new. */
function twoMonths(r: Kept): void {
  spent(r, '2026-08-02', 10_000, r.outing);
  spent(r, '2026-08-10', 10_000, r.outing);
  spent(r, '2026-08-05', 40_000, r.groceries);
  spent(r, '2026-08-18', 20_000, r.groceries);
  spent(r, '2026-08-01', 500_000, r.rent);
  spent(r, '2026-08-12', 4_000, null);

  spent(r, '2026-09-03', 14_000, r.outing);
  spent(r, '2026-09-12', 14_000, r.outing);
  spent(r, '2026-09-04', 30_000, r.groceries);
  spent(r, '2026-09-01', 500_000, r.rent);
  spent(r, '2026-09-02', 9_000, r.software);
}

type Part = { key: string; label?: string; value: number | null; rows: number; delta?: number | null; why?: string };
type Tile = { drawn?: boolean; why?: string; refusals: readonly unknown[]; readings?: readonly { metric: string; reading: { value: number | null; unit: string | null; groups?: Part[] } }[] };

/** The tile as the record reads it now. */
const tile = (k: Kernel): Tile => k.block(SPENDING[0] as never) as unknown as Tile;

/** The tile's part for one category. */
const part = (t: Tile, category: Entry): Part | undefined => t.readings?.[0]?.reading.groups?.find((g) => g.key === category.id);

test("ONE BLOCK, HEADED 'Spent this month', over this month against last by category", () => {
  assert.equal(SPENDING.length, 1);
  const block = SPENDING[0]!;
  assert.equal(block.heading, 'Spent this month');
  assert.equal(block.source, 'metric.spent-vs-last-month');
  assert.ok(METRICS['spent-vs-last-month'], 'Money no longer declares the figure the tile reads');
  /* A TILE WEARS A GLYPH AND NAMES NO WIDTH, so the app pairs it on Money's board (money-core 3.29.0). */
  assert.equal(typeof block.icon, 'string');
  assert.equal(block.span, undefined);
  /* WHAT NOBODY GAVE A CATEGORY IS NAMED, as the part a person can still file. */
  assert.equal(block.unset, 'Not filed yet');
});

test('DRAWN ONLY WHILE THIS MONTH HAS SPENDING: last month alone draws nothing, and the first payment draws it', async () => {
  const r = await fresh();
  assert.equal(tile(r.k).drawn, false, 'a record that has spent nothing draws the tile');
  spent(r, '2026-08-05', 40_000, r.groceries);
  spent(r, '2026-08-25', 30_000, r.outing);
  const before = tile(r.k);
  assert.equal(before.drawn, false, 'last month alone draws a tile about this month');
  assert.equal(before.why, 'when');

  spent(r, '2026-09-04', 30_000, r.groceries);
  const after = tile(r.k);
  assert.notEqual(after.drawn, false, 'the first payment of the month draws no tile');
  assert.deepEqual(after.refusals, []);
  assert.equal(after.readings?.[0]?.metric, 'spent-vs-last-month');
});

test('AND SPENDING NOBODY GAVE A CATEGORY DRAWS IT TOO, because it is this month\'s spending all the same', async () => {
  const r = await fresh();
  spent(r, '2026-09-04', 30_000, null);
  const got = tile(r.k);
  assert.notEqual(got.drawn, false, 'a month spent with no category draws no tile');
  assert.deepEqual(got.refusals, []);
});

test('IT NAMES NO ID: the block is written in names, and every category it answers carries its own', async () => {
  assert.doesNotMatch(JSON.stringify(SPENDING), ULID);
  const r = await fresh();
  twoMonths(r);
  const got = tile(r.k);
  const groups = got.readings?.[0]?.reading.groups ?? [];
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map((g) => g.label).sort(), ['Groceries', 'Outing', 'Rent', 'Software']);
  for (const g of groups) assert.doesNotMatch(String(g.label), ULID, 'a category is read by its id and not by its name');
  /* THE WORDS A PERSON READS ON THE TILE HOLD NO ID AND NO DASH FOR A PAUSE. */
  for (const said of [SPENDING[0]!.heading, SPENDING[0]!.unset, SPENDING[0]!.empty].filter((s) => s !== undefined)) {
    assert.doesNotMatch(String(said), ULID);
    assert.doesNotMatch(String(said), /—|–/);
    assert.doesNotMatch(String(said), /\b(row|entity|list item)s?\b/i);
  }
});

test('A CATEGORY WHOSE COMPARISON GATE FAILS SHOWS NO CHANGE, and the ones that pass show theirs', async () => {
  const r = await fresh();
  twoMonths(r);
  const got = tile(r.k);
  assert.ok(Math.abs((part(got, r.outing)?.delta ?? 0) - 0.4) < 1e-12, 'Outing is up 40% and the tile does not say so');
  assert.ok(Math.abs((part(got, r.groceries)?.delta ?? 0) + 0.5) < 1e-12, 'Groceries is down by half');
  assert.equal(part(got, r.rent)?.delta, 0);
  /* SOFTWARE HAD NOTHING BY THE 18TH OF AUGUST, so its E£90.00 is a difference and no change. */
  assert.equal(part(got, r.software)?.value, 9_000);
  assert.equal(part(got, r.software)?.delta, null, 'a category new this month was shown a change');
  assert.notEqual(part(got, r.software)?.why, '');

  /* THREE ENTRIES THIS MONTH AGAINST FORTY LAST MONTH IS NO CHANGE EITHER (REC-B19, "Done when"). */
  const gifts = value<Entry>(r.k.create('categories', { name: 'Gifts', direction: 'out', state: 'live' }, OWNER));
  for (let d = 1; d <= 10; d += 1) for (let n = 0; n < 4; n += 1) spent(r, `2026-08-${String(d).padStart(2, '0')}`, 500, gifts);
  for (const on of ['2026-09-01', '2026-09-02', '2026-09-03']) spent(r, on, 500, gifts);
  const after = tile(r.k);
  assert.equal(part(after, gifts)?.value, 1_500 - 20_000);
  assert.equal(part(after, gifts)?.delta, null, 'three entries against forty was shown a change');
  assert.notEqual(part(after, gifts)?.why, '');
  assert.ok(Math.abs((part(after, r.outing)?.delta ?? 0) - 0.4) < 1e-12, "another category's entries moved Outing's change");
});
