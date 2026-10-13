/**
 * A `calendar` over `source: deadlines`: every list's deadlines on the days they fall, in the calendar's months.
 *
 * ON A REAL RECORD, two lists holding deadlines and one holding none, read through the record's own `list`. The kind is
 * asked as `pages.ts` asks a registered kind (its `validate` at read, then its `read` with the kit), because a source
 * that says `first` is still answered before any kind until `pages.ts` reads `across`. The last test goes through the
 * record's own `block` and waits on that line by itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { calendar } from '../src/kinds/calendar.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { predicateOf } from '../src/metrics.ts';
import { registersOfBlock, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const OWNER = { actor: 'p_1' };

const list = (id: string, name: string, fields: Record<string, unknown>[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields, ...more } as never,
});

const LISTS: Declaration[] = [
  list(
    'tasks',
    'Tasks',
    [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', deadline: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
    { state: 'state', done: ['done'] },
  ),
  list('bills', 'Bills', [
    { id: 'what', type: 'text', required: true },
    { id: 'due', type: 'day', required: true, deadline: true },
  ]),
  list('notes', 'Notes', [{ id: 'what', type: 'text' }, { id: 'on', type: 'day' }]),
];

/** September and October 2026, read on the 15th of September. */
const BLOCK = { kind: 'calendar', source: 'deadlines', columns: [{ field: 'title' }, { field: 'day' }], back: 0, ahead: 1 } as PageBlock;

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install(LISTS);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (register: string, fields: Record<string, unknown>): void => {
    const out = k.create(register, fields, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
  };
  made('tasks', { what: 'Fire the bowls', due: '2026-09-18' });
  made('tasks', { what: 'Order clay', due: '2026-09-10' });
  made('tasks', { what: 'Glaze the lids', due: '2026-10-03', state: 'done' });
  made('tasks', { what: 'Renew the domain', due: '2027-03-01' });
  made('tasks', { what: 'Sweep the studio' });
  made('bills', { what: 'Rent', due: '2026-09-25' });
  made('bills', { what: 'Glaze', due: '2026-10-03' });
  made('bills', { what: 'Last month', due: '2026-08-31' });
  made('notes', { what: 'A day that is no deadline', on: '2026-09-18' });
  return k;
}

/** The record's reads as a page is handed them, and the kit `pages.ts` hands a registered kind. */
function depsOver(k: Kernel, reads?: (list: string) => boolean): PageDeps {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    if (!decl) return null;
    return { register, ...(decl.state === undefined ? {} : { state: decl.state }), fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) };
  };
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => {
      const out = k.list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.order?.length ? { order: q.order } : {}) });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    lists: () => [...k.registers().values()],
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf, ...(reads ? { reads } : {}) },
    kit: { predicateOf, today: () => new Date(NOW).toISOString().slice(0, 10) },
  } as PageDeps;
}

function read(k: Kernel, block: PageBlock, reads?: (list: string) => boolean): BlockResult {
  const base = { ...block, rows: [], matched: 0, refusals: [] } as BlockResult;
  const fault = calendar.validate?.(block, { stage: 'read' }) ?? null;
  return fault ? { ...base, refusals: [fault] } : calendar.read(depsOver(k, reads), block, base);
}

const drawn = (out: BlockResult): string[] => (out.rows ?? []).map((r) => `${String(r.fields.day)} ${String(r.fields.title)} (${String(r.fields.row)})`);

test('THE MONTHS CARRY BOTH LISTS ON THEIR DAYS, by day, and a finished row and a day outside the months are not drawn', async () => {
  const k = await record();
  const out = read(k, BLOCK);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.window, { from: '2026-09-01', to: '2026-10-31', today: '2026-09-15' });
  assert.deepEqual(drawn(out), [
    '2026-09-10 Order clay (tasks#2)',
    '2026-09-18 Fire the bowls (tasks#1)',
    '2026-09-25 Rent (bills#1)',
    '2026-10-03 Glaze (bills#2)',
  ]);
  assert.equal(out.matched, 4);
  /* EACH ROW IS THE SOURCE'S SHAPE, so a host opens it where it lives: the list, the spoken id, and the row's state. */
  const first = out.rows![0]!;
  assert.equal(first.register, 'deadlines');
  assert.equal(first.fields.list, 'tasks');
  assert.equal(first.state, 'open');
  /* FINISHED, AND NOT MERELY OUTSIDE: the lids fall on a day the months hold, beside a bill that is drawn. */
  assert.ok(!drawn(out).some((line) => line.includes('Glaze the lids')));
  assert.ok(!drawn(out).some((line) => line.includes('A day that is no deadline')));
});

