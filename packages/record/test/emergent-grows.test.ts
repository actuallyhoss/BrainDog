/**
 * The offers a list earns by growing (`emergent-grows.ts`): a table over a long list is offered a grouping by its best
 * field, and a pile of open work is offered a page of its own.
 *
 * WHAT IS HELD: 299 tasks are offered no grouping and 300 are, by the choice filled on 9 in 10 of them, never by the one
 * with 13 values; keeping it writes the page with `group:` on that table and nothing else moved, and the record takes
 * it; a dismissed grouping is not offered again; nothing is offered before day 14 of a person's use. Open jobs: 12
 * standing open is no offer, 13 made four days ago is the page "Open Jobs" grouped by its state, and 13 made yesterday
 * is none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi } from '../src/index.ts';
import { GROUP_ROWS_FEWEST, OPEN_DAYS, OPEN_MOST, groupingsOffered, growsWeighed, openRowsOffered } from '../src/emergent-grows.ts';
import type { PenDeps, PenItem } from '../src/emergent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const BORN = Date.parse('2026-09-01T09:00:00Z');
const AREAS = ['Garden', 'Kitchen', 'Garage', 'Attic'];
const CODES = Array.from({ length: 13 }, (_, i) => `c${i + 1}`);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    one: 'task',
    fields: [
      { id: 'what', label: 'What', type: 'text', required: true },
      { id: 'area', label: 'Area', type: 'enum', values: AREAS },
      { id: 'code', label: 'Code', type: 'enum', values: CODES },
    ],
  },
} as unknown as Declaration;

const JOBS = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    state: 'status',
    done: ['done'],
    fields: [
      { id: 'what', label: 'What', type: 'text', required: true },
      { id: 'status', label: 'Status', type: 'enum', values: ['open', 'doing', 'done'], default: 'open', required: true },
    ],
  },
} as unknown as Declaration;

const MINE = {
  id: 'page.mine',
  kind: 'page',
  body: { page: 'mine', title: 'Mine', blocks: [{ kind: 'table', source: 'register.tasks', columns: [{ field: 'what', label: 'What' }], empty: 'No tasks yet.' }] },
} as unknown as Declaration;

/** A record made on `BORN`, its owner's first write that day, holding Tasks drawn on Mine, and Jobs. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(BORN);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([TASKS, JOBS, MINE]));
  value(api.kernel.create('jobs', { what: 'First job', status: 'done' }, { actor: 'p_owner' }));

  /** `n` tasks: the area on 9 in 10, and a code each of 13. */
  const tasks = (n: number): void => {
    for (let i = 0; i < n; i++)
      value(api.kernel.create('tasks', { what: `Task ${i + 1}`, ...(i % 10 === 9 ? {} : { area: AREAS[i % 4] }), code: CODES[i % 13] }, { actor: 'p_owner' }));
  };
  /** `n` open jobs, made on day `day`. */
  const jobs = (n: number, day: number): void => {
    clock.set(BORN + day * DAY);
    for (let i = 0; i < n; i++) value(api.kernel.create('jobs', { what: `Job ${i + 1}`, status: i % 2 === 0 ? 'open' : 'doing' }, { actor: 'p_owner' }));
  };
  const deps = (day: number, dismissed: readonly string[] = []): PenDeps => {
    const nowMs = BORN + day * DAY;
    clock.set(nowMs);
    return { kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set(dismissed), use: { sql, nowMs } };
  };
  return { api, tasks, jobs, deps };
}

