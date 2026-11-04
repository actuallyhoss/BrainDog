/**
 * Where the money went, this month against last, read through the kernel on a record that installed
 * Money the way a person does and then kept two months of spending in four categories.
 *
 * The clock is 18 September 2026. Last month is the whole of August; last month to date is August to the 18th, the same
 * day number, and `spent-vs-last-month` is September so far less that, one answer a category.
 *
 * RED FIRST: with the four figures out of `figures/spending.ts`, the first test fails on `METRICS`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, firstPartyDocument } from '../src/index.ts';
import { ACCOUNT_FIGURES } from '../src/modules/money/figures/accounts.ts';
import { PLAN_PAGE_FIGURES } from '../src/modules/money/figures/plans.ts';
import { MONEY_METRICS } from '../src/modules/money/figures/index.ts';

const OWNER = { actor: 'p_1' };
/** Noon on 18 September 2026: day 18 of a month that follows a month of 31. */
const TODAY = Date.UTC(2026, 8, 18, 12);
const FOUR = ['spent-last-month', 'spent-by-category-last-month', 'spent-by-category-to-date-last-month', 'spent-vs-last-month'] as const;

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

/** A fresh record holding Money as a person installs it, one account and four categories of spending, at `now`. */
async function fresh(now = TODAY): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(now));
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

/** One Ledger entry of money out on a day, in piastres. What a test does not say is a cleared payment that is no transfer. */
const spent = (r: Kept, on: string, amount: number, category: Entry | null, more: Record<string, unknown> = {}): Entry =>
  value<Entry>(
    r.k.create(
      'transactions',
      { what: category ? `${String(category.fields.name)} ${on}` : `A payment ${on}`, on, direction: 'out', amount: { amount, currency: 'EGP' }, account: r.card.id, state: 'cleared', transfer: false, ...(category ? { category: category.id } : {}), ...more },
      OWNER,
    ),
  );

/** August and September as the record holds them on the 18th, and the entries no spending figure may count. */
function twoMonths(r: Kept): void {
  spent(r, '2026-07-31', 7_000, r.outing); // the day before last month began
  spent(r, '2026-08-02', 10_000, r.outing);
  spent(r, '2026-08-10', 10_000, r.outing);
  spent(r, '2026-08-25', 30_000, r.outing);
  spent(r, '2026-08-05', 40_000, r.groceries);
  spent(r, '2026-08-18', 20_000, r.groceries); // today's day number, which last month to date still holds
  spent(r, '2026-08-31', 20_000, r.groceries); // the last day of last month
  spent(r, '2026-08-01', 500_000, r.rent); // the first day of last month
  spent(r, '2026-08-19', 9_000, r.software); // the day after last month to date ends
  spent(r, '2026-08-12', 4_000, null); // spending nobody gave a category

  spent(r, '2026-09-03', 14_000, r.outing);
  spent(r, '2026-09-12', 14_000, r.outing);
  spent(r, '2026-09-04', 30_000, r.groceries);
  spent(r, '2026-09-01', 500_000, r.rent); // the first day of this month, which is not last month
  spent(r, '2026-09-02', 9_000, r.software);

  spent(r, '2026-08-07', 250_000, r.outing, { transfer: true }); // moved between his own accounts
  spent(r, '2026-08-08', 60_000, r.outing, { state: 'pending' }); // taken and not yet settled
  spent(r, '2026-08-09', 80_000, r.outing, { direction: 'in' }); // a refund is not spending
}

type Part = { key: string; label?: string; value: number | null; rows: number; delta?: number | null; why?: string };
type Read = { value: number | null; unit: string | null; rows: number; groups?: Part[] };

/** One figure as the record reads it now. */
const read = (k: Kernel, id: string): Read => {
  const r = k.metric(METRICS[id] as never);
  assert.ok(r.ok, `${id}: ${sayOf(r)}`);
  return r.value as unknown as Read;
};

/** A grouped figure's part for one category, or `undefined` when the figure holds none for it. */
const part = (got: Read, category: Entry): Part | undefined => got.groups?.find((g) => g.key === category.id);

