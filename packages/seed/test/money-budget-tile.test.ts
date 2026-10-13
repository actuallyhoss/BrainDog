/**
 * Money's own budget tile and the line a passed budget writes (REC-B19 job 4, `parts/budget.ts`).
 *
 * The clock is 25 October 2026, as in `money-budget-passed.test.ts`. Outing may have E£1,000.00 a month and Groceries
 * E£3,000.00; Rent holds no budget.
 *
 * WHAT IS HELD HERE. `BUDGET` is two blocks: the tile that sets each category holding a most a month against what the
 * ledger spent on it since the first, and the line "Outing passed its budget on 19 Oct.", written once a category and
 * only for one that reached its line. The tile is read through the kernel on a page of these two blocks and nothing
 * else, because placing them on Money's page is money-wire-70's.
 *
 * TWO THINGS THIS FILE DECLARES FOR ITSELF, AND SAYS SO. `budgets-set` is the Personal use case's figure today and
 * Money declares none, so the page here declares the same count; the test at the foot is a `todo` until Money holds
 * it. And no page reader writes a note once a row yet, so `lines` below reads the note exactly as it is declared, with
 * the kernel's own `fill` and the kernel's own reading of the figure; the second `todo` is the page doing it.
 *
 * RED FIRST: with no `parts/budget.ts` the file does not load.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { fill, openRecord, type Declaration, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { shortDay } from '../../render/src/forecast.ts';

import { firstPartyDocument, metricDeclarations } from '../src/index.ts';
import { BUDGET_FIGURES } from '../src/modules/money/figures/budgets.ts';
import { BUDGET } from '../src/modules/money/pages/parts/budget.ts';

const OWNER = { actor: 'p_1' };
/** Noon on 25 October 2026. */
const TODAY = Date.UTC(2026, 9, 25, 12);
/** The one sentence that says which categories hold a budget, as the count, the tile and the line all say it. */
const BUDGETED = 'state is live, direction is out, budget is set';

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

/** The count the tile is drawn on. Personal's own declaration of it today (`usecases/personal.ts`), word for word. */
const BUDGETS_SET: Declaration = {
  id: 'metric.budgets-set',
  kind: 'metric',
  body: { metric: 'budgets-set', name: 'Budgets set', source: 'register.categories', where: BUDGETED, value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

/** A page of the two blocks and nothing else. Nothing ships it: Money's page places them (money-wire-70). */
const PROBE: Declaration = { id: 'page.budget-probe', kind: 'page', body: { page: 'budget-probe', title: 'Budgets', blocks: BUDGET } as never };

type Kept = { k: Kernel; card: Entry };

/** A fresh record holding Money as a person installs it, with one account and no category of its own making. */
async function fresh(): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(TODAY));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const card = value<Entry>(k.create('accounts', { name: 'Card', kind: 'bank', balance: { amount: 5_000_000, currency: 'EGP' }, as_of: '2026-07-01' }, OWNER));
  return { k, card };
}

/** A category money goes out on, with the most a month in piastres where one is said. */
const category = (r: Kept, name: string, budget?: number): Entry =>
  value<Entry>(r.k.create('categories', { name, direction: 'out', state: 'live', ...(budget === undefined ? {} : { budget: { amount: budget, currency: 'EGP' } }) }, OWNER));

/** One cleared payment on a day, in piastres. */
const spent = (r: Kept, on: string, amount: number, on_what: Entry): Entry =>
  value<Entry>(
    r.k.create(
      'transactions',
      { what: `${String(on_what.fields.name)} ${on}`, on, direction: 'out', amount: { amount, currency: 'EGP' }, account: r.card.id, state: 'cleared', transfer: false, category: on_what.id },
      OWNER,
    ),
  );

type Block = Record<string, unknown> & { kind: string; when?: { metric: string; gt?: number; crossed?: boolean }; body?: string; source?: string; where?: string };
const [TILE, LINE] = BUDGET as unknown as [Block, Block];

type Drawn = {
  kind?: string;
  heading?: string;
  drawn?: boolean;
  refusals: readonly { code: string; fix: string }[];
  rows?: readonly { id: string; fields: Record<string, unknown> }[];
  readings?: readonly { metric: string; reading: { value: number | null; unit: string | null; groups?: { key?: unknown; label?: string; value: number | null }[] } | null }[];
};

/** The tile as the record draws it on the page of the two blocks. */
const tile = async (k: Kernel): Promise<Drawn> => {
  if (!k.declarations().some((d) => d.id === PROBE.id)) value(await k.install([BUDGETS_SET, PROBE]));
  const found = value<{ blocks: Drawn[] }>(k.page('budget-probe')).blocks.find((b) => b.kind === 'progress');
  assert.ok(found, 'the page draws no budget tile');
  return found;
};

