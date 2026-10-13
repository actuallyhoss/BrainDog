/**
 * The day a category passed its budget (REC-B19 step 4), read through the kernel on a record that installed Money the
 * way a person does, gave one category a most a month, and then spent on it.
 *
 * The clock is 25 October 2026. Outing may have E£1,000.00 a month; E£400.00, E£400.00 and E£300.00 went on it on the
 * 3rd, the 9th and the 19th, so the 19th is the day the running total reached the line.
 *
 * The figure is read from `figures/budgets.ts` itself and filled with a category's name, as a page fills it, so this
 * file does not wait on the figure being spread into Money's document.
 *
 * RED FIRST: with no `figures/budgets.ts` the file does not load, and with a kernel that does not read `running` every
 * read is refused by that name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { fill, openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument } from '../src/index.ts';
import { BUDGET_FIGURES } from '../src/modules/money/figures/budgets.ts';

const OWNER = { actor: 'p_1' };
/** Noon on 25 October 2026: after the 19th, and well inside the month. */
const TODAY = Date.UTC(2026, 9, 25, 12);
/** E£1,000.00 in piastres. */
const BUDGET = 100_000;

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

type Kept = { k: Kernel; card: Entry; outing: Entry; groceries: Entry };

/** A fresh record holding Money as a person installs it: one account, Outing with a budget and Groceries with none. */
async function fresh(now = TODAY): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(now));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const category = (name: string, budget?: number): Entry =>
    value<Entry>(k.create('categories', { name, direction: 'out', state: 'live', ...(budget === undefined ? {} : { budget: { amount: budget, currency: 'EGP' } }) }, OWNER));
  const card = value<Entry>(k.create('accounts', { name: 'Card', kind: 'bank', balance: { amount: 5_000_000, currency: 'EGP' }, as_of: '2026-07-01' }, OWNER));
  return { k, card, outing: category('Outing', BUDGET), groceries: category('Groceries') };
}

/** One Ledger entry of money out on a day, in piastres. What a test does not say is a cleared payment that is no transfer. */
const spent = (r: Kept, on: string, amount: number, category: Entry, more: Record<string, unknown> = {}): Entry =>
  value<Entry>(
    r.k.create(
      'transactions',
      { what: `${String(category.fields.name)} ${on}`, on, direction: 'out', amount: { amount, currency: 'EGP' }, account: r.card.id, state: 'cleared', transfer: false, category: category.id, ...more },
      OWNER,
    ),
  );

type Crossed = { id: string; at: string; value: number };
type Read = { value: number | null; unit: string | null; rows: number; crossed?: Crossed | null };

/** The figure for one category, filled with its name as a page fills it, as the record reads it now. */
const read = (k: Kernel, category: Entry): Read => {
  const r = k.metric(fill(BUDGET_FIGURES['budget-passed-on'], null, String(category.fields.name)) as never);
  assert.ok(r.ok, `budget-passed-on for ${String(category.fields.name)}: ${sayOf(r)}`);
  return r.value as unknown as Read;
};

test('THE FIGURE IS ONE RUNNING TOTAL OVER THE LEDGER, and it names no currency and no category of its own', () => {
  const decl = BUDGET_FIGURES['budget-passed-on'] as unknown as { metric: string; source: string; where: string; format: string; value: unknown };
  assert.ok(decl, 'figures/budgets.ts declares no budget-passed-on');
  assert.equal(decl.metric, 'budget-passed-on');
  assert.equal(decl.source, 'register.transactions');
  assert.equal(decl.format, 'money', 'the figure names a currency or is no money figure');
  /* THE SAME MONEY `spent-by-category-month` ADDS UP, cut to the one category a page names. */
  assert.equal(decl.where, 'state is cleared, transfer is false, direction is out, on at least bom, category is {{it}}');
  assert.deepEqual(decl.value, { running: { sum: 'amount', order: 'on', until: { gte: { field: 'budget', of: 'category' } } } });
});

test('E£400, E£400 AND E£300 AGAINST E£1,000: the total stops on the 19th, the day the third payment reached the line', async () => {
  const r = await fresh();
  spent(r, '2026-10-03', 40_000, r.outing);
  spent(r, '2026-10-09', 40_000, r.outing);
  const third = spent(r, '2026-10-19', 30_000, r.outing);
  spent(r, '2026-10-22', 5_000, r.outing); // after the line was reached, which moves neither the day nor the stop
  const got = read(r.k, r.outing);
  assert.ok(got.crossed, 'Outing spent E£1,100.00 against E£1,000.00 and no day was answered');
  assert.equal(got.crossed.at, '2026-10-19', 'the day is the one the running total reached the budget on');
  assert.equal(got.crossed.id, third.id, 'the entry that reached the line is the third');
  assert.equal(got.crossed.value, 110_000, 'the total on that day is every payment up to and including it');
  assert.equal(got.value, 110_000, 'the figure went on adding after it stopped');
  assert.equal(got.unit, 'EGP');
});