test('MONEY DECLARES THE FOUR, after every figure it already held, and a fresh record installs them', async () => {
  for (const id of FOUR) assert.ok(METRICS[id], `Money no longer declares ${id}`);
  for (const id of FOUR) assert.equal(METRICS[id]!.format, 'money', `${id} names a currency or is no money figure`);
  /* LAST IN THE DOCUMENT, in this order, so no figure a record already holds moves. Twenty-three came after them by
     batch 74, which took `plan-share-left` out again (plan-lead-one-figure-74), and twenty-four by batch 76, with
     `book-lasts-until` (book-lasts-until-76), and twenty-seven, which put the three of the
     next unpaid part of each plan last, and twenty-eight by money-core 3.18.0, with the parts late after them, and
     thirty-nine by money-core 3.29.0, with the eleven of the Budgets, Payees and Reports pages, and sixty-one by money-core
     3.31.0 and 3.32.0, with week and year budgets, pending and unfiled lines, payees, net worth and the figures by week. */
  const declared = Object.keys(MONEY_METRICS).filter((id) => !(id in ACCOUNT_FIGURES) && !(id in PLAN_PAGE_FIGURES));
  const first = declared.indexOf(FOUR[0]!);
  assert.deepEqual(declared.slice(first, first + FOUR.length), [...FOUR]);
  assert.ok(declared.length - (first + FOUR.length) >= 61, 'a figure declared before them moved after them');
  const { k } = await fresh();
  for (const id of FOUR) assert.ok(k.declarations().some((d) => d.id === `metric.${id}`), `money-core installed without ${id}`);
});

test('LAST MONTH IS THE WHOLE OF LAST CALENDAR MONTH: its first day and its last, and no day either side', async () => {
  const r = await fresh();
  twoMonths(r);
  const got = read(r.k, 'spent-last-month');
  /* Outing 50,000, Groceries 80,000, Rent 500,000, Software 9,000 and 4,000 with no category: E£6,430.00. */
  assert.equal(got.value, 50_000 + 80_000 + 500_000 + 9_000 + 4_000);
  assert.equal(got.unit, 'EGP');
  assert.equal(got.rows, 9, 'the day before the month, the first of this month, a transfer, a pending payment or a refund was counted');
});

test('AND BY CATEGORY IT IS THE SAME MONEY IN PARTS, each named, and what has no category is the whole less the parts', async () => {
  const r = await fresh();
  twoMonths(r);
  const got = read(r.k, 'spent-by-category-last-month');
  assert.equal(part(got, r.outing)?.value, 50_000);
  assert.equal(part(got, r.groceries)?.value, 80_000);
  assert.equal(part(got, r.rent)?.value, 500_000);
  assert.equal(part(got, r.software)?.value, 9_000);
  assert.equal(part(got, r.outing)?.label, 'Outing', 'a category is read by its id and not by its name');
  /* WHAT HAS NO CATEGORY IS NO PART, because a grouping answers for the categories there are. It is the whole less the
     parts, which is what a page draws as "No category": E£40.00 here. */
  assert.equal(got.groups?.length, 4);
  assert.equal(got.value, read(r.k, 'spent-last-month').value, 'the grouped figure and the whole read two different months');
  assert.equal((got.value ?? 0) - (got.groups ?? []).reduce((sum, g) => sum + (g.value ?? 0), 0), 4_000, 'the parts and what has no category do not add up to the whole');
});

test("TO DATE STOPS AT TODAY'S DAY NUMBER: the 18th of last month is in, and the 19th is not", async () => {
  const r = await fresh();
  twoMonths(r);
  const got = read(r.k, 'spent-by-category-to-date-last-month');
  assert.equal(part(got, r.outing)?.value, 20_000, 'the 25th was counted on the 18th');
  assert.equal(part(got, r.groceries)?.value, 60_000, 'the 18th itself was left out, or the 31st was counted');
  assert.equal(part(got, r.rent)?.value, 500_000);
  assert.equal(part(got, r.software), undefined, 'the 19th was counted on the 18th');
  assert.equal(got.value, 20_000 + 60_000 + 500_000 + 4_000);
});

test('ON THE LAST DAY OF A LONGER MONTH, TO DATE IS THE WHOLE OF THE SHORTER ONE and never runs into this month', async () => {
  /* 31 October: September has no 31st, so last month to date is September to the 30th. */
  const r = await fresh(Date.UTC(2026, 9, 31, 12));
  spent(r, '2026-09-30', 11_000, r.outing);
  spent(r, '2026-10-01', 5_000, r.outing);
  spent(r, '2026-08-31', 3_000, r.outing);
  assert.equal(read(r.k, 'spent-by-category-to-date-last-month').value, 11_000);
  assert.equal(read(r.k, 'spent-last-month').value, 11_000);
});

type Halves = { of: number | null; per: number | null; perRows: number };
type Moved = Part & { halves?: Halves };

