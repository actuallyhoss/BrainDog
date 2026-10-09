/**
 * The holding pen's block and column items on `boot`.
 *
 * WHAT IS HELD: a page that draws a list without the block its shape asks for is offered that block, appended after
 * everything already on the page, as the page's whole declaration, and the declaration passes the lint accepting it
 * would meet; one page is offered one item at a time, so keeping one never takes another away; a dismissal hands the
 * next one forward; a field filled on at least 80% of at least 20 rows is offered to the page's first table; a list too
 * short for a line or a column is offered neither; and a page that takes a parameter is left alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type Boot, type CallContext, type PenItem } from '../src/index.ts';
import { PEN_COLUMN_ROWS_FEWEST, PEN_LINES_ROWS_FEWEST } from '../src/emergent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'name',
    state: 'status',
    done: ['done'],
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'due', type: 'day', deadline: true },
      { id: 'status', type: 'enum', values: ['todo', 'doing', 'review', 'done'], default: 'todo' },
      { id: 'hours', type: 'int' },
      { id: 'logged', type: 'day', index: true },
      { id: 'client', type: 'text' },
    ],
  },
} as never;

const TABLE = { kind: 'table', source: 'register.jobs', columns: [{ field: 'name', label: 'Name' }], empty: 'No jobs yet.' };
const page = (slug: string, blocks: unknown[]): Declaration => ({ id: `page.${slug}`, kind: 'page', body: { page: slug, title: 'Jobs', blocks } }) as never;

async function withJobs(rows: number, pages: Declaration[] = [page('jobs', [TABLE])]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([JOBS, ...pages]));
  for (let i = 0; i < rows; i++) {
    const day = `2026-09-${String((i % 28) + 1).padStart(2, '0')}`;
    value(api.kernel.create('jobs', { name: `Job ${i + 1}`, due: day, hours: i + 1, logged: day, client: 'Acme' }, { actor: 'p_1' }));
  }
  return api;
}

type Api = Awaited<ReturnType<typeof withJobs>>;
const penOf = async (api: Api): Promise<PenItem[]> => value<Boot>(await api.boot(owner)).pen.filter((item) => item.kind !== 'page');
const asDecl = (item: PenItem): Declaration => ({ id: item.change.to.id, kind: 'page', body: item.change.to.body }) as never;
const blocksOf = (item: PenItem): { kind: string; columns?: { field: string }[] }[] => item.change.to.body.blocks as never;

test('A PAGE DRAWING A LIST WITHOUT ITS CALENDAR IS OFFERED ONE, appended whole after what the page already holds', async () => {
  const api = await withJobs(PEN_COLUMN_ROWS_FEWEST + 4);
  const pen = await penOf(api);
  assert.equal(pen.length, 1, 'one page is offered one item at a time');
  const [item] = pen as [PenItem];
  assert.equal(item.id, 'block:jobs:calendar:jobs');
  assert.equal(item.kind, 'block');
  assert.equal(item.register, 'jobs');
  assert.equal(item.change.to.id, 'page.jobs');
  const blocks = blocksOf(item);
  assert.deepEqual(blocks[0], TABLE, 'the table the person wrote is not moved or changed');
  assert.deepEqual(blocks[1], {
    kind: 'calendar',
    heading: 'Jobs',
    source: 'register.jobs',
    columns: [{ field: 'name' }, { field: 'due' }],
    empty: 'Nothing in Jobs falls in these months.',
  });
  assert.match(item.why, /^Jobs puts a day on its entries in Due, and Jobs has no calendar of them\.$/u);
  assert.equal(api.kernel.lint([asDecl(item)]), null);
});

test('A DISMISSAL HANDS THE NEXT FORWARD: the board, then the lines, then the column people fill', async () => {
  const api = await withJobs(PEN_COLUMN_ROWS_FEWEST + 4);
  const dismissed: string[] = [];
  const walk: string[] = [];
  for (;;) {
    const pen = await penOf(api);
    if (pen.length === 0) break;
    const item = pen[0]!;
    assert.equal(api.kernel.lint([asDecl(item)]), null, `${item.id} would be refused on accepting`);
    walk.push(item.id);
    dismissed.push(item.id);
    value(await api.setPref({ key: 'pen.dismissed', value: dismissed }, owner));
  }
  assert.deepEqual(walk.slice(0, 4), ['block:jobs:calendar:jobs', 'block:jobs:board:jobs', 'block:jobs:lines:jobs', 'column:jobs:0:due']);
  assert.ok(walk.every((id) => !id.startsWith('block:jobs:gallery') && !id.startsWith('block:jobs:steps')), 'no picture and no steps: were asked for');
});

test('THE BOARD DRAWS THE STATE AND THE TITLE; THE LINES A NUMBER OVER ITS RECORDED DAY, never the day it is due', async () => {
  const api = await withJobs(PEN_COLUMN_ROWS_FEWEST);
  value(await api.setPref({ key: 'pen.dismissed', value: ['block:jobs:calendar:jobs'] }, owner));
  const board = (await penOf(api))[0]!;
  assert.deepEqual(blocksOf(board).at(-1)?.columns, [{ field: 'status' }, { field: 'name' }]);
  value(await api.setPref({ key: 'pen.dismissed', value: ['block:jobs:calendar:jobs', 'block:jobs:board:jobs'] }, owner));
  const lines = (await penOf(api))[0]!;
  assert.equal(lines.id, 'block:jobs:lines:jobs');
  assert.deepEqual(blocksOf(lines).at(-1)?.columns, [{ field: 'logged' }, { field: 'hours' }]);
});

test('THE COLUMN IS ADDED TO THE FIRST TABLE AS ITS LAST, and a table naming no columns is left to its projection', async () => {
  const api = await withJobs(PEN_COLUMN_ROWS_FEWEST, [page('jobs', [TABLE, { ...TABLE, heading: 'Again' }])]);
  value(await api.setPref({ key: 'pen.dismissed', value: ['block:jobs:calendar:jobs', 'block:jobs:board:jobs', 'block:jobs:lines:jobs'] }, owner));
  const column = (await penOf(api))[0]!;
  assert.equal(column.kind, 'column');
  assert.equal(column.id, 'column:jobs:0:due');
  const blocks = blocksOf(column);
  assert.deepEqual(blocks[0]?.columns, [...TABLE.columns, { field: 'due', label: 'Due' }]);
  assert.deepEqual(blocks[1], { ...TABLE, heading: 'Again' }, 'only the first table over the list is offered the column');
  assert.match(column.why, /^Due is filled on 100% of the 20 entries in Jobs, and the table on Jobs does not show it\.$/u);

  const bare = await withJobs(PEN_COLUMN_ROWS_FEWEST, [page('jobs', [{ kind: 'table', source: 'register.jobs', empty: 'No jobs yet.' }])]);
  value(await bare.setPref({ key: 'pen.dismissed', value: ['block:jobs:calendar:jobs', 'block:jobs:board:jobs', 'block:jobs:lines:jobs'] }, owner));
  assert.deepEqual(await penOf(bare), []);
});

test('A LIST TOO SHORT FOR A LINE OR A COLUMN IS OFFERED NEITHER, and a page that takes a parameter nothing', async () => {
  const api = await withJobs(PEN_LINES_ROWS_FEWEST - 1);
  const seen: string[] = [];
  const dismissed: string[] = [];
  for (let pen = await penOf(api); pen.length > 0; pen = await penOf(api)) {
    seen.push(pen[0]!.id);
    dismissed.push(pen[0]!.id);
    value(await api.setPref({ key: 'pen.dismissed', value: dismissed }, owner));
  }
  assert.deepEqual(seen, ['block:jobs:calendar:jobs', 'block:jobs:board:jobs']);

  const one = await withJobs(PEN_COLUMN_ROWS_FEWEST, [page('job', [{ ...TABLE, where: 'name is {{it}}' }])]);
  assert.deepEqual(await penOf(one), []);
});
