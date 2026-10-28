/**
 * Categories going the other way, read through the kernel on a record that installed Money the way a
 * person does, with no example entries. "5 of 15 categories carry the wrong direction": an import filed money
 * coming in under categories marked "Money out", and nothing noticed.
 *
 * RED FIRST: with `direction.ts` out of `figures/index.ts` the first test fails on `METRICS`, and with the hop's `where`
 * dropped the figure counts every live category, so the record with none planted reads 2 and not 0.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { figureLists, openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, day, firstPartyDocument } from '../src/index.ts';
import { HEADS_UP } from '../src/modules/money/pages/parts/heads-up.ts';

const OWNER = { actor: 'p_1' };
const FIGURE = 'categories-against-direction';

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

/** A fresh record holding Money, with two categories marked one way each and one account in pounds. */
async function fresh(): Promise<{ k: Kernel; spending: Entry; income: Entry; pounds: Entry }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const spending = value<Entry>(k.create('categories', { name: 'Software', direction: 'out', state: 'live' }, OWNER));
  const income = value<Entry>(k.create('categories', { name: 'Clients', direction: 'in', state: 'live' }, OWNER));
  const pounds = account(k, 'Current account', 'GBP');
  return { k, spending, income, pounds };
}

const account = (k: Kernel, name: string, currency: string): Entry =>
  value<Entry>(k.create('accounts', { name, kind: 'bank', balance: { amount: 100_000, currency }, as_of: day(-1) }, OWNER));

/** One Ledger entry, filed under a category. */
const entry = (k: Kernel, on: Entry, category: Entry, direction: 'in' | 'out', amount: number, currency: string): Entry =>
  value<Entry>(
    k.create(
      'transactions',
      { what: `${direction === 'in' ? 'Paid in' : 'Paid out'} ${amount}`, on: day(-2), direction, amount: { amount, currency }, account: on.id, state: 'cleared', category: category.id },
      OWNER,
    ),
  );

type Read = { value: number | null; unit: string | null; parts?: { currency: string; amount: number }[] };

const read = (k: Kernel): Read => {
  const r = k.metric(METRICS[FIGURE] as never);
  assert.ok(r.ok, `${FIGURE}: ${sayOf(r)}`);
  return r.value as unknown as Read;
};

test('MONEY DECLARES THE FIGURE AND HEADS UP NAMES IT, a count with nought for its mark', () => {
  const f = METRICS[FIGURE];
  assert.ok(f, `Money no longer declares ${FIGURE}`);
  assert.equal(f.source, 'register.categories');
  assert.deepEqual(f.value, { count: 'id' });
  assert.deepEqual(f.target, { lte: 0 });
  const line = HEADS_UP.find((b) => (b.when as { metric?: string } | undefined)?.metric === FIGURE);
  assert.ok(line, 'Heads up draws no line on the figure');
  assert.match(String(line.body), new RegExp(`\\{\\{${FIGURE}\\}\\}`));
  assert.match(String(line.body), /Make it either way/);
  assert.doesNotMatch(String(line.body), /—|\brow\b/);
});

test('ONE CATEGORY MARKED MONEY OUT THAT MONEY COMING IN POINTS AT COUNTS 1, and entries going its own way count nothing', async () => {
  const { k, spending, income, pounds } = await fresh();
  entry(k, pounds, spending, 'out', 1_200, 'GBP');
  entry(k, pounds, income, 'in', 90_000, 'GBP');
  assert.equal(read(k).value, 0);
  entry(k, pounds, spending, 'in', 4_000, 'GBP');
  assert.equal(read(k).value, 1);
});

test('NONE PLANTED COUNTS 0, and a category marked Either way holds both without being counted', async () => {
  const { k, spending, income, pounds } = await fresh();
  assert.equal(read(k).value, 0);
  const both = value<Entry>(k.create('categories', { name: 'Transfers', direction: 'both', state: 'live' }, OWNER));
  entry(k, pounds, both, 'in', 5_000, 'GBP');
  entry(k, pounds, both, 'out', 5_000, 'GBP');
  entry(k, pounds, spending, 'out', 300, 'GBP');
  entry(k, pounds, income, 'in', 300, 'GBP');
  assert.equal(read(k).value, 0);
});

test('ANOTHER CURRENCY IS NOT SUMMED IN: two wrong-way entries in two currencies are one category, and the count names no currency', async () => {
  const { k, spending, pounds } = await fresh();
  const egp = account(k, 'Cairo account', 'EGP');
  entry(k, pounds, spending, 'in', 4_000, 'GBP');
  entry(k, egp, spending, 'in', 250_000, 'EGP');
  const r = read(k);
  assert.equal(r.value, 1);
  assert.equal(r.parts, undefined, 'a count of categories is never cut by currency');
  assert.ok(r.unit === null || !['GBP', 'EGP'].includes(r.unit), `the count reads in ${r.unit}`);
});

test('THE FIGURE IS NAMED BY THE LEDGER TOO, so a member who may open Categories and not the Ledger is not told what the Ledger holds', () => {
  /* The hop reads every Ledger entry that names a category, and `figureLists` is what the record holds a figure and a
     Heads up line back by. Named by Categories alone, a member invited to Categories read a count made of entries she
     cannot open. */
  const lists = figureLists(METRICS[FIGURE] as never);
  assert.ok(lists.includes('categories'), `${FIGURE} reads ${lists.join(', ')}`);
  assert.ok(lists.includes('transactions'), `${FIGURE} is held back by ${lists.join(', ')} alone, and its hop reads the Ledger`);
});