test('THIS MONTH SO FAR LESS LAST MONTH TO THE SAME DAY, BY CATEGORY: the same money the to-date figure adds up', async () => {
  const r = await fresh();
  twoMonths(r);
  const got = read(r.k, 'spent-vs-last-month') as Read & { halves?: Halves; delta?: number | null };
  const before = read(r.k, 'spent-by-category-to-date-last-month');
  const now = read(r.k, 'spent-by-category-month');
  const of = (c: Entry): Moved => {
    const found = part(got, c) as Moved | undefined;
    assert.ok(found, `${String(c.fields.name)} is no part of the difference`);
    return found;
  };

  /* Outing E£280.00 against E£200.00, Groceries E£300.00 against E£600.00, Rent the same, Software new this month. */
  assert.equal(of(r.outing).value, 28_000 - 20_000);
  assert.equal(of(r.groceries).value, 30_000 - 60_000);
  assert.equal(of(r.rent).value, 0);
  assert.equal(of(r.software).value, 9_000, 'a category spent on this month only does not count last month as nought');
  assert.equal(of(r.outing).label, 'Outing');

  /* EACH HALF IS A FIGURE MONEY ALREADY DECLARES, so the paired bars and the difference can never disagree. */
  for (const c of [r.outing, r.groceries, r.rent, r.software]) {
    assert.equal(of(c).halves?.of, part(now, c)?.value ?? 0, `${String(c.fields.name)}: this month so far`);
    assert.equal(of(c).halves?.per, part(before, c)?.value ?? 0, `${String(c.fields.name)}: last month to the 18th`);
  }
  /* AND THE WHOLE: E£5,670.00 so far against E£5,840.00 by the 18th of August, with what has no category in both. */
  assert.equal(got.value, 567_000 - 584_000);
  assert.deepEqual(got.halves, { of: 567_000, per: 584_000, perRows: 6 });
  assert.equal(got.unit, 'EGP');
});

test('A CATEGORY IS SHOWN A CHANGE ONLY WHERE THE GATE PASSES, each category asked on its own', async () => {
  const r = await fresh();
  twoMonths(r);
  /* Four Software payments this month against none by the 18th of last, and one Rent against one. */
  for (const on of ['2026-09-05', '2026-09-06', '2026-09-07']) spent(r, on, 1_000, r.software);
  const got = read(r.k, 'spent-vs-last-month');
  const said = (c: Entry): [number | null | undefined, string | undefined] => [part(got, c)?.delta, part(got, c)?.why];

  assert.ok(Math.abs((part(got, r.outing)?.delta ?? 0) - 0.4) < 1e-12, 'Outing is up 40% and the record does not say so');
  assert.equal(part(got, r.outing)?.why, '');
  assert.ok(Math.abs((part(got, r.groceries)?.delta ?? 0) + 0.5) < 1e-12, 'Groceries is down by half');
  assert.equal(part(got, r.rent)?.delta, 0);
  /* SOFTWARE HAD NOTHING BY THE 18TH OF AUGUST, so its E£120.00 is a difference and no change. */
  assert.deepEqual(said(r.software), [null, 'one of the two windows is empty']);
  assert.equal(part(got, r.software)?.value, 12_000);

  /* THREE ENTRIES THIS MONTH AGAINST FORTY LAST MONTH IS NO CHANGE EITHER ("Done when"). */
  const gifts = value<Entry>(r.k.create('categories', { name: 'Gifts', direction: 'out', state: 'live' }, OWNER));
  for (let d = 1; d <= 10; d += 1) for (let n = 0; n < 4; n += 1) spent(r, `2026-08-${String(d).padStart(2, '0')}`, 500, gifts);
  for (const on of ['2026-09-01', '2026-09-02', '2026-09-03']) spent(r, on, 500, gifts);
  const after = read(r.k, 'spent-vs-last-month');
  assert.equal(part(after, gifts)?.delta, null, 'three entries against forty was called a change');
  assert.notEqual(part(after, gifts)?.why, '');
  assert.equal(part(after, gifts)?.value, 1_500 - 20_000);
  assert.ok(Math.abs((part(after, r.outing)?.delta ?? 0) - 0.4) < 1e-12, "another category's entries moved Outing's change");
});

test('IN THE FIRST DAYS OF A MONTH NOTHING READS AS GOOD NEWS: the 2nd is held against the 2nd, never against a whole month', async () => {
  const r = await fresh(Date.UTC(2026, 8, 2, 12));
  spent(r, '2026-08-01', 500_000, r.rent);
  spent(r, '2026-08-20', 90_000, r.outing);
  spent(r, '2026-09-01', 500_000, r.rent);
  const got = read(r.k, 'spent-vs-last-month');
  assert.equal(got.value, 0, 'the 20th of last month was held against the 2nd of this one');
  assert.equal(part(got, r.outing), undefined);
  assert.equal(read(r.k, 'spent-last-month').value, 590_000);
});
