/**
 * Paths that reach further (PGS-B13): one step into a row's field, and a module's figure over the whole record.
 *
 * WHAT WAS MEASURED BEFORE IT: a path of three parts answered nothing, so `{{tasks#1.project.name}}` drew as words
 * nobody knows, and `{{portfolio.revenue}}` was read as a count of a list called portfolio in a state called revenue,
 * which no record has. His notes held 67 such placeholders.
 *
 * The order for two words is `twoOf`'s in `pages.ts`: a list and `count` or a state it holds; a figure and its part; a
 * module and its figure; then a list's state, which answers nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type MetricDecl } from '../src/index.ts';
import { readBlock, registersOfBlock, type PageBlock, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const OWNER = { actor: 'p_1' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/* TWO MODULES, as a fresh founder record has them: Projects, whose lists name `pack: portfolio`, and Work. */
const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    pack: 'portfolio',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'revenue', type: 'money' },
      { id: 'parent', type: 'ref', to: 'things' },
      { id: 'note', type: 'document' },
    ],
  },
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    pack: 'work',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'project', type: 'ref', to: 'things' },
      { id: 'cost', type: 'money' },
      { id: 'tags', type: 'list', of: 'text' },
      { id: 'notes', type: 'document' },
    ],
  },
};

const figure = (metric: string, source: string, value: Record<string, unknown>, more: Record<string, unknown> = {}): Declaration => ({
  id: `metric.${metric}`,
  kind: 'metric',
  body: { metric, name: metric, source: `register.${source}`, value, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none', ...more } as never,
});

const EARNING = figure('projects-earning', 'things', { sum: 'revenue' }, { format: 'money', window: '12m' });
const LIVE = figure('portfolio-live', 'things', { count: 'name' });
const OPEN = figure('open-tasks', 'tasks', { count: 'what' }, { where: 'state is open' });

/* A PAGE OF THE WORK MODULE, which says what the Projects module earns. */
const DESK: Declaration = {
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', pack: 'work', requires: ['register.tasks'], blocks: [{ kind: 'note', body: 'The projects earned {{portfolio.revenue}}.' }] } as never,
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([PROJECTS, TASKS, EARNING, LIVE, OPEN, DESK]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const kiln = k.create('things', { name: 'Kiln', revenue: gbp(1_840_000) }, OWNER);
  assert.ok(kiln.ok, JSON.stringify(kiln));
  assert.ok(k.create('things', { name: 'Portage', revenue: gbp(160_000), parent: kiln.value.id }, OWNER).ok);
  const task = k.create('tasks', { what: 'Settle the licence', project: kiln.value.id, cost: gbp(12_500), tags: ['legal', 'type'], notes: 'A long paragraph.' }, OWNER);
  assert.ok(task.ok, JSON.stringify(task));
  assert.ok(k.create('tasks', { what: 'Wire the domain', state: 'done' }, OWNER).ok);
  return k;
}

type Read = { values?: Record<string, unknown>; unnamed?: string[] };
const note = (k: Kernel, body: string): Read => k.block({ kind: 'note', body } as never) as Read;

test('ONE STEP THROUGH A LINK: the task’s project is named, and the step goes no further', async () => {
  const k = await record();
  const read = note(k, '{{tasks#1.project.name}} {{things#2.parent.name}} {{things#2.parent.parent}} {{tasks#2.project.name}}');
  assert.deepEqual(read.values, { 'tasks#1.project.name': 'Kiln', 'things#2.parent.name': 'Kiln' });
  /* A link on the far row is not followed, and a task with no project has nothing to step into but is named. */
  assert.deepEqual(read.unnamed, ['things#2.parent.parent'], 'a second link is a step too far, and is the author’s words');
});

test('A MONEY’S amount AND currency, AND A LIST FIELD’S count, one step into the row', async () => {
  const k = await record();
  const read = note(k, '{{tasks#1.cost.amount}} {{tasks#1.cost.currency}} {{tasks#1.tags.count}} {{tasks#2.tags.count}} {{tasks#1.cost.total}}');
  assert.deepEqual(read.values, { 'tasks#1.cost.amount': 12_500, 'tasks#1.cost.currency': 'GBP', 'tasks#1.tags.count': 2, 'tasks#2.tags.count': 0 });
  assert.deepEqual(read.unnamed, ['tasks#1.cost.total'], 'a money has an amount and a currency and nothing else');
});

test('A LONG FIELD IS STILL REFUSED, A FOURTH PART IS NOTHING, AND A ROW NOBODY HAS IS NOTHING', async () => {
  const k = await record();
  const read = note(k, '{{tasks#1.notes.count}} {{tasks#1.project.note}} {{tasks#1.project.name.count}} {{tasks#9.project.name}}');
  assert.equal(read.values, undefined, 'none of these is read');
  assert.deepEqual(read.unnamed, ['tasks#1.notes.count', 'tasks#1.project.note', 'tasks#1.project.name.count', 'tasks#9.project.name']);
});

test('A MODULE’S FIGURE ON ANOTHER MODULE’S PAGE: the Work page says what the Projects module earns', async () => {
  const k = await record();
  const page = k.page('desk');
  assert.ok(page.ok, JSON.stringify(page));
  const block = page.value.blocks[0] as Read;
  assert.deepEqual(block.values, { 'portfolio.revenue': gbp(2_000_000) }, 'the one figure that totals revenue');
  assert.equal(block.unnamed, undefined);
  /* By its id, by its id less the module's word, and a Work figure by its own id. */
  const more = note(k, '{{portfolio.projects-earning}} {{portfolio.live}} {{work.open-tasks}}');
  assert.deepEqual(more.values, { 'portfolio.projects-earning': gbp(2_000_000), 'portfolio.live': 2, 'work.open-tasks': 1 });
});

test('AN UNKNOWN MODULE OR A FIGURE ITS MODULE DOES NOT DECLARE ANSWERS NOTHING', async () => {
  const k = await record();
  const read = note(k, '{{shelf.revenue}} {{portfolio.revnue}} {{work.revenue}} {{portfolio.open-tasks}}');
  assert.equal(read.values, undefined);
  assert.deepEqual(read.unnamed, ['shelf.revenue', 'portfolio.revnue', 'work.revenue', 'portfolio.open-tasks'], 'a Work figure is not the Projects module’s');
});

test('EVERY TWO-WORD PATH READS AS BEFORE: a count, a state, a figure’s part, and a state nobody holds', async () => {
  const k = await record();
  const read = note(k, '{{tasks.count}} {{tasks.open}} {{tasks.done}} {{tasks#1.what}} {{open-tasks.first}} {{open-tasks.more}} {{tasks.opne}} {{tasks#1.notes}}');
  assert.deepEqual(read.values, { 'tasks.count': 2, 'tasks.open': 1, 'tasks.done': 1, 'tasks#1.what': 'Settle the licence', 'open-tasks.first': 'Settle the licence', 'open-tasks.more': 0 });
  assert.deepEqual(read.unnamed, ['tasks.opne']);
});

test('A LIST WINS OVER A MODULE OF THE SAME NAME for a state it holds, and the module answers the rest', async () => {
  const k = await record();
  const installed = await k.install([figure('tasks-done', 'tasks', { count: 'what' }, { where: 'state is done', pack: 'tasks' }), figure('tasks-cost', 'tasks', { sum: 'cost' }, { format: 'money', pack: 'tasks' })]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const read = note(k, '{{tasks.done}} {{tasks.cost}}');
  /* `tasks.done` is the list's count of done rows (rule 1), not the module's figure; `tasks.cost` is the figure. */
  assert.deepEqual(read.values, { 'tasks.done': 1, 'tasks.cost': gbp(12_500) });
});

/* ── a reader held from a list ───────────────────────────────────────────── */

const FIGURES: readonly MetricDecl[] = [EARNING, LIVE, OPEN].map((d) => d.body as unknown as MetricDecl);

function depsFor(k: Kernel, reads: (list: string) => boolean): PageDeps {
  const schemaOf = k.schemaOf;
  return {
    pages: () => [],
    metric: (id) => FIGURES.find((f) => f.metric === id) ?? null,
    read: (decl) => k.metric(decl),
    list: (q) =>
      k.list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.order?.length ? { order: q.order } : {}) }),
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf, reads },
    lists: () => [...k.registers().values()],
    metrics: () => FIGURES,
  };
}

