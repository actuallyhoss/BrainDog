/**
 * MONEY'S HOME, BLOCK BY BLOCK: what it holds, in what order and under what condition, read off the
 * declaration and then off the page a record draws.
 *
 * SINCE money-core 3.29.0 the home is a front door: one line, the hero (Cash now with the walk ahead drawn small and
 * four answers), then a board of tiles built the same way, and Heads up. What repeats every month, the months in and
 * out and the chart of Cash ahead have a page of their own, so the tests that held their blocks read each block on its
 * own declaration (`Kernel.block`) and not through this page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { BANKS, COMPANIES } from '../../../fixtures/names.ts';
import { METRICS, NOW, day, firstPartyDocument, installSeed } from '../src/index.ts';
import type { BlockResult, PageBlock } from '@braindog/kernel';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { CASH_AHEAD } from './money-walk-page.ts';
import { EVERY_MONTH } from '../src/modules/money/pages/parts/every-month.ts';

type When = { metric?: string; gt?: number; gte?: number; lt?: number; all?: unknown[] };
type Declared = {
  kind: string;
  heading?: string;
  lead?: boolean;
  area?: string;
  box?: boolean;
  fold?: boolean;
  when?: When;
  cells?: { metric: string; label: string }[];
  back?: number;
  ahead?: number;
  horizons?: unknown;
  knobs?: string[];
  source?: string;
};
type Drawn = { kind: string; heading?: string; drawn?: boolean; refusals: readonly unknown[]; readings?: { metric: string; reading: { value: number | null } | null }[] };

const BLOCKS = MONEY_PAGE.blocks as readonly Declared[];
const at = (heading: string): number => BLOCKS.findIndex((b) => b.heading === heading);
const OWNER = { actor: 'p_test' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

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

/** A record holding money-core and what it points at, as its document says them, with no example entries. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

/**
 * Money as the record draws it, every block read without a refusal, or only the blocks named: a record holding money-core
 * alone has no `services` list for Cash ahead's walk to read, which is that walk's own and not this test's.
 */
function drawn(k: Kernel, only?: readonly string[]): Drawn[] {
  const blocks = value<{ blocks: Drawn[] }>(k.page('money')).blocks;
  for (const b of blocks)
    if (only === undefined || only.includes(b.heading ?? '')) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} is refused`);
  return blocks;
}

test('MONEY OPENS ON ITS LINE AND ITS HERO, then one board, then Heads up, with no side column and no walk of its own', () => {
  /* 19 SINCE money-core 3.31.0: Over time (two, one drawn), the budgets at a glance and its note joined the board. */
  assert.ok(BLOCKS.length <= 19, `Money declares ${BLOCKS.length} blocks, and a front door is not a page of them`);
  assert.ok(!BLOCKS.some((b) => b.kind === 'bridge' || b.kind === 'forecast'), 'a walk is drawn as a chart on Money again');
  assert.deepEqual(BLOCKS.filter((b) => b.area !== undefined).map((b) => b.heading ?? b.kind), [], 'Money has a side column again');

  /* THE HERO IS THE ONE LEAD STAT, WHOLE ROW, and its first cell is Cash now with the walk ahead. */
  const hero = BLOCKS.find((b) => b.kind === 'stat' && b.lead === true)!;
  assert.deepEqual(hero.when, { metric: 'cash-accounts', gt: 0 });
  assert.deepEqual(hero.cells!.map((c) => c.label), ['Cash now', 'In, next 30 days', 'Out, next 30 days']);
  assert.deepEqual([hero.cells![0]!.metric, (hero.cells![0] as { ahead?: string }).ahead], ['cash-now', 'runway-days']);
  assert.ok(at('Heads up') > at('Instalments') && at('Instalments') > at('Accounts'), 'Heads up does not close the board');
  assert.deepEqual(['Coming up', 'Spent this month', 'Accounts', 'Ledger', 'Instalments'].filter((h) => at(h) < 0), [], 'a tile of the board is missing');
});

test('WHAT WENT TO ITS OWN PAGE IS NOT ON MONEY', () => {
  for (const heading of ['Cash ahead', 'In and out, by month', 'Every month', 'Every month, by category', 'Coming and going', 'Where it went'])
    assert.equal(at(heading), -1, `${heading} is on Money's home again`);
  assert.deepEqual(BLOCKS.filter((b) => b.kind === 'queue').map((b) => b.heading), [], 'Money places a queue again');
});