type Read = { value: number | null; crossed?: { id: string; at: string; value: number } | null };

/**
 * The lines the note writes, read as it is declared: one for each category its own sentence admits, in its own order,
 * the category's fields filled in (`fill`, as a template page is filled from its entry), kept where the figure its
 * `when` names answers a day, with that day said the way a sentence says one.
 */
const lines = (k: Kernel): string[] => {
  assert.equal(LINE.source, 'register.categories');
  const rows = value<{ rows: Entry[] }>(k.list({ register: 'categories', where: String(LINE.where), limit: Number(LINE.limit) })).rows;
  return [...rows]
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .flatMap((row) => {
      const filled = fill(LINE, row) as Block;
      const asked = String(filled.when?.metric);
      const at = asked.indexOf(':');
      assert.equal(asked.slice(0, at), 'budget-passed-on');
      const read = k.metric(fill(BUDGET_FIGURES['budget-passed-on'], null, asked.slice(at + 1)) as never);
      assert.ok(read.ok, `${asked}: ${sayOf(read)}`);
      const crossed = (read.value as unknown as Read).crossed;
      return crossed ? [String(filled.body).replace('{{budget-passed-on.at}}', shortDay(crossed.at))] : [];
    });
};

test('BUDGET IS THE TILE AND THE LINE, both over the categories that hold a most a month', () => {
  assert.equal(BUDGET.length, 2, 'Money is near its ceiling of blocks: the budget is one tile and one line');
  assert.equal(TILE.kind, 'progress');
  assert.equal(TILE.source, 'register.categories');
  assert.match(String(TILE.where), /budget is set/u);
  assert.equal(TILE.where, BUDGETED, 'the tile draws a category the count it is drawn on does not count');
  assert.deepEqual(TILE.columns, [{ field: 'name' }, { field: 'budget' }], 'a category is its name against its own most a month');
  assert.equal(TILE.spent, 'spent-by-category-month', "what was spent is the ledger's own sum since the first, by category");
  assert.deepEqual(TILE.when, { metric: 'budgets-set', gt: 0 }, 'the tile is drawn while a budget is set and not before');
  assert.equal(TILE.empty, undefined, 'a tile drawn only while a budget is set has no empty state to word');
  assert.equal(TILE.span, 12);

  assert.equal(LINE.kind, 'note');
  assert.equal(LINE.source, TILE.source);
  assert.equal(LINE.where, TILE.where, 'the line is written for a category the tile does not draw');
  assert.deepEqual(LINE.order, TILE.order);
  assert.equal(LINE.limit, TILE.limit);
  assert.deepEqual(LINE.when, { metric: 'budget-passed-on:{{name}}', crossed: true }, 'the line is written on the day the figure answers, for the category it is about');
  assert.equal(LINE.body, '{{name}} passed its budget on {{budget-passed-on.at}}.');
  assert.equal(LINE.heading, undefined, 'a line is no tile and wears no heading');
});

test('THE WORDS A PERSON READS name no figure, no list and no dash', () => {
  const figures = new Set(metricDeclarations().map((d) => d.id.replace(/^metric\./u, '')));
  assert.ok(figures.has('budget-passed-on') && figures.has('spent-by-category-month'), 'Money declares the figures the two blocks read');
  for (const said of [TILE.heading, LINE.body].map((s) => String(s).replace(/\{\{[^{}]*\}\}/gu, ''))) {
    assert.doesNotMatch(said, /[—–]/u, `a dash in "${said}"`);
    assert.doesNotMatch(said, /\b(row|entity|register|metric|item)s?\b/iu, `"${said}" says a word of the build`);
  }
});

test('NO BUDGET, NO TILE: a record whose categories hold no most a month draws nothing about budgets', async () => {
  const r = await fresh();
  spent(r, '2026-10-03', 40_000, category(r, 'Rent'));
  const drawn = await tile(r.k);
  assert.deepEqual(drawn.refusals, []);
  assert.equal(drawn.drawn, false, 'the tile is drawn on a record that set no budget');
  assert.deepEqual(lines(r.k), []);
});