test('A CLOSED LIST’S ROW IS NOT READ THROUGH A LINK, and a block with the path names that list', async () => {
  const k = await record();
  const block: PageBlock = { kind: 'note', body: '{{tasks#1.project.name}} {{tasks#1.cost.amount}} {{portfolio.revenue}}' } as never;
  const held = readBlock(depsFor(k, (list) => list !== 'things'), block) as Read;
  assert.deepEqual(held.values, { 'tasks#1.cost.amount': 12_500 }, 'the task is read, the project it points at is not');
  assert.equal(held.unnamed, undefined, 'what the reader may not open is named and draws its dash');
  const open = readBlock(depsFor(k, () => true), block) as Read;
  assert.deepEqual(open.values, { 'tasks#1.project.name': 'Kiln', 'tasks#1.cost.amount': 12_500, 'portfolio.revenue': gbp(2_000_000) });
  const deps = depsFor(k, () => true);
  assert.deepEqual(registersOfBlock(block, deps.metric, { lists: deps.lists!, metrics: deps.metrics! }).sort(), ['tasks', 'things']);
});

test('AN ADD-ON WHOSE BODIES NAME NO pack: IS FOUND BY THE PACK IT WAS INSTALLED WITH (packOf)', async () => {
  const k = await record();
  /* The pack is the declaration's own envelope, as an add-on's file installs it; the body says nothing of it. */
  const tally: Declaration = { ...figure('shelf-tasks', 'tasks', { count: 'what' }), pack: 'shelf' };
  assert.equal((tally.body as { pack?: unknown }).pack, undefined);
  const installed = await k.install([tally]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const read = note(k, '{{shelf.shelf-tasks}} {{shelf.tasks}}');
  assert.deepEqual(read.values, { 'shelf.shelf-tasks': 2, 'shelf.tasks': 2 }, 'by its id, and by its id less the add-on’s word');
  assert.equal(read.unnamed, undefined);
});
