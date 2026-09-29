/**
 * The page sources a module's pages read across the lists (`pages.ts`): `deadlines`, `figures.home`, and `list` on the
 * rows of `activity` and `governance.open`.
 *
 * THE DEPS ARE WIRED HERE FROM THE RECORD'S PUBLIC READS, with the two the kernel's own `pageDeps` gains beside them
 * (`lists` and `metrics`), so every row below comes from a real record's lists and every order from its read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from './index.ts';
import type { MetricDecl } from './metrics.ts';
import { readBlock, registersOfBlock, type ActivityEvent, type PageBlock, type PageDecl, type PageDeps, type QueueQuestion } from './pages.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';

/* TODAY IS 25 SEPTEMBER 2026 in UTC, so fourteen days ahead is 9 October. */
const NOW = Date.UTC(2026, 8, 25, 12);
const OWNER = { actor: 'p_1' };

const list = (id: string, title: string, fields: unknown[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title, fields, ...more } as never,
});

const TASKS = list(
  'tasks',
  'what',
  [
    { id: 'what', type: 'text', required: true },
    { id: 'by', type: 'day', deadline: true },
    { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
  ],
  { state: 'state', done: ['done'] },
);
const SERVICES = list(
  'services',
  'name',
  [
    { id: 'name', type: 'text', required: true },
    { id: 'renews', type: 'day', deadline: true },
    { id: 'cost', type: 'money' },
    { id: 'state', type: 'enum', values: ['live', 'cancelled'], default: 'live' },
  ],
  { state: 'state', done: ['cancelled'] },
);
const BILLS = list(
  'bills',
  'what',
  [
    { id: 'what', type: 'text', required: true },
    { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'] },
    { id: 'amount', type: 'money' },
    { id: 'due', type: 'day', deadline: true },
  ],
);
const RECURRING = list(
  'recurring',
  'what',
  [
    { id: 'what', type: 'text', required: true },
    { id: 'direction', type: 'enum', values: ['in', 'out'] },
    { id: 'amount', type: 'money' },
    { id: 'next_due', type: 'day', deadline: true },
  ],
);
/* A DAY THAT IS NOT A DEADLINE: something that happened, which falls due never. */
const DIARY = list('diary', 'body', [
  { id: 'body', type: 'text', required: true },
  { id: 'on', type: 'day' },
]);

/** A cash walk over Bills that says which way its money goes, as a money page's forecast does. */
const CASH: PageDecl = {
  page: 'cash',
  title: 'Cash',
  blocks: [{ kind: 'forecast', source: 'forecast.runway', from: [{ register: 'bills', on: 'due', amount: 'amount', incoming: { field: 'direction', is: 'owed_to_me' } }] }],
};

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([TASKS, SERVICES, BILLS, RECURRING, DIARY]));
  value(k.create('tasks', { what: 'Send the deck', by: '2026-09-20' }, OWNER));
  value(k.create('tasks', { what: 'Book the hall', by: '2026-09-30' }, OWNER));
  value(k.create('tasks', { what: 'Finished already', by: '2026-09-22', state: 'done' }, OWNER));
  value(k.create('tasks', { what: 'Plan the winter', by: '2026-12-01' }, OWNER));
  value(k.create('services', { name: 'example.org', renews: '2026-10-05', cost: { amount: 1_200, currency: 'GBP' } }, OWNER));
  value(k.create('services', { name: 'gone.org', renews: '2026-09-27', state: 'cancelled' }, OWNER));
  value(k.create('bills', { what: 'Invoice 7', direction: 'owed_to_me', amount: { amount: 50_000, currency: 'GBP' }, due: '2026-10-02' }, OWNER));
  value(k.create('recurring', { what: 'Rent', direction: 'out', amount: { amount: 90_000, currency: 'GBP' }, next_due: '2026-10-01' }, OWNER));
  value(k.create('diary', { body: 'A walk', on: '2026-09-26' }, OWNER));
  return k;
}

/** A figure's declaration as a pack writes it, `home:` and `sellable:` among its keys. */
const figure = (metric: string, more: Record<string, unknown> = {}): MetricDecl =>
  ({ metric, name: `The ${metric}`, source: 'register.tasks', value: { count: 'what' }, ...more }) as MetricDecl;