test('A BUDGET DRAWS THE TILE: each category that holds one, against what the ledger spent on it this month', async () => {
  const r = await fresh();
  const outing = category(r, 'Outing', 100_000);
  const rent = category(r, 'Rent');
  const groceries = category(r, 'Groceries', 300_000);
  spent(r, '2026-10-03', 40_000, outing);
  spent(r, '2026-10-09', 25_000, outing);
  spent(r, '2026-10-05', 120_000, groceries);
  spent(r, '2026-10-01', 900_000, rent);
  spent(r, '2026-09-28', 70_000, outing); // last month's, which is not this month's budget

  const drawn = await tile(r.k);
  assert.deepEqual(drawn.refusals, []);
  assert.notEqual(drawn.drawn, false, 'two budgets are set and no tile is drawn');
  const rows = drawn.rows ?? [];
  assert.deepEqual(rows.map((row) => row.fields.name), ['Outing', 'Groceries'], 'the categories with a budget, in the order they were made, and Rent is not one');
  assert.deepEqual(rows.map((row) => row.fields.budget), [{ amount: 100_000, currency: 'EGP' }, { amount: 300_000, currency: 'EGP' }]);

  /* WHAT WAS SPENT IS THE FIGURE'S PART FOR THAT CATEGORY, matched by the category itself and never by a word. */
  const reading = (drawn.readings ?? []).find((x) => x.metric === 'spent-by-category-month')?.reading;
  assert.ok(reading, 'the tile came back with no reading of what was spent');
  assert.equal(reading.unit, 'EGP');
  const part = (of: Entry): number | null | undefined => (reading.groups ?? []).find((g) => g.key === of.id || g.label === of.fields.name)?.value;
  assert.equal(part(outing), 65_000, 'Outing spent E£400.00 and E£250.00 this month');
  assert.equal(part(groceries), 120_000);
});

test('A CATEGORY THAT REACHED ITS BUDGET IS SAID WITH THE DAY: "Outing passed its budget on 19 Oct."', async () => {
  const r = await fresh();
  const outing = category(r, 'Outing', 100_000);
  const groceries = category(r, 'Groceries', 300_000);
  spent(r, '2026-10-03', 40_000, outing);
  spent(r, '2026-10-09', 40_000, outing);
  spent(r, '2026-10-19', 30_000, outing);
  spent(r, '2026-10-22', 5_000, outing); // after the line, which moves no day
  spent(r, '2026-10-05', 120_000, groceries); // under its own
  assert.deepEqual(lines(r.k), ['Outing passed its budget on 19 Oct.']);
});

test('A CATEGORY UNDER ITS BUDGET HAS NO LINE, and one with no budget has none whatever went on it', async () => {
  const r = await fresh();
  const outing = category(r, 'Outing', 100_000);
  spent(r, '2026-10-03', 40_000, outing);
  spent(r, '2026-10-09', 40_000, outing);
  spent(r, '2026-10-02', 900_000, category(r, 'Rent'));
  assert.deepEqual(lines(r.k), [], 'E£800.00 against E£1,000.00 was said to have passed');
});

test('EACH CATEGORY ANSWERS FOR ITSELF, a name of two words too, in the order the tile draws them', async () => {
  const r = await fresh();
  const outing = category(r, 'Outing', 100_000);
  const groceries = category(r, 'Groceries', 300_000);
  const eating = category(r, 'Eating out', 50_000);
  spent(r, '2026-10-19', 110_000, outing);
  spent(r, '2026-10-05', 120_000, groceries);
  spent(r, '2026-10-07', 50_000, eating); // exactly its budget, which has used it up
  assert.deepEqual(lines(r.k), ['Outing passed its budget on 19 Oct.', 'Eating out passed its budget on 7 Oct.']);
});

test("MONEY HOLDS THE COUNT ITS OWN TILE IS DRAWN ON, where it is the Personal use case's today", { todo: 'figures/budgets.ts declares budgets-set (blocked: not this job\'s file)' }, () => {
  assert.ok(metricDeclarations().some((d) => d.id === 'metric.budgets-set'), 'Money declares no budgets-set, so its budget tile is drawn only where Personal is installed');
});

test('THE PAGE WRITES THE LINE ITSELF, one a category that passed', { todo: 'the page reader writes a note once for each entry of its source (blocked: packages/kernel)' }, async () => {
  const r = await fresh();
  const outing = category(r, 'Outing', 100_000);
  spent(r, '2026-10-19', 110_000, outing);
  await tile(r.k);
  const notes = value<{ blocks: (Drawn & { body?: string; values?: Record<string, unknown> })[] }>(r.k.page('budget-probe')).blocks.filter((b) => b.kind === 'note' && b.drawn !== false);
  assert.equal(notes.length, 1, `the page wrote ${notes.length} lines for one category that passed: ${JSON.stringify(value<{ blocks: Drawn[] }>(r.k.page('budget-probe')).blocks.filter((b) => b.kind === 'note'))}`);
  assert.equal(notes[0]!.body, 'Outing passed its budget on {{budget-passed-on.at}}.');
  assert.deepEqual(notes[0]!.values, { 'budget-passed-on.at': '2026-10-19' });
});
