/**
 * MONEY'S WHERE IT WENT (PGS-C20 job 3): a folded heading at the end of Money over this month as shares of what it was
 * for, and who was paid in what nobody has filed, read off the declaration and then off the page a fresh record draws.
 *
 * "Unfiled grouped by merchant, where, bars, share" (the owner). RED FIRST, against money.ts before this change: no
 * block on Money was headed Where it went, and nothing on any page drew the entries with no category by who was paid.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { BANKS, COMPANIES } from '../../../fixtures/names.ts';
import { METRICS, firstPartyDocument } from '../src/index.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { WHERE_IT_WENT } from '../src/modules/money/pages/parts/where-it-went.ts';

type When = { metric?: string; gt?: number; gte?: number; lt?: number };
type Declared = { kind: string; heading?: string; lead?: boolean; area?: string; box?: boolean; fold?: boolean; when?: When; source?: string; where?: string; unset?: string; limit?: number; columns?: { field: string }[] };
type WholeRow = { label: string | null; rows: number; value: number | null; unit?: string; parts?: { amount: number; currency: string }[] };
type Drawn = {
  kind: string;
  heading?: string;
  drawn?: boolean;
  refusals: readonly unknown[];
  readings?: { metric: string; reading: { value: number | null; unit?: string; groups?: { label?: string; value: number | null }[] } | null }[];
  wholeRead?: { rows: WholeRow[]; total: number | null };
};

const BLOCKS = MONEY_PAGE.blocks as readonly Declared[];
const at = (heading: string): number => BLOCKS.findIndex((b) => b.heading === heading);

/** 20 October, so every entry below is this month and the last 91 days. */
const TODAY = Date.UTC(2026, 9, 20, 12);
const on = (d: number): string => `2026-10-${String(d).padStart(2, '0')}`;
const OWNER = { actor: 'p_test' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/** Two invented payees for what nobody has filed. */
const LARGER = COMPANIES[1];
const SMALLER = COMPANIES[3];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
const reading = (k: Kernel, id: string): number | null => value<{ value: number | null }>(k.metric(METRICS[id] as never)).value;
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

type Kept = { k: Kernel; account: Entry; groceries: Entry; travel: Entry };

/** A fresh record holding Money and what it points at, with no example entries, one bank account and two categories. */
async function fresh(): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(TODAY));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const account = value<Entry>(k.create('accounts', { name: `${BANKS[0]} current account`, kind: 'bank', balance: gbp(900_000), as_of: on(19), liquid: true } as never, OWNER));
  const category = (name: string): Entry => value<Entry>(k.create('categories', { name, direction: 'out', state: 'live' } as never, OWNER));
  return { k, account, groceries: category('Groceries'), travel: category('Travel') };
}

/** One cleared entry of money going out this month (or, with `direction`, coming in), in pence. */
const spent = (r: Kept, day: number, amount: number, payee: string, category: Entry | null, currency = 'GBP', direction = 'out'): Entry =>
  value<Entry>(
    r.k.create(
      'transactions',
      { what: 'Card payment', on: on(day), direction, amount: { amount, currency }, account: r.account.id, state: 'cleared', transfer: false, payee, ...(category ? { category: category.id } : {}) } as never,
      OWNER,
    ),
  );

/** Twelve entries this month: seven filed under two categories, five with none across the two payees. */
function twelve(r: Kept): Entry[] {
  [
    [1, 4_200, r.groceries],
    [3, 1_800, r.groceries],
    [6, 2_600, r.groceries],
    [9, 12_000, r.travel],
    [11, 3_400, r.travel],
    [14, 900, r.groceries],
    [17, 5_100, r.travel],
  ].forEach(([d, amount, c]) => spent(r, d as number, amount as number, COMPANIES[0], c as Entry));
  return [
    spent(r, 2, 4_000, LARGER, null),
    spent(r, 8, 3_000, LARGER, null),
    spent(r, 15, 2_000, LARGER, null),
    spent(r, 5, 1_500, SMALLER, null),
    spent(r, 12, 1_000, SMALLER, null),
  ];
}

const FILED = 4_200 + 1_800 + 2_600 + 12_000 + 3_400 + 900 + 5_100;
const UNFILED = 4_000 + 3_000 + 2_000 + 1_500 + 1_000;

