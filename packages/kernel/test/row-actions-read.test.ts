/**
 * Declared actions on a page: a block says what may be pressed on it and on each of its rows, the install
 * admits both keys, and the read sends each reader only what that reader may press, each marked hard and undo.
 *
 * WHAT WAS MEASURED BEFORE IT: the verb table, the record's bindings and the drawer all existed, and a page carrying
 * `actions` or `row_actions` was refused at install as a key nobody reads, so no page could offer a press.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { actionsFault } from '../src/block-keys.ts';
import { readPage, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';
import { PROJECTS } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const OWNER = { actor: 'p_1' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  },
};

const TABLE = {
  kind: 'table',
  heading: 'Open work',
  source: 'register.tasks',
  columns: [{ field: 'what' }],
  actions: [{ verb: 'row.create', label: 'Add one' }],
  row_actions: [
    { verb: 'row.tick', label: 'Done' },
    { verb: 'row.delete', label: 'Remove', confirm: 'Remove this task?' },
  ],
};

const PAGE: Declaration = {
  id: 'page.work',
  kind: 'page',
  body: { page: 'work', title: 'Work', requires: ['register.tasks'], blocks: [TABLE] } as Declaration['body'],
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([TASKS, PAGE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const what of PROJECTS.slice(0, 2)) assert.ok(k.create('tasks', { what }, OWNER).ok);
  return k;
}

function depsOver(k: Kernel, blocks: readonly unknown[], more: Partial<PageDeps> = {}): PageDeps {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    return decl ? { register, fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) } : null;
  };
  return {
    pages: () => [{ page: 'work', title: 'Work', blocks: blocks as PageBlock[] }],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => {
      const out = k.list({ register: q.register, ...(q.limit ? { limit: q.limit } : {}) });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    ...more,
  };
}

const first = (deps: PageDeps): BlockResult => {
  const read = readPage(deps, 'work');
  assert.ok(read.ok, JSON.stringify(read));
  return read.value.blocks[0]!;
};

test('A PAGE DECLARING ACTIONS INSTALLS, and a writer is sent all three, the delete marked hard', async () => {
  const k = await record();
  const table = first(depsOver(k, [TABLE], { level: 'write' }));
  assert.deepEqual(table.refusals, []);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.actions, [{ verb: 'row.create', label: 'Add one', hard: false, undo: true }]);
  assert.deepEqual(
    table.row_actions?.map((a) => [a.verb, a.hard]),
    [
      ['row.tick', false],
      ['row.delete', true],
    ],
  );
  assert.equal(table.row_actions?.[1]?.confirm, 'Remove this task?');
});

test('A READER AT READ IS SENT NOTHING TO PRESS, and neither is one whose level was never said', async () => {
  const k = await record();
  for (const more of [{ level: 'read' }, {}] as Partial<PageDeps>[]) {
    const table = first(depsOver(k, [TABLE], more));
    assert.deepEqual(table.refusals, []);
    assert.equal(table.actions, undefined);
    assert.equal(table.row_actions, undefined);
    assert.equal(table.rows.length, 2, 'the rows are still read');
  }
  /* The record's own read hands no level, so its page carries nothing to press either. */
  const own = k.page('work');
  assert.ok(own.ok, JSON.stringify(own));
  assert.equal(own.value.blocks[0]?.actions, undefined);
  assert.equal(own.value.blocks[0]?.row_actions, undefined);
});

test('A BLOCK VERB UNDER row_actions AND A ROW VERB UNDER actions ARE REFUSED, each with where it goes', () => {
  const onRows = actionsFault({ row_actions: [{ verb: 'row.create', label: 'Add one' }] }, 'This table', null);
  assert.equal(onRows?.at, 'row_actions[0].verb');
  assert.match(onRows?.fix ?? '', /acts on no row, so it goes under actions, not row_actions/u);
  assert.ok(!(onRows?.allowed ?? []).includes('row.create'));

  const onBlock = actionsFault({ actions: [{ verb: 'row.tick', label: 'Done' }] }, 'This table', null);
  assert.equal(onBlock?.at, 'actions[0].verb');
  assert.match(onBlock?.fix ?? '', /acts on one row, so it goes under row_actions, not actions/u);

  assert.equal(actionsFault(TABLE, 'This table', null), null);
  /* And the install admits both keys on a table, and row_actions on no kind that draws no rows. */
  assert.equal(validateDeclaration(PAGE), null);
  const onStat = validateDeclaration({ ...PAGE, body: { ...(PAGE.body as object), blocks: [{ kind: 'note', body: 'Said.', row_actions: TABLE.row_actions }] } as Declaration['body'] });
  assert.equal(onStat?.at, 'blocks[0].row_actions');
});

test('AN ARG NAMING NO FIELD OF THE LIST IS REFUSED AT READ, and the block carries nothing to press', async () => {
  const k = await record();
  const moved = { ...TABLE, row_actions: [{ verb: 'row.move', label: 'Move', args: { field: 'colour' } }] };
  /* Where the fields are not known, the shape alone is checked, and it is a good shape. */
  assert.equal(actionsFault(moved, 'This table', null), null);
  const table = first(depsOver(k, [moved], { level: 'owner' }));
  assert.equal(table.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(table.refusals[0]?.at, 'row_actions[0].args.field');
  assert.match(table.refusals[0]?.fix ?? '', /"colour", which is not a field this block's list holds/u);
  assert.deepEqual([...(table.refusals[0]?.allowed ?? [])].sort(), ['state', 'what']);
  assert.equal(table.actions, undefined);
  assert.equal(table.row_actions, undefined);
  /* Named by a field the list holds, the same move is sent. */
  const good = first(depsOver(k, [{ ...moved, row_actions: [{ verb: 'row.move', label: 'Move', args: { field: 'state' } }] }], { level: 'owner' }));
  assert.deepEqual(good.refusals, []);
  assert.deepEqual(good.row_actions?.[0]?.args, { field: 'state' });
});

test('A VERB THE HOST DOES NOT RUN YET IS NOT SENT', async () => {
  const k = await record();
  const table = first(depsOver(k, [TABLE], { level: 'owner', runs: new Set(['row.tick', 'row.delete']) }));
  assert.equal(table.actions, undefined);
  assert.deepEqual(table.row_actions?.map((a) => a.verb), ['row.tick', 'row.delete']);
});
