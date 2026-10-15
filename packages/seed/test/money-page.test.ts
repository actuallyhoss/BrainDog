/**
 * MONEY'S PAGE, BLOCK BY BLOCK (REC-B23 job 10): what it holds, in what order and under what condition, read off the
 * declaration and then off the page a record draws.
 *
 * WHAT REPEATS, AND HALF A YEAR BEHIND (REC-B23 jobs 5 to 7; "i dont want a very 'busy' looking ui, rather very tailored
 * and to the point", "a finance application on steroids... neatly visualized"). Every month says what comes in and goes
 * out every month after the chart, the walk of thirty days is off the page, and the chart reads six months back and
 * three ahead. The page is at the most blocks a page declares still, with the same tiles before its fold.
 *
 * AND WHAT THE COSTS ARE FOR, WITH THE QUESTIONS IN DECIDE (REC-B23 step 7): Waiting on you is off the side column, and
 * its block went to the bar of what repeats by category, straight after Every month.
 *
 * RED FIRST, against money.ts before this change: no block was headed Every month, a bridge stood under Coming and
 * going, and the chart read twelve months back; and, before step 7, the queue stood in the side column and the bar
 * was declared and not placed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { BANKS, COMPANIES } from '../../../fixtures/names.ts';
import { METRICS, NOW, day, firstPartyDocument, installSeed } from '../src/index.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
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

test('MONEY HOLDS EVERY MONTH AFTER INSTALMENTS, inside Coming and going, and no walk of thirty days', () => {
  assert.ok(BLOCKS.length <= 24, `Money declares ${BLOCKS.length} blocks, and a page declares 24 at the most`);
  assert.ok(!BLOCKS.some((b) => b.kind === 'bridge'), 'the walk of the next thirty days is on Money again');

  /* AFTER INSTALMENTS, AND STRAIGHT AFTER THE CHART WHOSE MONTHS AHEAD IT IS, with no heading between it and Coming
     and going, so the box holds it. */
  const every = at('Every month');
  assert.ok(every > at('Instalments') && at('Instalments') > at('Coming and going'), 'Every month is not after Instalments under Coming and going');
  assert.equal(every, at('In and out, by month') + 1, 'Every month is not straight after the chart');
  assert.ok(!BLOCKS.slice(at('Coming and going') + 1, every + 1).some((b) => b.kind === 'section'), 'a heading stands between Coming and going and Every month');

  /* THE FILE'S OWN BLOCK, AND NOT A COPY: in and out, from the two figures, in plain words. */
  const block = BLOCKS[every]!;
  assert.equal(block, EVERY_MONTH[0], 'Money places a copy of Every month');
  assert.equal(block.kind, 'stat');
  assert.deepEqual(block.cells, [
    { metric: 'every-month-in', label: 'Coming in' },
    { metric: 'every-month-out', label: 'Going out' },
  ]);
  assert.deepEqual(block.when, { metric: 'every-month-out', gt: 0 });

});

test('THE COSTS BY CATEGORY STAND STRAIGHT AFTER EVERY MONTH, the file\'s own bar, and the page is 24 blocks at the most', () => {
  /* REC-B23 step 7: the queue's block went to the bar, so the page holds it and is no longer. */
  assert.ok(BLOCKS.length <= 24, `Money declares ${BLOCKS.length} blocks, and a page declares 24 at the most`);
  const every = at('Every month');
  const bar = BLOCKS[every + 1]!;
  assert.equal(bar, EVERY_MONTH[1], 'what stands after Every month is not its own bar');
  assert.deepEqual([bar.kind, bar.heading, bar.source], ['bar', 'Every month, by category', 'metric.every-month-by-category']);
  assert.ok(!BLOCKS.slice(every, every + 2).some((b) => b.kind === 'section'), 'a heading stands between Every month and its bar');
  /* THE SAME CONDITION AS THE FIGURES OVER IT, so the bar is never drawn under a tile that is not. */
  assert.deepEqual(bar.when, BLOCKS[every]!.when);
});

test('NO QUESTION IS ASKED ON MONEY: the questions are answered in Decide, and the side column holds no queue', () => {
  assert.deepEqual(BLOCKS.filter((b) => b.kind === 'queue').map((b) => b.heading), [], 'Money places a queue again');
  assert.equal(at('Waiting on you'), -1, 'Waiting on you is on Money again');
  assert.deepEqual(BLOCKS.filter((b) => b.area === 'rail').map((b) => b.heading), ['Lasts', 'Accounts']);
});

test('THE CHART READS SIX MONTHS BACK AND THREE AHEAD, and Cash ahead keeps its lengths and controls', () => {
  const chart = BLOCKS[at('In and out, by month')]!;
  assert.deepEqual([chart.kind, chart.back, chart.ahead], ['series', 6, 3]);

  /* MOVED HERE FROM `money.test.ts`: the cash walk offers five years and to the end, and counting is one control. */
  const ahead = BLOCKS[at('Cash ahead')]!;
  assert.deepEqual(ahead.horizons, [70, 90, 180, 365, 730, 1825, 'last']);
  assert.ok(!ahead.knobs!.includes('leave'), '`leave` is a second control over the streams `count` moves');
});