function drawn(k: Kernel): Drawn[] {
  const blocks = value<{ blocks: Drawn[] }>(k.page('money')).blocks;
  for (const heading of WHERE_IT_WENT.map((b) => b.heading as string)) {
    const b = blocks.find((x) => x.heading === heading);
    assert.ok(b, `Money draws no block headed ${heading}`);
    assert.deepEqual(b.refusals, [], `${heading} is refused`);
  }
  return blocks;
}
const of = (blocks: Drawn[], heading: string): Drawn => blocks.find((b) => b.heading === heading)!;

test('WHERE IT WENT IS THE LAST OF MONEY, a folded heading over the split and the bar, and the page is 24 blocks at the most', () => {
  assert.ok(BLOCKS.length <= 24, `Money declares ${BLOCKS.length} blocks, and a page declares 24 at the most`);
  const section = at('Where it went');
  assert.equal(section, BLOCKS.length - 3, 'Where it went is not the last three blocks of Money');
  assert.equal(section, at('Every month, by category') + 1, 'Where it went does not follow Every month, by category');
  assert.deepEqual(
    BLOCKS.slice(section).map((b) => [b.kind, b.heading]),
    [
      ['section', 'Where it went'],
      ['split', 'This month, by category'],
      ['bar', 'No category yet, by who was paid'],
    ],
  );
  const [heading, split, bar] = BLOCKS.slice(section) as [Declared, Declared, Declared];
  /* FOLDED, AND THE FIRST FOLD ON THE PAGE, so what stands before it is what stood there. */
  assert.equal(heading.fold, true, 'Where it went is open');
  assert.notEqual(heading.box, true, 'Where it went is a box');
  assert.equal(BLOCKS.findIndex((b) => b.kind === 'section' && b.fold === true), section, 'another heading folds before Where it went');
  assert.deepEqual(heading.when, { metric: 'cash-accounts', gt: 0 });
  /* THE SPLIT, over the figure already declared, its hole named. */
  assert.deepEqual([split.source, split.unset, split.when], ['metric.spent-by-category-month', 'No category yet', { metric: 'spent-by-category-month', gt: 0 }]);
  /* THE BAR, over the entries the count counts that went out, so it is drawn on what it draws and says who was paid. */
  const count = METRICS['txn-uncategorised'] as unknown as { source: string; where: string };
  assert.equal(bar.source, count.source);
  assert.equal(bar.where, `${count.where}, direction is out`, 'the bar reads other entries than the count it is drawn on, less what came in');
  assert.deepEqual(bar.when, { metric: 'txn-uncategorised', gt: 0 });
  assert.deepEqual(bar.columns!.map((c) => c.field), ['payee', 'amount']);
  assert.equal(bar.limit, 8);
});

test('THE TILES BEFORE THE FOLD ARE SIX AT THE MOST, counted as `money-page.test.ts` counts them', () => {
  const leads = BLOCKS.filter((b) => b.lead && b.when !== undefined).map((b) => b.when!);
  const standsIn = (b: Declared): boolean =>
    b.when !== undefined && (b.when.lt !== undefined || leads.some((w) => w.metric === b.when!.metric && w.lt !== undefined && b.when!.gte === w.lt));
  const main = BLOCKS.filter((b) => b.area !== 'rail');
  const fold = main.findIndex((b) => b.kind === 'section' && b.fold === true);
  assert.ok(fold > 0, 'Money has no fold');
  let boxed = false;
  const above = main.slice(0, fold).filter((b) => {
    if (b.kind === 'section') {
      boxed = b.box === true;
      return boxed;
    }
    return !boxed && !b.lead && !standsIn(b);
  });
  assert.ok(above.length <= 6, `Money stands ${above.length} tiles before its fold: ${above.map((b) => b.heading).join(', ')}`);
  assert.ok(!above.some((b) => WHERE_IT_WENT.some((w) => w.heading === b.heading)), 'a block of Where it went stands before the fold');
});

test('A FRESH RECORD WITH AN ACCOUNT AND NOTHING SPENT draws neither block, and no heading over nothing', async () => {
  const r = await fresh();
  const blocks = drawn(r.k);
  /* A HEADING WHOSE BLOCKS ARE ALL SHUT IS SHUT WITH THEM (`emptyBoxesShut`), so the fold says nothing it cannot open. */
  assert.equal(of(blocks, 'Where it went').drawn, false, 'Where it went is drawn over nothing');
  assert.equal(of(blocks, 'This month, by category').drawn, false, 'the split is drawn over a month with nothing spent');
  assert.equal(of(blocks, 'No category yet, by who was paid').drawn, false, 'the bar is drawn with nothing unfiled');
});

