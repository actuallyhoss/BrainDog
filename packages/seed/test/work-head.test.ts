/**
 * Work's head, and the open work that belongs to no project (work 1.19.0; PGS-A14's done-when).
 *
 * Work opened on its line and the capture line, with no count beside its name, no Add and nowhere to search, and an
 * open task typed in a hurry with no project was on no list that said so: the Board drew it with a dash under Project.
 *
 * WHAT THIS HOLDS, on a fresh record with the five modules and none of the example rows, so every task is one this file
 * wrote: the page declares a head the kernel's own check passes; the read answers its count, its Add and its search
 * word; `tasks-no-project` counts the open tasks whose project is empty and With no project lists exactly those, newest
 * first; with none, neither it nor its fold is drawn; and the page still shows at most six tiles before its fold. The
 * narrowing the search word does is the page read's (page-narrows-101), so only the declaration is held here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Kernel, PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { headerFault } from '../../kernel/src/page-head.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';

import { FIRST_PARTY, METRICS, NOW, PAGES, firstPartyDocument } from '../src/index.ts';
import { WITH_NO_PROJECT } from '../src/modules/work.ts';

type Refusal = { code: string; fix: string; at?: string };
type Out<T> = { ok: boolean; value?: T; refusal?: Refusal };
const value = <T>(r: unknown, doing: string): T => {
  const x = r as Out<T>;
  assert.ok(x.ok, x.ok ? '' : `${doing}: ${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A fresh record: the five modules by the road an install takes from the app, with no example rows. */
async function fresh(): Promise<{ k: Kernel; clock: ReturnType<typeof fixedClock>; close(): void }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, answersSlash: true });
  for (const id of FIRST_PARTY) {
    const doc = { ...(firstPartyDocument(id) as Record<string, unknown>), seeds: [] };
    const planned = value<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner), `planning ${id}`);
    value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner), `installing ${id}`);
  }
  return { k: api.kernel, clock, close: () => sql.close() };
}

type Head = { count?: { value: number; said: string }; action?: { verb: string; label: string }; search?: { param: string } };
/** Work as its owner reads it: the Add is cut to the reader's level, and a read that names none is a read. */
const work = (k: Kernel): PageResult & { head?: Head } => {
  const out = k.page('work', undefined, { level: 'owner' });
  assert.ok(out.ok, sayOf(out));
  return out.value as PageResult & { head?: Head };
};

type Declared = { kind: string; heading?: string; lead?: boolean; fold?: boolean; when?: { metric: string }; where?: string; area?: string };
const declared = (): Declared[] => (PAGES.work as unknown as { blocks: Declared[] }).blocks;

const figure = (k: Kernel, id: string): unknown => {
  const out = k.metric(METRICS[id] as never);
  assert.ok(out.ok, sayOf(out));
  return out.value.value;
};

/** A project, with whatever its list makes every project say, so the test names none of Projects' own fields. */
function project(k: Kernel, name: string): string {
  const stored = (k.declarations() as unknown as { id: string; body: string }[]).find((d) => d.id === 'register.things');
  assert.ok(stored, 'the record holds no projects');
  const list = JSON.parse(stored.body) as { title: string; fields: { id: string; type: string; required?: boolean; values?: string[] }[] };
  const fields: Record<string, unknown> = { [list.title]: name };
  for (const f of list.fields) if (f.required === true && f.id !== list.title && f.type === 'enum') fields[f.id] = f.values![0];
  return value<{ id: string }>(k.create('things', fields as never, { actor: 'p_1' }), `adding ${name}`).id;
}

/* NO SEARCH WORD (proj F10): "Search this page" floated between the name and the line with
   no field round it, and the frame's own search is one press away. The head is the count and Add. */
test('WORK DECLARES A HEAD: its open count and one Add, no search word, and the kernel’s own check passes it', () => {
  const header = (PAGES.work as { header?: unknown }).header;
  assert.deepEqual(header, { count: { metric: 'open-tasks' }, action: { verb: 'row.create', label: 'Add' } });
  assert.equal(headerFault(header, { figures: new Set(Object.keys(METRICS)), fields: null }), null);
  /* THE COUNT IS WORK'S OWN FIGURE, called Open, and counts what the rail counts: open work, kept for later left out. */
  assert.equal((METRICS['open-tasks'] as { name?: string }).name, 'Open');
  assert.equal((METRICS['open-tasks'] as { where?: string }).where, 'state is not backlog or done or dropped');
});