test('CASH AHEAD KEEPS ITS LENGTHS AND CONTROLS where a page places it', () => {
  const ahead = CASH_AHEAD as unknown as Declared;
  assert.deepEqual(ahead.horizons, [84, 180, 365, 730, 1825, 'last']);
  assert.ok(!ahead.knobs!.includes('leave'), '`leave` is a second control over the streams `count` moves');
});

/** One block of a part, read on a record the way a page placing it reads it. */
const read = (k: Kernel, block: unknown): BlockResult => k.block(block as PageBlock);

test('ON THE SAMPLE, EVERY MONTH READS ITS CELLS FROM THE FIGURES', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const every = read(k, EVERY_MONTH[0]) as unknown as Drawn;
  assert.notEqual(every.drawn, false, 'the sample repeats money and draws no Every month');
  assert.deepEqual(every.refusals, []);
  const said = Object.fromEntries((every.readings ?? []).map((r) => [r.metric, r.reading?.value ?? null]));
  const ins = reading(k, 'every-month-in');
  const outs = reading(k, 'every-month-out');
  assert.ok(typeof ins === 'number' && typeof outs === 'number' && outs > 0, `nothing to hold the cells to: ${String(ins)}, ${String(outs)}`);
  assert.deepEqual(said, { 'every-month-in': ins, 'every-month-out': outs, 'leaving-30d': reading(k, 'leaving-30d') });
});

test('ON THE SAMPLE, THE COSTS BY CATEGORY ARE DRAWN, and their parts add up to Going out in one currency', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const bar = read(k, EVERY_MONTH[1]) as unknown as Drawn;
  assert.notEqual(bar.drawn, false, 'the sample repeats costs and draws no bar of them');
  assert.deepEqual(bar.refusals, []);

  type Grouped = { value: number | null; unit: string | null; groups?: { value: number | null }[] };
  const got = (bar.readings ?? []).find((r) => r.metric === 'every-month-by-category')?.reading as Grouped | null | undefined;
  assert.ok(got && (got.groups ?? []).length > 1, 'the bar has one category or none to draw');
  const whole = value<{ value: number | null; unit: string | null }>(k.metric(METRICS['every-month-out'] as never));
  assert.ok(typeof whole.value === 'number' && whole.value > 0);
  assert.equal(got.groups!.reduce((n, g) => n + (g.value ?? 0), 0), whole.value, 'the parts are not Going out');
  assert.ok(typeof whole.unit === 'string' && whole.unit.length === 3, `Going out is in no one currency: ${String(whole.unit)}`);
  assert.equal(got.unit, whole.unit, 'the bar is in another currency than Going out');
});

test('A RECORD WITH ONE ACCOUNT DRAWS NO EVERY MONTH UNTIL SOMETHING REPEATS, and then draws it at its monthly share', async () => {
  const k = await fresh();
  value(k.create('accounts', { name: `${BANKS[0]} current account`, kind: 'bank', balance: gbp(250_000), as_of: day(0), liquid: true } as never, OWNER));
  assert.equal((read(k, EVERY_MONTH[0]) as unknown as Drawn).drawn, false, 'Every month is drawn with nothing repeating');

  /* A COST EVERY MONTH AND MONEY IN EVERY QUARTER: the cells are each line's monthly share, a third of the quarter. */
  const line = (what: string, direction: string, amount: number, every: string) =>
    value(k.create('recurring', { what, direction, amount: gbp(amount), next_due: day(7), every, state: 'live' } as never, OWNER));
  line(`${COMPANIES[2]} hosting`, 'out', 4_500, 'monthly');
  line(`${COMPANIES[0]} retainer`, 'in', 300_000, 'quarterly');
  const every = read(k, EVERY_MONTH[0]) as unknown as Drawn;
  assert.notEqual(every.drawn, false, 'Every month is not drawn with a cost repeating');
  const said = Object.fromEntries((every.readings ?? []).map((r) => [r.metric, r.reading?.value ?? null]));
  assert.deepEqual(said, { 'every-month-in': reading(k, 'every-month-in'), 'every-month-out': reading(k, 'every-month-out'), 'leaving-30d': 4_500 });
  assert.deepEqual([said['every-month-in'], said['every-month-out']], [100_000, 4_500]);
});

test('THE HOME READS WITHOUT A REFUSAL ON THE SAMPLE, hero first', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const blocks = drawn(k);
  const first = blocks.find((b) => b.kind !== 'note' && b.drawn !== false)!;
  assert.equal(first.kind, 'stat', 'the first tile under the line is not the hero');
});
