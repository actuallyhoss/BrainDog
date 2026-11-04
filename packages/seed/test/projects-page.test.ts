/**
 * Projects says where every project stands (batch 101): by lane, how many are in play and earning over time,
 * and how they are going only once somebody has said.
 *
 * BEFORE: `projects-by-lane` was declared and drawn by nothing, the nightly saves of In play were read by no cell on the
 * page, and How they are going drew one grey bar of Not said yet on a record where no project had a health. Now a
 * split Where they are draws past four projects in play, a strip says In play and Earning with the line of their
 * nights, and the health split waits for a project that says how it is going.
 *
 * ON A FRESH RECORD, with the lists and pages installed and none of the sample's rows, so every count here is the
 * test's own. The projects are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, declarations, ingestDeclarations, metricDeclarations, pageDeclarations } from '../src/index.ts';
import { PORTFOLIO_PAGES } from '../src/modules/portfolio.ts';

const PERSON = { actor: 'p_1' };
const DAY = 86_400_000;

type Drawn = PageResult['blocks'][number] & {
  drawn?: boolean;
  lead?: boolean;
  box?: boolean;
  fold?: boolean;
  area?: string;
  readings?: { metric: string; label?: string; reading: { value: unknown; groups?: { key: string; value: number; label?: string }[] } | null; trend?: (number | null)[] }[];
};

type Record_ = { k: Kernel; sql: ReturnType<typeof openSqlite>; night: () => Promise<void> };

/** A record with Projects and its pages and no rows, on a clock the test moves a night at a time. */
async function fresh(): Promise<Record_> {
  let now = NOW;
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => now });
  const out = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations(), ...ingestDeclarations()]);
  assert.ok(out.ok, sayOf(out));
  return {
    k,
    sql,
    night: async () => {
      now += DAY;
      await k.drain();
    },
  };
}

/** A project, answered as the record names it, `things#3`. */
const add = (k: Kernel, name: string, lane: string, more: Record<string, unknown> = {}): string => {
  const made = k.create('things', { name, lane, ...more } as never, PERSON);
  assert.ok(made.ok, `${name}: ${sayOf(made)}`);
  return `things#${made.value.seq}`;
};

/** Five in play over Building and Earning, and one parked: three lanes. */
const SIX: readonly [string, string][] = [
  ['Bindery', 'building'],
  ['Lantern', 'building'],
  ['Saltmarsh', 'building'],
  ['Quill', 'earning'],
  ['Orchard', 'earning'],
  ['Harbour', 'parked'],
];