test('THE MONTHS ARE THE CALENDAR\'S OWN: back: reaches a month a table\'s horizon never names', async () => {
  const k = await record();
  const out = read(k, { ...BLOCK, back: 1, ahead: 0 } as PageBlock);
  assert.deepEqual(out.window, { from: '2026-08-01', to: '2026-09-30', today: '2026-09-15' });
  assert.deepEqual(drawn(out), ['2026-08-31 Last month (bills#3)', '2026-09-10 Order clay (tasks#2)', '2026-09-18 Fire the bowls (tasks#1)', '2026-09-25 Rent (bills#1)']);
});

test('A READER WHO MAY NOT READ A LIST SEES NONE OF ITS ROWS, and the block names every list it reads across', async () => {
  const k = await record();
  const out = read(k, BLOCK, (l) => l !== 'bills');
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(drawn(out), ['2026-09-10 Order clay (tasks#2)', '2026-09-18 Fire the bowls (tasks#1)']);
  assert.equal(out.matched, 2);
  assert.deepEqual(drawn(read(k, BLOCK, () => false)), []);
  /* AND WITH NO READER SAID, the record holds the block from anybody who may not read both (`acrossLists`). */
  const beside = { lists: () => [...k.registers().values()] };
  assert.deepEqual(registersOfBlock(BLOCK, undefined, beside).sort(), ['bills', 'tasks']);
});

test('where: NARROWS BY THE SOURCE\'S OWN WORDS, as a table over deadlines does', async () => {
  const k = await record();
  assert.deepEqual(drawn(read(k, { ...BLOCK, where: 'list is bills' } as PageBlock)), ['2026-09-25 Rent (bills#1)', '2026-10-03 Glaze (bills#2)']);
  const bad = read(k, { ...BLOCK, where: 'amount is 5' } as PageBlock);
  assert.equal(bad.refusals.length, 1);
  assert.deepEqual(bad.rows, []);
});

test('WHAT IT CANNOT DRAW IS REFUSED IN ITS OWN SENTENCE, at install as at read', async () => {
  const k = await record();
  const said = (more: Record<string, unknown>): string => read(k, { ...BLOCK, ...more } as PageBlock).refusals[0]?.fix ?? '';
  assert.equal(said({ columns: [{ field: 'what' }, { field: 'due' }] }), 'A calendar over deadlines names two columns, what falls due and its day, as columns: [title, day].');
  assert.equal(said({ columns: undefined }), 'A calendar over deadlines names two columns, what falls due and its day, as columns: [title, day].');
  /* AN ID IS NO TITLE: `row` would draw `tasks#2` on a day and `list` the list's id, where a person reads a name. */
  for (const first of ['row', 'list'])
    assert.equal(said({ columns: [{ field: first }, { field: 'day' }] }), 'A calendar over deadlines names two columns, what falls due and its day, as columns: [title, day].');
  assert.equal(said({ order: [{ field: 'day', dir: 'desc' }] }), 'A calendar over deadlines comes by day, so it takes no order:.');
  assert.match(said({ horizon: 30 }), /does nothing with horizon:/u);
  assert.match(said({ limit: 5 }), /takes no limit:/u);
  assert.match(said({ authored: [{ cells: ['Rent', '2026-10-01'] }] }), /does both/u);
  /* AND THE INSTALL ASKS THE SAME MODULE: the page with the block goes in, and one with a list's own columns does not. */
  const page = (id: string, block: Record<string, unknown>): Declaration => ({ id: `page.${id}`, kind: 'page', body: { page: id, title: 'Due', blocks: [block] } as never });
  const good = await k.install([page('due', BLOCK as never)]);
  assert.ok(good.ok, JSON.stringify(good));
  const wrong = await k.install([page('due-wrong', { ...BLOCK, columns: [{ field: 'what' }, { field: 'due' }] })]);
  assert.ok(!wrong.ok);
});

test('THROUGH THE RECORD\'S OWN block: pages.ts asks the kind before the source, so the page gets the calendar\'s months', async () => {
  const k = await record();
  const out = k.block(BLOCK);
  assert.deepEqual(out.refusals, []);
  /* THE WINDOW IS THE PROOF: the source's own answer is a table's days ahead and holds none. */
  assert.deepEqual(out.window, read(k, BLOCK as PageBlock).window);
  assert.notEqual(out.window, undefined);
  assert.deepEqual(drawn(out), ['2026-09-10 Order clay (tasks#2)', '2026-09-18 Fire the bowls (tasks#1)', '2026-09-25 Rent (bills#1)', '2026-10-03 Glaze (bills#2)']);
});
