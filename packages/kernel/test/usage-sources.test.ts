/**
 * One month's use reads the same everywhere it is counted (SHL-C12 jobs 1 and 3): the `actions` read, a project's "Runs
 * on" and the three `usage.*` sources a usage page is declared over.
 *
 * ON A REAL RECORD: two projects, three scheduled actions, and every run written by the meter itself (`meter`) on the day
 * it ran, so each answer below comes through the record's own wiring (`k.block`) from the same events.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { meter } from '../src/actions.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import type { PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const OWNER = { actor: 'p_1' };
const COUNTS = ['runs', 'requests', 'bytes', 'failures', 'held'] as const;

const poll = (ingest: string, project: string): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: { ingest, channel: 'poll', url: `https://api.example.test/v1/${ingest}`, every: '1d', grant: 'example read', extract: { what: { after: 'say ' } }, writes: { register: 'notes' }, project } as never,
});

const SEED: Declaration[] = [
  { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never },
  { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text' }] } as never },
  poll('glaze-feed', 'things#1'),
  poll('clay-prices', 'things#1'),
  poll('crate-tracking', 'things#2'),
  /* A USAGE PAGE IS A DECLARATION over the three sources, and nothing else. */
  {
    id: 'page.usage',
    kind: 'page',
    body: {
      page: 'usage',
      title: 'Usage',
      blocks: [
        { kind: 'series', heading: 'By day', source: 'usage.days' },
        { kind: 'table', heading: 'By project', source: 'usage.projects' },
        { kind: 'cards', heading: 'By action', source: 'usage.actions' },
      ],
    } as never,
  },
];

/** The month: glaze-feed runs three days and fails once, clay-prices runs once and is held once, crate-tracking never runs. */
async function month(): Promise<{ k: Kernel; close: () => void }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install(SEED);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('things', { name: 'Kiln' }, OWNER).ok);
  assert.ok(k.create('things', { name: 'Portage' }, OWNER).ok);
  let n = 0;
  const run = (day: number, ingest: string, project: string, outcome: 'ok' | 'failed' | 'held', requests: number, bytes: number, failures = 0): void => {
    const deps = { sql, mint: () => `ev_${String((n += 1))}`, nowMs: Date.UTC(2026, 9, day, 9) };
    meter(deps, { ingest, channel: 'poll', host: 'api.example.test', project, status: outcome === 'ok' ? 200 : null, outcome, requests, bytes, ms: 40, failures }, `${ingest} ran.`);
  };
  run(3, 'glaze-feed', 'things#1', 'ok', 2, 1_000);
  run(10, 'glaze-feed', 'things#1', 'ok', 1, 500);
  run(15, 'glaze-feed', 'things#1', 'failed', 1, 0, 1);
  run(10, 'clay-prices', 'things#1', 'ok', 3, 2_000);
  /* HELD: the plan's limit sent nothing, so the call it would have made is no request. */
  run(12, 'clay-prices', 'things#1', 'held', 5, 0);
  return { k, close: () => sql.close() };
}

const read = (k: Kernel, block: PageBlock) => {
  const out = k.block(block);
  assert.deepEqual(out.refusals, [], `${String(block.source)}: ${JSON.stringify(out.refusals)}`);
  return out;
};
const counts = (r: Entry) => Object.fromEntries(COUNTS.map((c) => [c, r.fields[c]]));
const sum = (rows: readonly Entry[], field: string): number => rows.reduce((t, r) => t + Number(r.fields[field] ?? 0), 0);
const named = (rows: readonly Entry[], name: string): Entry => rows.find((r) => r.fields.name === name || r.fields.ingest === name)!;

const EXPECTED = {
  'glaze-feed': { runs: 2, requests: 3, bytes: 1_500, failures: 1, held: 0 },
  'clay-prices': { runs: 1, requests: 3, bytes: 2_000, failures: 0, held: 1 },
  'crate-tracking': { runs: 0, requests: 0, bytes: 0, failures: 0, held: 0 },
};