function depsOver(k: Kernel, figures: readonly MetricDecl[] = [], more: Partial<PageDeps> = {}): PageDeps {
  const schemaOf = k.schemaOf;
  return {
    pages: () => [CASH],
    metric: (id) => figures.find((f) => f.metric === id) ?? null,
    read: (decl) => k.metric(decl),
    list: (q) => {
      const out = k.list({
        register: q.register,
        ...(q.where ? { where: q.where } : {}),
        ...(q.limit ? { limit: q.limit } : {}),
        ...(q.order?.length ? { order: q.order } : {}),
      });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    lists: () => [...k.registers().values()],
    metrics: () => figures,
    ...more,
  };
}

const DUE: PageBlock = { kind: 'table', source: 'deadlines', empty: 'Nothing is due.' };

test('DEADLINES ARE EVERY LIST’S ROWS DUE WITHIN THE HORIZON, overdue first, done rows and other days left out', async () => {
  const k = await record();
  const out = readBlock(depsOver(k), DUE);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(
    out.rows.map((r) => [r.fields.row, r.fields.day]),
    [
      ['tasks#1', '2026-09-20'],
      ['tasks#2', '2026-09-30'],
      ['recurring#1', '2026-10-01'],
      ['bills#1', '2026-10-02'],
      ['services#1', '2026-10-05'],
    ],
    'a done task, a cancelled service, a task past the horizon and a diary day are not due',
  );
  assert.equal(out.matched, 5);
  assert.deepEqual(out.rows[0]?.fields, { list: 'tasks', row: 'tasks#1', title: 'Send the deck', day: '2026-09-20', amount: null, direction: null });
});

test('WHICH WAY A DEADLINE’S MONEY GOES IS WHAT THE RECORD DECLARES, never a guess', async () => {
  const k = await record();
  const by = new Map(readBlock(depsOver(k), DUE).rows.map((r) => [r.fields.row, r.fields] as const));
  /* THE WALK'S LEG SAYS WHICH VALUE IS MONEY ARRIVING. */
  assert.deepEqual([by.get('bills#1')?.amount, by.get('bills#1')?.direction], [{ amount: 50_000, currency: 'GBP' }, 'in']);
  /* AN ENUM OF EXACTLY `in` AND `out` SAYS IT ON A LIST NO WALK READS. */
  assert.equal(by.get('recurring#1')?.direction, 'out');
  /* ONE MONEY FIELD AND NOTHING THAT SAYS WHICH WAY: the amount, and no way. */
  assert.deepEqual([by.get('services#1')?.amount, by.get('services#1')?.direction], [{ amount: 1_200, currency: 'GBP' }, null]);
});

test('DEADLINES NARROW BY LIST, BY HORIZON AND BY WHAT THE READER MAY READ', async () => {
  const k = await record();
  const deps = depsOver(k);
  assert.deepEqual(
    readBlock(deps, { ...DUE, where: 'list is tasks' }).rows.map((r) => r.fields.row),
    ['tasks#1', 'tasks#2'],
  );
  assert.deepEqual(readBlock(deps, { ...DUE, horizon: 0 }).rows.map((r) => r.fields.row), ['tasks#1'], 'nothing falls due today, and the overdue task is still due');
  assert.equal(readBlock(deps, { ...DUE, horizon: 400 }).refusals[0]?.code, 'OUT_OF_BOUNDS');
  const hidden = readBlock(depsOver(k, [], { ctx: { nowMs: NOW, schemaOf: k.schemaOf, reads: (register) => register !== 'bills' } }), DUE);
  assert.ok(!hidden.rows.some((r) => r.fields.list === 'bills'), 'a list the reader may not read is left out');
  assert.equal(readBlock(deps, { ...DUE, order: [{ field: 'day' }] }).refusals[0]?.code, 'DECLARATION_INVALID');
  const { lists: _unwired, ...bare } = deps;
  assert.equal(readBlock(bare, DUE).refusals[0]?.code, 'NOT_IN_THIS_BUILD');
});

test('A DEADLINES BLOCK NAMES EVERY LIST THAT HOLDS A DEADLINE, and `*` when it is not told the lists', async () => {
  const k = await record();
  assert.deepEqual(registersOfBlock(DUE, undefined, { lists: () => [...k.registers().values()] }).sort(), ['bills', 'recurring', 'services', 'tasks']);
  assert.deepEqual(registersOfBlock(DUE), ['*']);
});

test('THE FIGURES PINNED TO HOME COME IN THE ORDER `home:` SAYS, at most four', async () => {
  const k = await record();
  const figures = [
    figure('fifth', { home: 5 }),
    figure('second', { home: 2 }),
    figure('unpinned'),
    figure('first', { home: 1 }),
    figure('off-the-dial', { home: 12 }),
    figure('fourth', { home: 4 }),
    figure('third', { home: 3 }),
  ];
  const out = readBlock(depsOver(k, figures), { kind: 'stat', source: 'figures.home' });
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.readings?.map((r) => [r.metric, r.label]), [
    ['first', 'The first'],
    ['second', 'The second'],
    ['third', 'The third'],
    ['fourth', 'The fourth'],
  ]);
  /* READ AS A CELL IS: the reading is the one the record answers for the same declaration. */
  const direct = k.metric(figures[3]!);
  assert.deepEqual(out.readings?.[0]?.reading ?? null, direct.ok ? direct.value : null);
  assert.equal(readBlock(depsOver(k, figures), { kind: 'stat', source: 'figures.home', cells: [{ metric: 'first' }] }).refusals[0]?.at, 'cells');
  assert.equal(readBlock(depsOver(k, figures), { kind: 'table', source: 'figures.home' }).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.deepEqual(registersOfBlock({ kind: 'stat', source: 'figures.home' }, undefined, { metrics: () => figures }), ['tasks']);
});

test('A FEED AND A QUEUE SAY WHICH LIST EACH ROW IS ON, and narrow by it', async () => {
  const k = await record();
  const at = '2026-09-25T10:00:00Z';
  const events: ActivityEvent[] = [
    { ts: at, actor: 'p_1', kind: 'create', target: 'transactions#1', note: null },
    { ts: at, actor: 'p_1', kind: 'edit', target: 'tasks#2', note: null },
    { ts: at, actor: 'system', kind: 'install', target: 'declaration:page.cash', note: null },
  ];
  const feed = readBlock(depsOver(k, [], { activity: () => ({ events, seen: null }) }), { kind: 'feed', source: 'activity', empty: 'Nothing yet.' });
  assert.deepEqual(feed.feed?.map((r) => r.list), ['transactions', 'tasks', null]);
  const narrowed = readBlock(depsOver(k, [], { activity: () => ({ events, seen: null }) }), { kind: 'feed', source: 'activity', where: 'list is transactions', empty: 'Nothing yet.' });
  assert.deepEqual(narrowed.feed?.map((r) => r.target), ['transactions#1']);

  const question = (id: string, about?: string): QueueQuestion => ({ id, who: 'rule:chase', at, kind: 'options', question: 'Chase it?', why: '', cost: 'undo', options: [], ...(about === undefined ? {} : { about }) });
  const open = () => ({ questions: [question('SG1', 'obligations#4'), question('SG2', 'Kiln'), question('SG3')], open: 3 });
  const queue = readBlock(depsOver(k, [], { openQuestions: open }), { kind: 'queue', source: 'governance.open', limit: 5 });
  assert.deepEqual(queue.queue?.map((q) => q.list), ['obligations', null, null]);
  const theirs = readBlock(depsOver(k, [], { openQuestions: open }), { kind: 'queue', source: 'governance.open', where: 'list is obligations' });
  assert.deepEqual(theirs.queue?.map((q) => q.id), ['SG1']);
});

test('A WALK THAT OFFERS THE SELL KNOB WITH NO `sell:` NAMES THE LIST BEHIND EVERY SELLABLE FIGURE, and `*` untold', () => {
  const walk: PageBlock = { kind: 'forecast', source: 'forecast.runway', opening: 0, from: [], knobs: ['sell'] };
  const sellable = [figure('held', { sellable: true }), figure('kept')];
  assert.deepEqual(registersOfBlock(walk, undefined, { metrics: () => sellable }), ['tasks']);
  assert.deepEqual(registersOfBlock(walk), ['*']);
  assert.deepEqual(registersOfBlock({ ...walk, knobs: ['horizon'] }), [], 'a walk that offers no sell knob names no figure for it');
});
