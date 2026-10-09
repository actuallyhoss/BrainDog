/**
 * WHAT A PAGE PRINTS (PGS-B02 job a): a path that names nothing, and a cell from a computed source.
 *
 * A path the record knows and holds nothing for draws `—`. A path that names no figure, list, row, field or value is the
 * author's words, and the answer says so in `unnamed`, so a host draws it as written and marked rather than as a number
 * still to come. 48 paths on the owner's record drew a dash for a typo.
 *
 * And a computed source answers its fields' types beside its rows, `used_by` as a run, with the run's agent beside it, so
 * "Tools and servers" stops printing `2026-10-06T19:07:01.610Z` and `S731`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

/* `pages.ts` FIRST, as `signs-page.test.ts` does, so the kernel's modules load in the order the record loads them. */
import { readBlock, registersOfBlock, type PageBlock, type PageDeps } from '../src/pages.ts';
import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'done'], required: true },
    ],
  } as never,
};

const OPEN_TASKS: Declaration = {
  id: 'metric.open-tasks',
  kind: 'metric',
  body: { metric: 'open-tasks', name: 'Open tasks', source: 'register.tasks', where: 'state is open', value: { count: 'what' }, format: 'int', target: { lte: 9 }, window: '30d' } as never,
};

const pageOf = (body: string): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.tasks'], blocks: [{ kind: 'note', body }] } as never,
});

async function blockOf(body: string): Promise<Record<string, unknown>> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([TASKS, OPEN_TASKS, pageOf(body)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('tasks', { what: 'Ship it', state: 'open' }, { actor: 'p_1' }).ok);
  const out = k.page('desk');
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
  return (out.value as unknown as { blocks: Record<string, unknown>[] }).blocks[0]!;
}

test('A PATH THAT NAMES NOTHING IS UNNAMED, and one that names something with no value is not', async () => {
  const block = await blockOf(
    [
      '{{open-tasks}}', // a figure with a value
      '{{tasks#1.note}}', // a field the row holds nothing in: named, a dash
      '{{tasks.done}}', // a state with no rows: named, nought
      '{{runs-working}}', // a built-in figure
      '{{portfolio.revnue}}', // no such list
      '{{tasks.opne}}', // no such state
      '{{tasks#9.what}}', // no such row
      '{{tasks#1.colour}}', // no such field
      '{{no-such-figure}}', // no such figure
      '{{a.b.c}}', // a path no grammar reads
    ].join(' '),
  );
  assert.deepEqual(block.unnamed, ['portfolio.revnue', 'tasks.opne', 'tasks#9.what', 'tasks#1.colour', 'no-such-figure', 'a.b.c']);
  const values = block.values as Record<string, unknown>;
  assert.equal(values['open-tasks'], 1);
  assert.ok(!Object.hasOwn(values, 'tasks#1.note'), 'a field with nothing in it has no value');
});

test('a block whose every path names something says nothing unnamed', async () => {
  const block = await blockOf('{{open-tasks}} of {{tasks.count}}, {{tasks#1.note}}');
  assert.equal(block.unnamed, undefined);
});

test('a figure’s rows and change name the figure; a list called the same with no such state does not', async () => {
  const block = await blockOf('{{open-tasks.first}} {{open-tasks.change}} {{tasks.change}} {{nothing.first}}');
  assert.deepEqual(block.unnamed, ['tasks.change', 'nothing.first']);
});

/* ── a computed source's types ───────────────────────────────────────────── */

const at = '2026-10-06T19:07:01.610Z';
const entry = (register: string, seq: number, fields: Record<string, unknown>): Entry =>
  ({ id: `${register}-${seq}`, register, seq, fields, state: 'active', version: 1, created_at: at, updated_at: at, deleted_at: null }) as unknown as Entry;

const PROJECT = entry('things', 1, { name: 'BrainDog' });
const TOOL = entry('tools', 4, { name: 'Wrangler', transport: 'stdio', seen: at });
/* As a run is stored: the kind of agent, and the client it said it was. */
const RUN = entry('session', 731, { agent: 'claude', client: 'claude-code' });

function runsOnDeps(sessionReadable = true): PageDeps {
  const schema = (register: string) =>
    register === 'tools'
      ? { register, fields: { name: { type: 'text' }, transport: { type: 'text' }, seen: { type: 'instant' } } }
      : register === 'things'
        ? { register, fields: { name: { type: 'text' } } }
        : null;
  return {
    pages: () => [],
    metric: () => null,
    read: () => ok(null as never),
    list: (q) =>
      q.register === 'things'
        ? ok({ rows: [PROJECT], matched: 1 })
        : q.register === 'session' && sessionReadable
          ? ok({ rows: [RUN], matched: 1 })
          : ok({ rows: [], matched: 0 }),
    schemaOf: schema as PageDeps['schemaOf'],
    titleOf: () => 'name',
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    scopeOf: (register) => (register === 'tools' ? { field: 'project', to: 'things' } : null),
    inScope: () => ok({ rows: [TOOL], inherited: [] }),
    history: () => ok([{ ts: at, actor: 'S731', field: 'seen', from: null, to: at }] as never),
  };
}

const RUNS_ON: PageBlock = { kind: 'table', source: 'runs_on', about: 'things#1', columns: [{ field: 'name' }, { field: 'used_by' }, { field: 'used_at' }] } as PageBlock;

test('RUNS_ON ANSWERS ITS TYPES: an instant is an instant and the run that used it is a run, with its agent beside it', () => {
  const read = readBlock(runsOnDeps(), RUNS_ON);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.types?.used_by, 'run');
  assert.equal(read.types?.used_at, 'instant');
  assert.equal(read.types?.name, 'text');
  const row = read.rows[0]!.fields;
  assert.equal(row.used_by, 'S731', 'the run stays a handle the host links by');
  assert.equal(row.used_agent, 'Claude Code', 'and its agent is the name a person reads');
});

test('a run the caller cannot read names no agent, and the handle is never the only word', () => {
  const read = readBlock(runsOnDeps(false), RUNS_ON);
  assert.equal(read.rows[0]!.fields.used_agent, null);
  assert.equal(read.types?.used_by, 'run');
});

test('runs_on names the runs it says the agent of', () => {
  assert.ok(registersOfBlock(RUNS_ON).includes('session'));
});

/* ── a field on this row (`05 §7.1`) ─────────────────────────────────────── */

test('ON A PAGE PER ROW, A FIELD THE ROW HOLDS NOTHING IN IS NAMED: it draws its dash, and only a word no field is stays unnamed', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const perTask: Declaration = {
    id: 'page.task',
    kind: 'page',
    body: { page: 'task', title: '{{what}}', for: { register: 'tasks' }, requires: ['register.tasks'], blocks: [{ kind: 'note', body: 'Note: {{note}}, {{nonsense}}' }] } as never,
  };
  assert.ok((await k.install([TASKS, perTask])).ok);
  assert.ok(k.create('tasks', { what: 'Ship it', state: 'open' }, { actor: 'p_1' }).ok);
  const out = k.page('ship-it');
  assert.ok(out.ok, JSON.stringify(out));
  const block = (out.value as unknown as { blocks: Record<string, unknown>[] }).blocks[0]!;
  assert.deepEqual(block.unnamed, ['nonsense']);
  sql.close();
});