const noIds = (item: PenItem): void => assert.doesNotMatch(`${item.title} ${item.why}`, /—|\brows?\b|ULID|#|register\./u);

test('299 TASKS ARE OFFERED NO GROUPING', async () => {
  const { tasks, deps } = await record();
  tasks(GROUP_ROWS_FEWEST - 1);
  assert.deepEqual(groupingsOffered(deps(15)), []);
});

test('300 TASKS ARE OFFERED A GROUPING BY THE AREA FILLED 9 IN 10, never by the code of 13 values, and the record takes it', async () => {
  const { api, tasks, deps } = await record();
  tasks(GROUP_ROWS_FEWEST);
  const offered = groupingsOffered(deps(15));
  assert.equal(offered.length, 1, 'one list is offered one grouping');
  const item = offered[0]!;
  assert.equal(item.id, 'block:mine:group:tasks');
  assert.equal(item.kind, 'block');
  assert.equal(item.register, 'tasks');
  assert.equal(item.title, 'Group Tasks by area?');
  assert.equal(item.why, '300 tasks, and 9 in 10 have an area. Grouped by it, the table on Mine reads as 4 headings, not one long table.');
  noIds(item);
  const body = item.change.to.body as { blocks: Record<string, unknown>[] };
  assert.equal(item.change.to.id, 'page.mine');
  assert.deepEqual(body.blocks, [{ ...(MINE.body as { blocks: object[] }).blocks[0], group: 'area' }], 'the table gained group and nothing else moved');
  value(await api.kernel.install([{ id: item.change.to.id, kind: 'page', body: item.change.to.body } as Declaration]));
  assert.deepEqual(groupingsOffered(deps(15)), [], 'a table already grouped is offered nothing more');

  const [weighed] = growsWeighed(offered);
  assert.equal(weighed?.key, item.id);
  assert.equal(weighed?.change.kind, 'block');
});

test('A DISMISSED GROUPING IS NOT OFFERED AGAIN', async () => {
  const { tasks, deps } = await record();
  tasks(GROUP_ROWS_FEWEST);
  assert.deepEqual(groupingsOffered(deps(15, ['block:mine:group:tasks'])), []);
});

test('NOTHING IS OFFERED BEFORE DAY 14 of a person using the record', async () => {
  const { tasks, jobs, deps } = await record();
  tasks(GROUP_ROWS_FEWEST);
  jobs(OPEN_MOST + 1, 0);
  assert.deepEqual(groupingsOffered(deps(13)), []);
  assert.deepEqual(openRowsOffered(deps(13)), []);
  assert.equal(groupingsOffered(deps(14)).length, 1);
  assert.equal(openRowsOffered(deps(14)).length, 1);
});

test('TWELVE JOBS STANDING OPEN ARE NO OFFER', async () => {
  const { jobs, deps } = await record();
  jobs(OPEN_MOST, 11);
  assert.deepEqual(openRowsOffered(deps(15)), []);
});

test('THIRTEEN JOBS OPEN FOUR DAYS ARE OFFERED A PAGE "Open Jobs", grouped by its state, that the record takes', async () => {
  const { api, jobs, deps } = await record();
  jobs(OPEN_MOST + 1, 11);
  const offered = openRowsOffered(deps(15));
  assert.equal(offered.length, 1);
  const item = offered[0]!;
  assert.equal(item.id, 'page:jobs:open');
  assert.equal(item.kind, 'page');
  assert.equal(item.list, 'jobs');
  assert.equal(item.title, 'Open Jobs');
  assert.equal(item.why, `13 jobs have stood open for ${OPEN_DAYS} days or more. Want a page of the open ones, by status?`);
  noIds(item);
  assert.deepEqual(item.draft, item.change.to);
  const table = (item.change.to.body as { blocks: Record<string, unknown>[] }).blocks[0]!;
  assert.equal(table.group, 'status');
  assert.deepEqual(table.where, { field: 'status', not_in: ['done'] });
  value(await api.kernel.install([{ id: item.change.to.id, kind: 'page', body: item.change.to.body } as Declaration]));
  assert.deepEqual(openRowsOffered(deps(15)), [], 'a list a page already draws cut by its state is not offered it twice');
});

test('THIRTEEN JOBS MADE YESTERDAY ARE NO OFFER, nor a dismissed one', async () => {
  const { jobs, deps } = await record();
  jobs(OPEN_MOST + 1, 14);
  assert.deepEqual(openRowsOffered(deps(15)), []);
  assert.equal(openRowsOffered(deps(18)).length, 1, 'three days on they have stood open long enough');
  assert.deepEqual(openRowsOffered(deps(18, ['page:jobs:open'])), []);
});

test('THE OPEN COUNT IS HELD ON ITS LIST: thirteen jobs all finished are offered nothing at once', async () => {
  const { api, jobs, deps } = await record();
  jobs(OPEN_MOST + 1, 11);
  const offers = () => openRowsOffered({ ...deps(15), held: api.kernel.heldFacts() });
  assert.equal(offers().length, 1);
  const rows = api.kernel.list({ register: 'jobs', limit: 100 });
  assert.ok(rows.ok);
  for (const row of rows.value.rows) assert.ok(api.kernel.update('jobs', row.id, { status: 'done' }, { actor: 'p_owner' }).ok);
  assert.deepEqual(offers(), [], 'finished jobs were still offered as open');
});

test('THE OPEN COUNT LEAVES OUT WHAT IS FINISHED, WHAT IS NEWER AND AN EXAMPLE, and counts a row with no state as open', async () => {
  const { api, deps } = await record();
  value(
    await api.kernel.install([
      {
        id: 'register.orders',
        kind: 'register',
        body: {
          id: 'orders',
          name: 'Orders',
          title: 'what',
          state: 'status',
          done: ['done'],
          fields: [
            { id: 'what', label: 'What', type: 'text', required: true },
            { id: 'status', label: 'Status', type: 'enum', values: ['open', 'done'] },
            { id: 'tags', label: 'Tags', type: 'list', of: 'text' },
          ],
        },
      } as unknown as Declaration,
    ]),
  );
  const make = (what: string, fields: Record<string, unknown>) => value(api.kernel.create('orders', { what, ...fields }, { actor: 'p_owner' }));
  deps(11);
  for (let i = 0; i < 11; i++) make(`Open ${i}`, { status: 'open', ...(i === 0 ? { tags: ['urgent'] } : {}) });
  make('No state', {});
  make('No state, tagged', { tags: ['urgent'] });
  make('Finished', { status: 'done' });
  make('An example', { status: 'open', tags: ['example'] });
  deps(14);
  make('Made lately', { status: 'open' });
  const offered = openRowsOffered({ ...deps(15), held: api.kernel.heldFacts() }).filter((o) => o.id === 'page:orders:open');
  assert.equal(offered.length, 1);
  assert.equal(offered[0]!.why, `13 orders have stood open for ${OPEN_DAYS} days or more. Want a page of the open ones, by status?`);
});