test('ON A FRESH RECORD THE HEAD IS ANSWERED: the count and Add for its owner, and no search word', async () => {
  const { k, close } = await fresh();
  try {
    const page = work(k);
    for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} refused on a fresh record`);
    assert.deepEqual(page.head?.count?.value, 0);
    assert.equal(page.head?.search, undefined);
    assert.deepEqual([page.head?.action?.verb, page.head?.action?.label], ['row.create', 'Add']);
    /* AND A READER WHO MAY ONLY READ IS SHOWN NO ADD, with the count and the search left as they are. */
    const reader = k.page('work');
    assert.ok(reader.ok, sayOf(reader));
    const head = (reader.value as { head?: Head }).head;
    assert.deepEqual([head?.action, head?.search, head?.count?.value], [undefined, undefined, 0]);
    value(k.create('tasks', { what: 'Mend the gate latch' }, { actor: 'p_1' }), 'adding a task');
    assert.equal(work(k).head?.count?.value, 1, 'the head does not count the task just added');
  } finally {
    close();
  }
});

test('TWO OPEN TASKS WITH NO PROJECT AND ONE WITH ONE: the figure says two, and With no project lists those two, newest first', async () => {
  const { k, clock, close } = await fresh();
  try {
    const kiln = project(k, 'Glaze kiln');
    value(k.create('tasks', { what: 'Order more clay', by: '2026-09-10' }, { actor: 'p_1' }), 'the older task with no project');
    clock.advance(60_000);
    value(k.create('tasks', { what: 'Fire the test tiles', thing: kiln }, { actor: 'p_1' }), 'the task with a project');
    clock.advance(60_000);
    value(k.create('tasks', { what: 'Ring the plumber' }, { actor: 'p_1' }), 'the newer task with no project');
    /* AND WORK THAT IS NOT OPEN IS NOT COUNTED: one finished and one kept for later, both with no project. */
    value(k.create('tasks', { what: 'Sweep the yard', state: 'done' }, { actor: 'p_1' }), 'a finished task');
    value(k.create('tasks', { what: 'Paint the shed', state: 'backlog' }, { actor: 'p_1' }), 'a task kept for later');

    assert.equal(figure(k, 'tasks-no-project'), 2);
    const page = work(k);
    const tile = page.blocks.find((b) => b.heading === 'With no project');
    assert.ok(tile, 'Work draws no With no project');
    assert.deepEqual(tile.refusals, []);
    assert.notEqual((tile as { drawn?: boolean }).drawn, false, 'With no project is not drawn while two tasks have no project');
    assert.deepEqual(tile.rows.map((r) => r.fields.what), ['Ring the plumber', 'Order more clay']);
    /* EACH WITH ITS DUE DAY, and nothing else of the task. */
    assert.deepEqual((tile as { columns?: { field: string }[] }).columns?.map((c) => c.field), ['what', 'by']);
    const fold = page.blocks.find((b) => b.heading === 'Needs a project');
    assert.ok(fold && (fold as { drawn?: boolean }).drawn !== false, 'the fold over it is not drawn');
  } finally {
    close();
  }
});

test('WITH EVERY OPEN TASK IN A PROJECT, neither With no project nor its fold is drawn', async () => {
  const { k, close } = await fresh();
  try {
    const kiln = project(k, 'Glaze kiln');
    value(k.create('tasks', { what: 'Fire the test tiles', thing: kiln }, { actor: 'p_1' }), 'a task with a project');
    value(k.create('tasks', { what: 'Sweep the yard', state: 'done' }, { actor: 'p_1' }), 'a finished task with none');
    assert.equal(figure(k, 'tasks-no-project'), 0);
    const page = work(k);
    for (const heading of ['Needs a project', 'With no project']) {
      const b = page.blocks.find((x) => x.heading === heading);
      assert.ok(!b || (b as { drawn?: boolean }).drawn === false, `${heading} is drawn on a record whose every open task has a project`);
    }
  } finally {
    close();
  }
});

test('WITH NO PROJECT IS BELOW THE FOLD, in a fold of its own, and Work keeps at most six tiles before its first fold', () => {
  const blocks = declared();
  const at = blocks.findIndex((b) => b.heading === 'With no project');
  assert.ok(at > 0, 'Work declares no With no project');
  assert.deepEqual(blocks[at], { ...WITH_NO_PROJECT }, 'Work’s tile is not the one a Home can take');
  /* AND NO CLIENT, SINCE THE COMMIT THAT LET A TASK BE FOR A CLIENT ALONE: one for a client has a home. */
  assert.equal(WITH_NO_PROJECT.where, 'state is not backlog or done or dropped, thing is empty, client is empty', 'the tile and the figure ask different questions');
  assert.equal((METRICS['tasks-no-project'] as { where?: string }).where, WITH_NO_PROJECT.where);
  const over = blocks[at - 1]!;
  assert.deepEqual([over.kind, over.heading, over.fold, over.when], ['section', 'Needs a project', true, { metric: 'tasks-no-project', gt: 0 }]);
  /* COUNTED AS `calm-pages.test.ts` COUNTS: the lines are the page's sentence, and the capture line is the header's. */
  const main = blocks.filter((b) => b.area !== 'rail');
  const fold = main.findIndex((b) => b.kind === 'section' && b.fold === true);
  assert.ok(fold > 0 && fold < main.indexOf(blocks[at]!), 'With no project is above the fold');
  const above = main.slice(0, fold).filter((b) => !b.lead && b.kind !== 'capture' && b.kind !== 'section');
  assert.ok(above.length <= 6, `Work shows ${above.length} tiles before its fold: ${above.map((b) => b.heading ?? b.kind).join(', ')}`);
});