test('TWELVE ENTRIES THIS MONTH, FIVE UNFILED: the split holds the month with No category yet the rest, and the bar is the two payees', async () => {
  const r = await fresh();
  twelve(r);
  assert.equal(reading(r.k, 'txn-uncategorised'), 5);
  const blocks = drawn(r.k);
  assert.notEqual(of(blocks, 'Where it went').drawn, false, 'Where it went is shut over a month with spending');

  const split = of(blocks, 'This month, by category');
  assert.notEqual(split.drawn, false, 'the split is not drawn over a month with spending');
  const month = split.readings!.find((x) => x.metric === 'spent-by-category-month')!.reading!;
  assert.equal(month.value, FILED + UNFILED, 'the whole is not everything spent this month');
  assert.equal(month.unit, 'GBP');
  const parts = (month.groups ?? []).map((g) => [g.label, g.value]).sort();
  assert.deepEqual(parts, [['Groceries', 9_500], ['Travel', 20_500]]);
  /* WHAT NO PART HOLDS IS THE WHOLE LESS THE PARTS, which the split names No category yet. */
  assert.equal(month.value! - parts.reduce((n, [, v]) => n + (v as number), 0), UNFILED);

  const bar = of(blocks, 'No category yet, by who was paid');
  assert.notEqual(bar.drawn, false, 'the bar is not drawn while five entries have no category');
  assert.deepEqual(
    bar.wholeRead!.rows.map((w) => [w.label, w.rows, w.value, w.unit]),
    [
      [LARGER, 3, 9_000, 'GBP'],
      [SMALLER, 2, 2_500, 'GBP'],
    ],
    'the bar is not the two payees, the larger first',
  );
  assert.equal(bar.wholeRead!.total, UNFILED);
});

test('FILING THE LAST UNFILED ENTRY SHUTS THE BAR, and the split still holds the month', async () => {
  const r = await fresh();
  const unfiled = twelve(r);
  for (const e of unfiled) value(r.k.update('transactions', e.id, { category: r.groceries.id } as never, OWNER));
  assert.equal(reading(r.k, 'txn-uncategorised'), 0);
  const blocks = drawn(r.k);
  assert.equal(of(blocks, 'No category yet, by who was paid').drawn, false, 'the bar is drawn with nothing unfiled');
  assert.notEqual(of(blocks, 'This month, by category').drawn, false, 'the split went with the bar');
});

test('A PAYEE PAID IN TWO CURRENCIES IS NEVER ADDED INTO ONE BAR: each amount in its own, in minor units, and no total', async () => {
  const r = await fresh();
  twelve(r);
  spent(r, 18, 50_000, SMALLER, null, 'EGP');
  const bar = of(drawn(r.k), 'No category yet, by who was paid');
  const smaller = bar.wholeRead!.rows.find((w) => w.label === SMALLER)!;
  assert.equal(smaller.rows, 3);
  assert.equal(smaller.value, null, 'pounds and pounds Egyptian were added into one number');
  assert.deepEqual([...(smaller.parts ?? [])].sort((a, b) => a.currency.localeCompare(b.currency)), [{ amount: 50_000, currency: 'EGP' }, { amount: 2_500, currency: 'GBP' }]);
  assert.equal(bar.wholeRead!.total, null, 'the bar has one total across two currencies');
  for (const w of bar.wholeRead!.rows) for (const p of w.parts ?? []) assert.ok(Number.isInteger(p.amount), `${String(w.label)} holds a part that is not whole minor units`);
});

test('MONEY THAT CAME IN IS NOT WHO WAS PAID: an unfiled payment in from a payee is never a bar, nor added to what was paid them', async () => {
  const r = await fresh();
  twelve(r);
  /* A refund from the larger payee and a payment from a client, both unfiled: the count holds them, the bar does not. */
  spent(r, 16, 1_200, LARGER, null, 'GBP', 'in');
  spent(r, 18, 80_000, COMPANIES[5], null, 'GBP', 'in');
  assert.equal(reading(r.k, 'txn-uncategorised'), 7);
  const bar = of(drawn(r.k), 'No category yet, by who was paid');
  assert.deepEqual(
    bar.wholeRead!.rows.map((w) => [w.label, w.rows, w.value]),
    [
      [LARGER, 3, 9_000],
      [SMALLER, 2, 2_500],
    ],
    'money that came in is drawn as who was paid',
  );
  assert.equal(bar.wholeRead!.total, UNFILED);
});