test('THE SAME TILES STAND BEFORE THE FOLD, counted as `calm-pages.test.ts` counts them', () => {
  const leads = BLOCKS.filter((b) => b.lead && b.when !== undefined).map((b) => b.when!);
  const standsIn = (b: Declared): boolean =>
    b.when !== undefined && (b.when.lt !== undefined || leads.some((w) => w.metric === b.when!.metric && w.lt !== undefined && b.when!.gte === w.lt));
  const main = BLOCKS.filter((b) => b.area !== 'rail');
  const fold = main.findIndex((b) => b.kind === 'section' && b.fold === true);
  let boxed = false;
  const above = (fold < 0 ? main : main.slice(0, fold)).filter((b) => {
    if (b.kind === 'section') {
      boxed = b.box === true;
      return boxed;
    }
    return !boxed && !b.lead && !standsIn(b);
  });
  /* WHAT THE PAGE HELD BEFORE: Every month is inside Coming and going, which was already one tile. */
  assert.deepEqual(
    above.map((b) => b.heading),
    ['What you have, by book', 'Cash ahead', 'Cash now does not add up', 'Ledger', 'Heads up', 'Coming and going'],
  );
});

test('ON THE SAMPLE, EVERY MONTH READS ITS TWO CELLS FROM THE TWO FIGURES, and no block on Money is a bridge', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const blocks = drawn(k);
  assert.ok(!blocks.some((b) => b.kind === 'bridge'), 'the record draws a walk of thirty days on Money');
  const every = blocks.find((b) => b.heading === 'Every month')!;
  assert.notEqual(every.drawn, false, 'the sample repeats money and draws no Every month');
  const said = Object.fromEntries((every.readings ?? []).map((r) => [r.metric, r.reading?.value ?? null]));
  const ins = reading(k, 'every-month-in');
  const outs = reading(k, 'every-month-out');
  assert.ok(typeof ins === 'number' && typeof outs === 'number' && outs > 0, `nothing to hold the cells to: ${String(ins)}, ${String(outs)}`);
  assert.deepEqual(said, { 'every-month-in': ins, 'every-month-out': outs });
});

test('ON THE SAMPLE, THE COSTS BY CATEGORY ARE DRAWN, and their parts add up to Going out in one currency', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const blocks = drawn(k);
  assert.ok(!blocks.some((b) => b.kind === 'queue'), 'the record draws a queue on Money');
  const bar = blocks.find((b) => b.heading === 'Every month, by category')!;
  assert.ok(bar, 'the record does not draw the costs by category');
  assert.notEqual(bar.drawn, false, 'the sample repeats costs and draws no bar of them');
  assert.deepEqual(bar.refusals, []);

  type Grouped = { value: number | null; unit: string | null; groups?: { value: number | null }[] };
  const read = (bar.readings ?? []).find((r) => r.metric === 'every-month-by-category')?.reading as Grouped | null | undefined;
  assert.ok(read && (read.groups ?? []).length > 1, 'the bar has one category or none to draw');
  const whole = value<{ value: number | null; unit: string | null }>(k.metric(METRICS['every-month-out'] as never));
  assert.ok(typeof whole.value === 'number' && whole.value > 0);
  assert.equal(read.groups!.reduce((n, g) => n + (g.value ?? 0), 0), whole.value, 'the parts are not Going out');
  /* ONE CURRENCY: two are never added, so the parts and the whole are in the same one. */
  assert.ok(typeof whole.unit === 'string' && whole.unit.length === 3, `Going out is in no one currency: ${String(whole.unit)}`);
  assert.equal(read.unit, whole.unit, 'the bar is in another currency than Going out');
});

test('A RECORD WITH ONE ACCOUNT SHUTS COMING AND GOING UNTIL SOMETHING REPEATS, and then draws Every month at its monthly share', async () => {
  const k = await fresh();
  value(k.create('accounts', { name: `${BANKS[0]} current account`, kind: 'bank', balance: gbp(250_000), as_of: day(0), liquid: true } as never, OWNER));
  const box = (blocks: Drawn[]) => blocks.find((b) => b.heading === 'Coming and going')!;
  const every = (blocks: Drawn[]) => blocks.find((b) => b.heading === 'Every month')!;
  const ours = ['Coming and going', 'Every month'];

  /* NOTHING FALLS DUE OR REPEATS: the box holds nothing drawn, so it is shut, and Every month with it. */
  let blocks = drawn(k, ours);
  assert.equal(every(blocks).drawn, false, 'Every month is drawn with nothing repeating');
  assert.equal(box(blocks).drawn, false, 'Coming and going is drawn over nothing');

  /* A COST EVERY MONTH AND MONEY IN EVERY QUARTER: the cells are each line's monthly share, a third of the quarter. */
  const line = (what: string, direction: string, amount: number, every: string) =>
    value(k.create('recurring', { what, direction, amount: gbp(amount), next_due: day(7), every, state: 'live' } as never, OWNER));
  line(`${COMPANIES[2]} hosting`, 'out', 4_500, 'monthly');
  line(`${COMPANIES[0]} retainer`, 'in', 300_000, 'quarterly');
  blocks = drawn(k, ours);
  assert.notEqual(box(blocks).drawn, false, 'Coming and going is shut with something repeating');
  assert.notEqual(every(blocks).drawn, false, 'Every month is not drawn with a cost repeating');
  const said = Object.fromEntries((every(blocks).readings ?? []).map((r) => [r.metric, r.reading?.value ?? null]));
  assert.deepEqual(said, { 'every-month-in': reading(k, 'every-month-in'), 'every-month-out': reading(k, 'every-month-out') });
  assert.deepEqual([said['every-month-in'], said['every-month-out']], [100_000, 4_500]);
});