const projects = (k: Kernel): Drawn[] => {
  const out = k.page('portfolio');
  assert.ok(out.ok, sayOf(out));
  const blocks = out.value.blocks as Drawn[];
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${String(b.heading ?? b.kind)}: ${JSON.stringify(b.refusals)}`);
  return blocks;
};

const headed = (blocks: Drawn[], heading: string): Drawn => {
  const found = blocks.filter((b) => b.heading === heading);
  assert.equal(found.length, 1, `${found.length} blocks are headed ${heading}`);
  return found[0]!;
};

const drawn = (b: Drawn): boolean => b.drawn !== false;

test('THE BOARD HOLDS EVERY PROJECT, the finished too, and no bar of lanes is drawn over it', async () => {
  const { k } = await fresh();
  for (const [name, lane] of SIX) add(k, name, lane);
  add(k, 'Kestrel', 'retired');
  const page = projects(k);
  /* SINCE portfolio 1.30.0 the board's date line says how many are in play, parked and finished, where a split said it. */
  assert.equal(page.filter((b) => b.heading === 'Where they are').length, 0, 'the bar of lanes is drawn again');
  const board = page.filter((b) => (b as { key?: unknown }).key === 'board');
  assert.equal(board.length, 1, `${board.length} blocks are the board`);
  assert.ok(drawn(board[0]!), 'the board is not drawn over five projects in play');
  assert.equal(board[0]!.kind, 'cards');
  const names = ((board[0]!.rows ?? []) as unknown as { fields: Record<string, unknown> }[]).map((r) => String(r.fields.name)).sort();
  assert.deepEqual(names, ['Bindery', 'Harbour', 'Kestrel', 'Lantern', 'Orchard', 'Quill', 'Saltmarsh']);
});

test('THREE PROJECTS ARE THE BOARD, and a record with only finished ones still draws it', async () => {
  const { k } = await fresh();
  for (const [name, lane] of SIX.slice(2, 5)) add(k, name, lane);
  assert.ok(drawn(headed(projects(k), 'In play')), 'the board is not drawn');
  const done = await fresh();
  add(done.k, 'Kestrel', 'retired');
  assert.ok(drawn(headed(projects(done.k), 'In play')), 'the board is not drawn over a finished project');
});

/* NO SPLIT AT ALL SINCE portfolio 1.31.2 (fdc1b185b): how a project is going is said on its own card, once it says, and a bar said it again. */
test('NO HEALTH SPLIT, WITH HEALTH SET OR NOT, and the first project that says how it is going carries it on its card', async () => {
  const { k } = await fresh();
  const made = SIX.map(([name, lane]) => add(k, name, lane));
  assert.ok(!projects(k).some((b) => b.heading === 'How they are going'), 'a split of Not said yet is drawn');
  const set = k.update('things', made[3]!, { health: 'at_risk' } as never, PERSON);
  assert.ok(set.ok, sayOf(set));
  assert.ok(!projects(k).some((b) => b.heading === 'How they are going'), 'a split is drawn once a project says how it is going');
  const said = (headed(projects(k), 'In play') as unknown as { rows: { fields: Record<string, unknown> }[] }).rows.filter((r) => r.fields.health === 'at_risk');
  assert.equal(said.length, 1, 'the card of the project that said it does not say it');
});

test('NO STRIP SAYS IN PLAY AND EARNING, and the record still saves the two nights', async () => {
  const { k, sql, night } = await fresh();
  for (const [name, lane] of SIX) add(k, name, lane);
  /* CUT IN BATCH 6: a whole row saying "In play 5, Earning 2" over a line that says it. The figures and their nights stay. */
  assert.equal(projects(k).filter((b) => b.heading === 'In play and earning').length, 0, 'the strip is drawn again');
  for (let n = 0; n < 3; n++) await night();
  for (const metric of ['projects-live', 'projects-lane-earning']) {
    const saved = sql.all<{ value: number }>("SELECT value FROM metric_point WHERE series = ? AND grain = 'day' ORDER BY at", metric).map((p) => p.value);
    assert.ok(saved.length >= 3, `${metric} has ${saved.length} saved nights after three`);
  }
});

test('WITH NOTHING IN PLAY THERE IS NO STRIP, and no line of the page says In play as a figure', async () => {
  const { k } = await fresh();
  add(k, 'Harbour', 'parked');
  const page = projects(k);
  assert.equal(page.filter((b) => b.heading === 'In play and earning').length, 0, 'a strip of noughts is drawn');
  /* A FIGURE IS SAID ONCE, and the page's own line is where. */
  const lines = (PORTFOLIO_PAGES.portfolio!.blocks as unknown as { lead?: boolean; body?: string }[]).filter((b) => b.lead === true);
  for (const line of lines) assert.doesNotMatch(String(line.body), /\{\{projects-live\}\}/u, `the line says In play again: ${line.body}`);
});

test('SIX TILES AT MOST BEFORE THE FOLD, drawn on a record with every one of them standing', async () => {
  const { k, night } = await fresh();
  for (const [name, lane] of SIX) add(k, name, lane, lane === 'parked' ? {} : { health: 'on_track', revenue: { amount: 120_000, currency: 'GBP' } });
  await night();
  const page = projects(k).filter((b) => drawn(b) && b.area !== 'rail');
  const fold = page.findIndex((b) => b.kind === 'section' && b.fold === true);
  let boxed = false;
  const above = (fold < 0 ? page : page.slice(0, fold)).filter((b) => {
    if (b.kind === 'section') return (boxed = b.box === true);
    return !boxed && b.lead !== true;
  });
  assert.ok(above.length <= 6, `${above.length} tiles before the fold: ${above.map((b) => b.heading ?? b.kind).join(', ')}`);
  assert.ok(above.some((b) => b.heading === 'In play'), 'In play is not before the fold');
});
