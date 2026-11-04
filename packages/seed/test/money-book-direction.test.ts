/**
 * A book's page says when a category is marked the other way from how the Ledger books it (REC-A13's visible half).
 *
 * `categories-against-direction` counts the live categories marked one way that hold Ledger entries going the other
 * way, which an import leaves behind (`figures/direction.ts`). Money's Heads up said it and was taken off the Money page
 * to keep that page at twenty-four blocks, so no screen read the figure. The Book page now says it, one line a count,
 * with a link to Categories, and nothing while the count is nought.
 *
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, with no example entries, and the page read as the app reads
 * it (`k.page`), so a line the page checker or the record refuses fails here and not on a screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { MONEY_BOOK_PAGE } from '../src/modules/money/pages/book.ts';

const OWNER = { actor: 'p_1' };
const FIGURE = 'categories-against-direction';
const ONE = '1 category is marked the other way from how the Ledger books it. [See Categories](/r/categories).';
const MANY = '{{categories-against-direction}} categories are marked the other way from how the Ledger books them. [See Categories](/r/categories).';

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

type Kept = { k: Kernel; spending: Entry; income: Entry; current: Entry };

/** A fresh record holding Money, one book with an account in pounds, and two categories marked one way each. */
async function fresh(): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const book = value<Entry>(k.create('books', { name: 'Studio' }, OWNER));
  const current = value<Entry>(k.create('accounts', { name: 'Studio current', kind: 'bank', balance: { amount: 100_000, currency: 'GBP' }, as_of: day(-1), book: book.id }, OWNER));
  const spending = value<Entry>(k.create('categories', { name: 'Software', direction: 'out', state: 'live' }, OWNER));
  const income = value<Entry>(k.create('categories', { name: 'Clients', direction: 'in', state: 'live' }, OWNER));
  return { k, spending, income, current };
}

/** One cleared Ledger entry in pounds, filed in the book's account under a category. */
const entry = (r: Kept, category: Entry, direction: 'in' | 'out', amount: number): void =>
  void value<Entry>(
    r.k.create('transactions', { what: `${direction === 'in' ? 'Paid in' : 'Paid out'} ${amount}`, on: day(-2), direction, amount: { amount, currency: 'GBP' }, account: r.current.id, state: 'cleared', category: category.id }, OWNER),
  );

type Drawn = { kind: string; heading?: string; body?: string; lead?: boolean; drawn?: boolean; refusals?: unknown[] };

/** The lines the Studio book's page draws on the figure, found by the book's name and read as the app reads it. */
function linesOf(k: Kernel): Drawn[] {
  const found = (k.pages() as unknown as { slug: string; title: string; template: string | null }[]).find((p) => p.template === MONEY_BOOK_PAGE.page && p.title === 'Studio');
  assert.ok(found, 'Studio has a page of its own');
  const blocks = value<{ blocks: Drawn[] }>(k.page(found.slug)).blocks;
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading ?? b.kind} is read`);
  return blocks.filter((b) => b.kind === 'note' && b.drawn !== false && (b.body === ONE || b.body === MANY));
}

test('THE PAGE DECLARES TWO LINES ON THE FIGURE, one for one category and one for more, as the sentence it opens on', () => {
  const blocks = MONEY_BOOK_PAGE.blocks as Record<string, unknown>[];
  const on = blocks.filter((b) => JSON.stringify(b.when ?? {}).includes(FIGURE));
  assert.deepEqual(on.map((b) => b.when), [{ metric: FIGURE, is: 1 }, { metric: FIGURE, gt: 1 }]);
  assert.deepEqual(on.map((b) => b.body), [ONE, MANY]);
  assert.deepEqual([blocks.indexOf(on[0]!), blocks.indexOf(on[1]!)], [0, 1], 'under the name, over what the book has');
  /* AND THE WALK IS THE FIRST TILE (no What you have since 3.34.0, aaf8e24df), under the line a book with no account reads
     (3.36.0, fc63fdc5e). */
  assert.deepEqual(blocks.slice(2, 4).map((b) => b.kind), ['note', 'forecast']);
  for (const b of on) {
    assert.equal(b.lead, true, 'a line under the name, and never a tile over the fold');
    assert.doesNotMatch(String(b.body), /—|\brow\b|\bentity\b/u);
  }
  assert.ok(blocks.length <= 24, `${blocks.length} blocks is more than a page declares`);
});

test('ONE CATEGORY AGAINST HOW THE LEDGER BOOKS IT DRAWS "1 category", with the way to Categories', async () => {
  const r = await fresh();
  entry(r, r.spending, 'out', 1_200);
  entry(r, r.spending, 'in', 4_000);
  const lines = linesOf(r.k);
  assert.deepEqual(lines.map((b) => b.body), [ONE]);
  assert.match(lines[0]!.body!, /1 category\b/u);
  assert.match(lines[0]!.body!, /\(\/r\/categories\)/u);
});

test('TWO DRAW THE COUNT, and only that line of the pair', async () => {
  const r = await fresh();
  entry(r, r.spending, 'in', 4_000);
  entry(r, r.income, 'out', 900);
  assert.deepEqual(linesOf(r.k).map((b) => b.body), [MANY]);
});

test('A CLEAN RECORD DRAWS NONE: every entry going the way its category is marked', async () => {
  const r = await fresh();
  entry(r, r.spending, 'out', 1_200);
  entry(r, r.income, 'in', 90_000);
  assert.deepEqual(linesOf(r.k), []);
});