test('EACH ACTION READS ITS MONTH THE SAME on the actions list, on its project\'s Runs on and on usage.actions', async () => {
  const { k, close } = await month();
  const listed = read(k, { kind: 'table', source: 'actions' }).rows;
  const used = read(k, { kind: 'table', source: 'usage.actions' }).rows;
  const runsOn = [...read(k, { kind: 'table', source: 'runs_on', about: 'things#1' }).rows, ...read(k, { kind: 'table', source: 'runs_on', about: 'things#2' }).rows];
  for (const [name, want] of Object.entries(EXPECTED)) {
    assert.deepEqual(counts(named(listed, name)), want, `actions: ${name}`);
    assert.deepEqual(counts(named(used, name)), want, `usage.actions: ${name}`);
    assert.deepEqual(counts(named(runsOn, name)), want, `runs_on: ${name}`);
  }
  /* BY NAME, NEVER BY ID: the action is its name, and where it runs is the project's. */
  assert.deepEqual(
    used.map((r) => [r.fields.name, r.fields.project, r.fields.spoken]),
    [
      ['clay-prices', 'Kiln', 'things#1'],
      ['crate-tracking', 'Portage', 'things#2'],
      ['glaze-feed', 'Kiln', 'things#1'],
    ],
  );
  close();
});

test('THE SUMS AGREE TO THE UNIT across actions, runs_on, usage.actions, usage.projects and usage.days', async () => {
  const { k, close } = await month();
  const listed = read(k, { kind: 'table', source: 'actions' }).rows;
  const actions = read(k, { kind: 'table', source: 'usage.actions' }).rows;
  const projects = read(k, { kind: 'table', source: 'usage.projects' }).rows;
  const runsOn = [...read(k, { kind: 'table', source: 'runs_on', about: 'things#1', where: 'kind is action' }).rows, ...read(k, { kind: 'table', source: 'runs_on', about: 'things#2', where: 'kind is action' }).rows];
  for (const c of COUNTS) {
    const want = Object.values(EXPECTED).reduce((t, e) => t + e[c], 0);
    assert.equal(sum(listed, c), want, `actions ${c}`);
    assert.equal(sum(actions, c), want, `usage.actions ${c}`);
    assert.equal(sum(projects, c), want, `usage.projects ${c}`);
    assert.equal(sum(runsOn, c), want, `runs_on ${c}`);
  }
  assert.deepEqual(
    projects.map((r) => [r.fields.name, r.fields.spoken, r.fields.actions, counts(r)]),
    [
      ['Kiln', 'things#1', 2, { runs: 3, requests: 6, bytes: 3_500, failures: 1, held: 1 }],
      ['Portage', 'things#2', 1, { runs: 0, requests: 0, bytes: 0, failures: 0, held: 0 }],
    ],
  );
  /* THE DAYS ADD UP TO THE SAME MONTH, and each day is the day its runs were on. */
  const days = read(k, { kind: 'series', source: 'usage.days' });
  assert.equal(days.rows.length, 15, 'the first of the month to today');
  assert.equal(sum(days.rows, 'runs'), sum(actions, 'runs'));
  assert.equal(sum(days.rows, 'requests'), sum(actions, 'requests'));
  const on = (day: string) => days.rows.find((r) => r.fields.day === day)!.fields;
  assert.deepEqual([on('2026-10-03'), on('2026-10-10'), on('2026-10-12'), on('2026-10-15')], [
    { day: '2026-10-03', runs: 1, requests: 2 },
    { day: '2026-10-10', runs: 2, requests: 4 },
    { day: '2026-10-12', runs: 0, requests: 0 },
    { day: '2026-10-15', runs: 0, requests: 0 },
  ]);
  close();
});

test('AN ACTION WITH NO RUNS READS ZEROS, never a missing count, everywhere it is read', async () => {
  const { k, close } = await month();
  const zeros = EXPECTED['crate-tracking'];
  for (const block of [
    { kind: 'table', source: 'actions' },
    { kind: 'table', source: 'usage.actions' },
    { kind: 'table', source: 'runs_on', about: 'things#2' },
  ] as PageBlock[]) {
    const row = named(read(k, block).rows, 'crate-tracking');
    for (const c of COUNTS) assert.ok(Object.hasOwn(row.fields, c), `${String(block.source)} has ${c}`);
    assert.deepEqual(counts(row), zeros, String(block.source));
  }
  /* A KEY, A TOOL OR A SKILL IS NO ACTION, so it has nothing in the counts rather than a zero it never earned. */
  close();
});