test('THE ORDER IS THE DAY A PAYMENT WAS MADE ON, never the order it was typed in', async () => {
  const r = await fresh();
  const last = spent(r, '2026-10-19', 30_000, r.outing);
  spent(r, '2026-10-09', 40_000, r.outing);
  spent(r, '2026-10-03', 40_000, r.outing);
  const got = read(r.k, r.outing);
  assert.equal(got.crossed?.at, '2026-10-19');
  assert.equal(got.crossed?.id, last.id);
});

test('A PAYMENT THAT LANDS EXACTLY ON THE BUDGET HAS REACHED IT, since the most a month is the line and not the room under it', async () => {
  const r = await fresh();
  spent(r, '2026-10-03', 60_000, r.outing);
  const second = spent(r, '2026-10-11', 40_000, r.outing);
  const got = read(r.k, r.outing);
  assert.equal(got.crossed?.at, '2026-10-11');
  assert.equal(got.crossed?.id, second.id);
  assert.equal(got.crossed?.value, BUDGET);
});

test('SPENDING UNDER THE BUDGET ANSWERS NO DAY, and the total is what was spent', async () => {
  const r = await fresh();
  spent(r, '2026-10-03', 40_000, r.outing);
  spent(r, '2026-10-09', 40_000, r.outing);
  const got = read(r.k, r.outing);
  assert.equal(got.crossed ?? null, null, 'E£800.00 against E£1,000.00 was said to have passed');
  assert.equal(got.value, 80_000);
});

test('MONEY MOVED BETWEEN HIS OWN ACCOUNTS AND A PAYMENT STRUCK OUT ARE NOT SPENDING, so neither reaches the line', async () => {
  const r = await fresh();
  spent(r, '2026-10-03', 40_000, r.outing);
  spent(r, '2026-10-09', 40_000, r.outing);
  spent(r, '2026-10-12', 90_000, r.outing, { transfer: true });
  spent(r, '2026-10-14', 90_000, r.outing, { state: 'void' });
  spent(r, '2026-10-15', 90_000, r.outing, { state: 'pending' }); // taken and not yet settled
  spent(r, '2026-10-16', 90_000, r.outing, { direction: 'in' }); // a refund
  const got = read(r.k, r.outing);
  assert.equal(got.crossed ?? null, null, 'a transfer, a void payment, a pending one or a refund was counted as spending');
  assert.equal(got.value, 80_000);
});

test('A CATEGORY WITH NO BUDGET HAS NO LINE TO PASS, however much went on it', async () => {
  const r = await fresh();
  spent(r, '2026-10-03', 400_000, r.groceries);
  spent(r, '2026-10-09', 400_000, r.groceries);
  assert.equal(read(r.k, r.groceries).crossed ?? null, null, 'Groceries holds no most a month and was said to have passed one');
});

test("ANOTHER CATEGORY'S SPENDING IS NOT THIS ONE'S: Groceries does not use up what Outing may have", async () => {
  const r = await fresh();
  spent(r, '2026-10-03', 40_000, r.outing);
  spent(r, '2026-10-04', 400_000, r.groceries);
  const got = read(r.k, r.outing);
  assert.equal(got.crossed ?? null, null);
  assert.equal(got.value, 40_000);
});

test("LAST MONTH'S SPENDING IS LAST MONTH'S: the budget is a month's, and the total starts again on the first", async () => {
  const r = await fresh();
  spent(r, '2026-09-20', 90_000, r.outing);
  spent(r, '2026-09-30', 90_000, r.outing); // the last day of last month
  const first = spent(r, '2026-10-01', 40_000, r.outing); // the first day of this one, which counts
  assert.equal(read(r.k, r.outing).crossed ?? null, null, 'September was added to October');
  assert.equal(read(r.k, r.outing).value, 40_000);
  const over = spent(r, '2026-10-02', 60_000, r.outing);
  assert.equal(read(r.k, r.outing).crossed?.id, over.id);
  assert.notEqual(read(r.k, r.outing).crossed?.id, first.id);
});