test('A HELD CALL COUNTS IN held AND NOT IN requests, on every source', async () => {
  const { k, close } = await month();
  const held = (rows: readonly Entry[]) => counts(named(rows, 'clay-prices'));
  for (const source of ['actions', 'usage.actions'])
    assert.deepEqual(held(read(k, { kind: 'table', source } as PageBlock).rows), EXPECTED['clay-prices'], source);
  assert.deepEqual(held(read(k, { kind: 'table', source: 'runs_on', about: 'things#1' }).rows), EXPECTED['clay-prices']);
  const kiln = named(read(k, { kind: 'table', source: 'usage.projects' }).rows, 'Kiln');
  assert.deepEqual([kiln.fields.held, kiln.fields.requests], [1, 6], 'the five requests the held call would have made are in no count');
  const day = read(k, { kind: 'series', source: 'usage.days' }).rows.find((r) => r.fields.day === '2026-10-12')!;
  assert.deepEqual([day.fields.runs, day.fields.requests], [0, 0]);
  close();
});

test('usage.days IS A SERIES a series block draws: one bar a day, a line of runs and one of requests, today partial', async () => {
  const { k, close } = await month();
  const { bars, rows } = read(k, { kind: 'series', source: 'usage.days' });
  assert.ok(bars);
  assert.equal(bars.bucket, 'day');
  assert.equal(bars.current, '2026-10-15');
  assert.deepEqual(bars.keys, rows.map((r) => r.fields.day));
  assert.deepEqual(bars.states.filter((s) => s !== ''), ['partial']);
  assert.equal(bars.states.at(-1), 'partial');
  assert.deepEqual(bars.values, [rows.map((r) => r.fields.runs), rows.map((r) => r.fields.requests)]);
  assert.equal(bars.unit, null);
  close();
});

test('A where: NARROWS, and an order: or a field none of them holds is refused rather than ignored', async () => {
  const { k, close } = await month();
  assert.deepEqual(read(k, { kind: 'table', source: 'usage.actions', where: 'project is Portage' }).rows.map((r) => r.fields.name), ['crate-tracking']);
  assert.deepEqual(read(k, { kind: 'table', source: 'usage.days', where: 'runs is not 0' }).rows.map((r) => r.fields.day), ['2026-10-03', '2026-10-10']);
  const codes = (block: PageBlock) => k.block(block).refusals.map((r) => r.code);
  assert.deepEqual(codes({ kind: 'table', source: 'usage.projects', order: [{ field: 'runs', dir: 'desc' }] } as PageBlock), ['DECLARATION_INVALID']);
  assert.deepEqual(codes({ kind: 'table', source: 'usage.actions', columns: [{ field: 'secret' }] } as PageBlock), ['FIELD_UNKNOWN']);
  close();
});

test('A USAGE PAGE IS A DECLARATION: a page of the three draws with no refusal and says the same month', async () => {
  const { k, close } = await month();
  type Drawn = { heading?: string; rows: Entry[]; bars?: { values: number[][] }; refusals?: unknown[] };
  const page = k.page('usage') as { ok: boolean; value?: { blocks: Drawn[] } };
  assert.ok(page.ok, JSON.stringify(page));
  const blocks = Object.fromEntries(page.value!.blocks.map((b) => [String(b.heading), b]));
  for (const b of Object.values(blocks)) assert.deepEqual(b.refusals ?? [], [], String(b.heading));
  const runs = sum(blocks['By action']!.rows, 'runs');
  assert.equal(runs, 3);
  assert.equal(sum(blocks['By project']!.rows, 'runs'), runs);
  assert.equal(blocks['By day']!.bars!.values[0]!.reduce((t, v) => t + v, 0), runs);
  close();
});
