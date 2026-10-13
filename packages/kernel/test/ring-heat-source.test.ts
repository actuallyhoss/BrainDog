/**
 * `ring` and `heat` over a register, not only over the rows an author wrote into the fence.
 *
 * Both kinds landed drawing authored rows only, and both already took a `source:`, because every kind does. What a
 * register answered them was the ordinary list read, and it was wrong for both, measured on this record before the
 * change:
 *
 *   `heat`  sixty rows on sixty distinct days answered FIFTY rows, `matched: 60` and no refusal. A heat grid adds
 *           the rows on one day together, so the ten it never read were ten days drawn as gaps, with nothing on the
 *           page to say so. That is the wrong-number case `SUMS` exists for, and `heat` was not in it.
 *   `ring`  ten tasks with three done answered the three done rows, which `ringPlan` reads as three PARTS of a
 *           whole. Over a register the question a ring asks is progress: how many of the rows match against how
 *           many there are, which is one row, `label | value | target`, and the whole count is not a row at all.
 *
 * EACH TEST DRIVES A REAL RECORD, because both answers are about what `list` says it matched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_KEYS, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* `wholeRead` IS HANDED ONLY WHERE `ANSWER_KEYS` LISTS IT (`handsWhole` in `pages.ts`; `sums-whole.test.ts` holds the gate).
   `block-keys.ts` is not this job's file, so until it lists the key the heat tests below list it themselves. */
if (!ANSWER_KEYS.includes('wholeRead')) (ANSWER_KEYS as string[]).push('wholeRead');

const NOW = Date.UTC(2026, 8, 9, 12);
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);

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
      { id: 'on', type: 'day', index: true },
      { id: 'hours', type: 'int' },
      { id: 'state', type: 'enum', values: ['open', 'done'], required: true },
    ],
  } as never,
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.work',
  kind: 'page',
  body: { page: 'work', title: 'Work', requires: ['register.tasks'], blocks } as never,
});

async function record(page: Declaration, rows: Record<string, unknown>[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([TASKS, page]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const row of rows) assert.ok(k.create('tasks', row, { actor: 'p_1' }).ok);
  return { k, sql };
}

type Answered = {
  rows?: { fields: Record<string, unknown> }[];
  columns?: { field: string }[];
  matched?: number;
  refusals?: { code: string; fix: string; at?: string }[];
};

const first = (k: Kernel): Answered => {
  const r = k.page('work') as { ok: boolean; value?: { blocks?: Answered[] } };
  assert.ok(r.ok, JSON.stringify(r));
  const b = r.value?.blocks?.[0];
  assert.ok(b, 'the page answered no block');
  return b;
};

/** A row's cells in the order its block's columns name them, which is how both drawers read a row. */
const cells = (b: Answered, n = 0): unknown[] => (b.columns ?? []).map((c) => b.rows?.[n]?.fields[c.field]);

const HEAT = { kind: 'heat', heading: 'Hours', source: 'register.tasks', columns: [{ field: 'on' }, { field: 'hours' }] };

/* ── heat ─────────────────────────────────────────────────────────────── */

test('A HEAT OVER SIXTY DAYS READS SIXTY ROWS, and it read fifty and drew ten busy days as gaps', async () => {
  const { k, sql } = await record(
    pageOf(HEAT),
    Array.from({ length: 60 }, (_, n) => ({ what: `Day ${n}`, on: day(-n), hours: 2, state: 'done' })),
  );
  const heat = first(k);
  assert.deepEqual(heat.refusals, []);
  assert.equal(heat.matched, 60);
  assert.equal((heat.rows ?? []).length, 60, `a heat over 60 rows drew ${(heat.rows ?? []).length} of them and said nothing`);
  sql.close();
});

type Whole = { rows: { label: unknown; who?: unknown; rows: number; value: number | null; of?: number | null }[]; total: number | null; of?: number | null; outside?: number };
const wholeOf = (b: Answered): Whole => {
  const w = (b as { wholeRead?: Whole }).wholeRead;
  assert.ok(w, 'the heat answered no wholeRead');
  return w;
};

test('AND A HEAT PAST 200 ROWS IS ADDED UP WHOLE, a day a part, where it was refused at its 201st row', async () => {
  /* 201 WAS THE FIRST COUNT PAST THE 200 A BLOCK THAT ADDS UP READ, and the block answered `OUT_OF_BOUNDS` (PGS-B05). */
  const { k, sql } = await record(
    pageOf(HEAT),
    Array.from({ length: 201 }, (_, n) => ({ what: `Row ${n}`, on: day(-(n % 67)), hours: 1, state: 'done' })),
  );
  const heat = first(k);
  assert.deepEqual(heat.refusals, []);
  assert.equal(heat.matched, 201);
  const w = wholeOf(heat);
  assert.equal(w.total, 201);
  assert.equal(w.rows.length, 67, 'one part a day');
  assert.equal(w.rows.reduce((a, r) => a + (r.value ?? 0), 0), 201);
  assert.deepEqual(w.rows[0], { label: day(-66), rows: 3, value: 3 });
  assert.equal(w.outside, 0);
  sql.close();
});

test('a day outside the twelve weeks is counted and said, never placed, and a heat with no value column counts rows', async () => {
  const { k, sql } = await record(pageOf({ ...HEAT, columns: [{ field: 'on' }] }), [
    { what: 'Today', on: day(0), state: 'done' },
    { what: 'Today too', on: day(0), state: 'open' },
    { what: 'Last year', on: day(-400), state: 'done' },
    { what: 'Tomorrow', on: day(1), state: 'open' },
    { what: 'No day', state: 'open' },
  ]);
  const w = wholeOf(first(k));
  assert.deepEqual(w.rows, [{ label: day(0), rows: 2, value: 2 }]);
  assert.equal(w.total, 5, 'the total is of every row the where admits');
  assert.equal(w.outside, 3);
  sql.close();
});

/* A HEAT'S `of:` (D25.32): each day's wash is the share of that day's whole that the `where` admits. */
const SHARED = [
  { what: 'A', on: day(0), hours: 2, state: 'done' },
  { what: 'B', on: day(0), hours: 2, state: 'done' },
  { what: 'C', on: day(0), hours: 1, state: 'done' },
  { what: 'D', on: day(0), hours: 1, state: 'done' },
  { what: 'E', on: day(-1), hours: 2, state: 'done' },
  { what: 'F', on: day(-1), hours: 3, state: 'done' },
  /* OUTSIDE THE WHOLE, so it is in neither the part nor the whole though the `where` alone admits it. */
  { what: 'G', on: day(-1), hours: 2, state: 'open' },
];
const TWOS = { field: 'hours', is: 2 };

test('A HEAT WITH AN OF: SAYS EACH DAY AS A SHARE OF THAT DAY\'S WHOLE, the part inside the whole', async () => {
  const { k, sql } = await record(pageOf(HEAT), SHARED);
  const heat = k.block({ ...HEAT, where: TWOS, of: 'state is done' } as never) as Answered;
  assert.deepEqual(heat.refusals, []);
  const w = wholeOf(heat);
  assert.deepEqual(w.rows, [
    { label: day(-1), rows: 1, value: 2, of: 5 },
    { label: day(0), rows: 2, value: 4, of: 6 },
  ]);
  assert.equal(w.total, 6);
  assert.equal(w.of, 11);
  /* WITH NO `of:` THERE IS NO SHARE TO SAY, and the open row the where admits is counted. */
  const plain = wholeOf(k.block({ ...HEAT, where: TWOS } as never) as Answered);
  assert.deepEqual(plain.rows, [
    { label: day(-1), rows: 2, value: 4 },
    { label: day(0), rows: 2, value: 4 },
  ]);
  assert.equal(plain.of, undefined);
  sql.close();
});

test('a heat that counts rows shares by rows, and an of: that is not a sentence or names no field is refused at of:', async () => {
  const { k, sql } = await record(pageOf(HEAT), SHARED);
  const counted = wholeOf(k.block({ ...HEAT, columns: [{ field: 'on' }], where: TWOS, of: 'state is done' } as never) as Answered);
  assert.deepEqual(counted.rows, [
    { label: day(-1), rows: 1, value: 1, of: 2 },
    { label: day(0), rows: 2, value: 2, of: 4 },
  ]);
  const number = k.block({ ...HEAT, of: 5 } as never) as Answered;
  assert.equal(number.refusals?.[0]?.code, 'VALUE_MALFORMED', JSON.stringify(number.refusals));
  assert.equal(number.refusals?.[0]?.at, 'of');
  const unknown = k.block({ ...HEAT, of: 'colour is red' } as never) as Answered;
  assert.equal(unknown.refusals?.[0]?.at, 'of', JSON.stringify(unknown.refusals));
  /* AND A HEAT AN AUTHOR WROTE OUT HAS NO LIST TO BE A SHARE OF. */
  const authored = k.block({ kind: 'heat', heading: 'Hours', of: 'state is done' } as never) as Answered;
  assert.equal(authored.refusals?.[0]?.at, 'of', JSON.stringify(authored.refusals));
  assert.match(String(authored.refusals?.[0]?.fix), /this heat is not over a list/u);
  sql.close();
});

test('A HEAT WRITTEN `people: true` BEFORE PEOPLE 2.6.0 STILL READS, as `who:`, and the install takes only the new word', async () => {
  const { k, sql } = await record(pageOf({ ...HEAT, who: true }), [{ what: 'Day', on: day(0), hours: 1, state: 'done' }]);
  assert.deepEqual(first(k).refusals, []);
  /* A PAGE A RECORD HOLDING 2.5.0 KEPT, read as it was installed then. */
  const old = k.block({ ...HEAT, people: true } as never) as Answered & { who?: unknown; people?: unknown };
  assert.deepEqual(old.refusals, []);
  assert.equal(old.who, true);
  assert.equal(old.people, undefined, 'the old word rode through beside the new one');
  const refused = await k.install([pageOf({ ...HEAT, people: true })]);
  assert.equal(refused.ok, false, 'a page written with the old word installed');
  sql.close();
});

/* ── ring ─────────────────────────────────────────────────────────────── */

const TEN = Array.from({ length: 10 }, (_, n) => ({ what: `Task ${n}`, on: day(-n), state: n < 3 ? 'done' : 'open' }));

test('A RING OVER A REGISTER IS ONE ROW OF PROGRESS, the rows its where matches against every row', async () => {
  const { k, sql } = await record(pageOf({ kind: 'ring', heading: 'Done', source: 'register.tasks', where: 'state is done' }), TEN);
  const ring = first(k);
  assert.deepEqual(ring.refusals, []);
  assert.equal((ring.rows ?? []).length, 1, `a ring over 10 tasks with 3 done drew ${(ring.rows ?? []).length} rows, which ringPlan reads as that many parts`);
  const [, value, target] = cells(ring);
  assert.equal(value, 3);
  assert.equal(target, 10);
  /* ONE ROW DRAWN IS ONE ROW MATCHED, so no drawer prints "Showing 1 of 3" under a dial that shows all of it. */
  assert.equal(ring.matched, 1);
  sql.close();
});

test('the whole it is set against is the register, not a first read of it', async () => {
  /* 250 ROWS, past the 200 a list read hands back, because a ring counts and never adds, so it has no ceiling to refuse at. */
  const { k, sql } = await record(
    pageOf({ kind: 'ring', heading: 'Done', source: 'register.tasks', where: 'state is done' }),
    Array.from({ length: 250 }, (_, n) => ({ what: `Task ${n}`, on: day(-(n % 30)), state: n < 240 ? 'done' : 'open' })),
  );
  const ring = first(k);
  assert.deepEqual(ring.refusals, []);
  const [, value, target] = cells(ring);
  assert.equal(value, 240);
  assert.equal(target, 250);
  sql.close();
});

test('a ring over a register with nothing done draws a written zero, and one over an empty register draws zero of zero', async () => {
  const { k, sql } = await record(
    pageOf({ kind: 'ring', heading: 'Done', source: 'register.tasks', where: 'state is done' }),
    TEN.map((t) => ({ ...t, state: 'open' })),
  );
  assert.deepEqual(cells(first(k)).slice(1), [0, 10]);
  sql.close();

  const empty = await record(pageOf({ kind: 'ring', heading: 'Done', source: 'register.tasks', where: 'state is done' }), []);
  assert.deepEqual(cells(first(empty.k)).slice(1), [0, 0]);
  empty.sql.close();
});

test('a ring over a register takes no columns of its own, and says so rather than drawing a row it did not read', async () => {
  const { k, sql } = await record(
    pageOf({ kind: 'ring', heading: 'Done', source: 'register.tasks', where: 'state is done', columns: [{ field: 'what' }, { field: 'hours' }] }),
    TEN,
  );
  const ring = first(k);
  assert.equal(ring.refusals?.[0]?.code, 'DECLARATION_INVALID');
  assert.equal(ring.refusals?.[0]?.at, 'columns');
  assert.equal((ring.rows ?? []).length, 0);
  sql.close();
});

test('and a ring an author wrote out is still the rows of its own fence', async () => {
  /* THE AUTHORED PATH IS UNTOUCHED: a ring with no `source:` never reaches `ringOf`, so the record adds no counted
     row and no `label | value | target` columns to it. This held before the change as well; it is here so that
     moving the ring branch above the source check goes red rather than drawing a dial over a fence. The rows are
     written out with `authored:`, the key a page writes rows with; `rows:` is what a read answers and is refused at install. */
  const { k, sql } = await record(
    pageOf({ kind: 'ring', heading: 'Split', authored: [{ cells: ['Rent', '600', ''] }, { cells: ['Food', '300', ''] }] }),
    [],
  );
  const ring = first(k);
  assert.deepEqual(ring.refusals, []);
  assert.equal(ring.columns, undefined);
  assert.deepEqual(ring.rows ?? [], []);
  sql.close();
});

/* ── which clause is the whole ─────────────────────────────────────────── THE FIRST CUT OF `ringOf` WAS REFUSED ON
   THIS MEASUREMENT: a list of 100 tasks, 4 on the work list with 2 of them done and 96 at home, and a ring saying
   `list is work, state is done` drew 2%, where the work list is half done. The owner's call is that the whole is every
   row the block's scope admits (the page's project when it inherits, else the list), the `where` is the part, and a
   block that wants another whole says so with `of:`. So the 2% stands for the block as written, and the half is one
   `of:` away. Before the fix `of:` was a key the record did not read, and the ring drew 2 of 100 with a refusal beside
   it. */

const LISTED: Declaration = {
  id: 'register.chores',
  kind: 'register',
  body: {
    id: 'chores',
    name: 'Chores',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'list', type: 'enum', values: ['work', 'home'], required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], required: true },
    ],
  } as never,
};

const CHORES = [
  ...Array.from({ length: 4 }, (_, n) => ({ what: `Work ${n}`, list: 'work', state: n < 2 ? 'done' : 'open' })),
  ...Array.from({ length: 96 }, (_, n) => ({ what: `Home ${n}`, list: 'home', state: 'open' })),
];

async function chores(...blocks: Record<string, unknown>[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const page: Declaration = { id: 'page.work', kind: 'page', body: { page: 'work', title: 'Work', requires: ['register.chores'], blocks } as never };
  const installed = await k.install([LISTED, page]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const row of CHORES) assert.ok(k.create('chores', row, { actor: 'p_1' }).ok);
  return { k, sql };
}

test('WITH NO OF: THE WHOLE IS THE LIST, so the where that names the work list is the part of all 100', async () => {
  const { k, sql } = await chores({ kind: 'ring', heading: 'Work done', source: 'register.chores', where: 'list is work, state is done' });
  const ring = first(k);
  assert.deepEqual(ring.refusals, []);
  assert.deepEqual(cells(ring), ['Work done', 2, 100]);
  sql.close();
});

test('AN OF: SENTENCE NAMES ANOTHER WHOLE, and the work list is half done', async () => {
  const { k, sql } = await chores({ kind: 'ring', heading: 'Work done', source: 'register.chores', where: 'state is done', of: 'list is work' });
  const ring = first(k);
  assert.deepEqual(ring.refusals, [], `of: was refused: ${JSON.stringify(ring.refusals)}`);
  assert.deepEqual(cells(ring), ['Work done', 2, 4], 'the ring set the done work against every chore rather than against the work list');
  sql.close();
});

test('the part is always inside the whole: a where that repeats the of: counts the same rows once', async () => {
  const { k, sql } = await chores({ kind: 'ring', heading: 'Work done', source: 'register.chores', where: 'list is work, state is done', of: 'list is work' });
  assert.deepEqual(cells(first(k)).slice(1), [2, 4]);
  sql.close();
});

test('THE PART IS COUNTED INSIDE THE WHOLE even when the where alone would reach past it', async () => {
  /* A DONE HOME CHORE IS WHAT TELLS THE TWO APART. On the hundred above every home chore is open, so a part counted
     from the `where` alone and a part counted inside the `of:` both answer 2, and dropping the `of:` from the part left
     every test green. With one home chore done, the part read alone is 3 of 4, a work list more done than it is. */
  const { k, sql } = await chores({ kind: 'ring', heading: 'Work done', source: 'register.chores', where: 'state is done', of: 'list is work' });
  assert.ok(k.create('chores', { what: 'Home done', list: 'home', state: 'done' }, { actor: 'p_1' }).ok);
  assert.deepEqual(cells(first(k)).slice(1), [2, 4], 'a done home chore was counted as part of the work list');
  sql.close();
});

test('an of: that is not a sentence is refused at of:, and not at the where it never came from', async () => {
  /* MEASURED: `of: 5` was refused `VALUE_MALFORMED` at `where`, because the number reached the list read inside the
     same predicate as the `where` and the list named the key it reads. The author's `where` was fine. */
  const { k, sql } = await chores({ kind: 'ring', heading: 'Bad', source: 'register.chores', where: 'state is done', of: 5 });
  const ring = first(k);
  assert.equal(ring.refusals?.length, 1, JSON.stringify(ring.refusals));
  assert.equal(ring.refusals?.[0]?.at, 'of', JSON.stringify(ring.refusals));
  assert.deepEqual(ring.rows ?? [], []);
  sql.close();
});

test('an of: on a ring an author wrote out says the ring is not over a list, not that a ring has no whole', async () => {
  /* READ THROUGH `k.block`, because `rows` is what a read answers and the install now refuses it on a declaration; a
     ring that came back from a read with its rows on it is the written-out ring this sentence is about. */
  const { k, sql } = await chores({ kind: 'ring', heading: 'Work done', source: 'register.chores', where: 'state is done' });
  const ring = k.block({ kind: 'ring', heading: 'Split', rows: [['Rent', '600', ''], ['Food', '300', '']], of: 'list is work' } as never) as Answered;
  assert.equal(ring.refusals?.[0]?.at, 'of');
  assert.match(String(ring.refusals?.[0]?.fix), /not over a list/u);
  sql.close();
});

test('an of: the list cannot read is refused at of:, and so is an of: on a kind with no whole', async () => {
  /* THE STRAY `of:` IS READ THROUGH `k.block`: the install refuses `of:` on a table now, and a page installed before
     it did is still read, so the read's own sentence is what this holds. */
  const { k, sql } = await chores({ kind: 'ring', heading: 'Bad', source: 'register.chores', where: 'state is done', of: 'colour is red' });
  const r = k.page('work') as { ok: boolean; value?: { blocks?: Answered[] } };
  assert.ok(r.ok, JSON.stringify(r));
  const [bad] = r.value?.blocks ?? [];
  const stray = k.block({ kind: 'table', heading: 'Stray', source: 'register.chores', of: 'list is work', columns: [{ field: 'what' }] } as never) as Answered;
  assert.equal(bad?.refusals?.[0]?.at, 'of', JSON.stringify(bad?.refusals));
  assert.deepEqual(bad?.rows ?? [], []);
  assert.equal(stray?.refusals?.[0]?.code, 'DECLARATION_INVALID', JSON.stringify(stray?.refusals));
  assert.equal(stray?.refusals?.[0]?.at, 'of');
  sql.close();
});

test('THE LABEL IS THE BLOCK\'S TITLE, never the raw sentence, and the list\'s id when the block has no heading', async () => {
  const { k, sql } = await chores(
    { kind: 'ring', heading: 'Work done', source: 'register.chores', where: 'list is work, state is done' },
    { kind: 'ring', source: 'register.chores', where: 'state is done' },
  );
  const r = k.page('work') as { ok: boolean; value?: { blocks?: Answered[] } };
  const [titled, bare] = r.value?.blocks ?? [];
  assert.equal(cells(titled!)[0], 'Work done');
  assert.equal(cells(bare!)[0], 'chores');
  sql.close();
});

test('A RING WITH LIMIT 0 DRAWS NOTHING, as every other block with limit 0 does', async () => {
  const { k, sql } = await chores({ kind: 'ring', heading: 'Work done', source: 'register.chores', where: 'state is done', limit: 0 });
  const ring = first(k);
  assert.deepEqual(ring.rows ?? [], [], 'limit: 0 drew the counted row anyway');
  assert.equal(ring.matched, 0);
  sql.close();
});

/* ── a ring that inherits ─────────────────────────────────────────────── */

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
      { id: 'state', type: 'enum', values: ['open', 'done'], required: true },
    ],
  } as never,
};

test('A RING THAT INHERITS IS SET AGAINST ITS PROJECT\'S ROWS AND THE ONES THAT APPLY EVERYWHERE, not the whole list', async () => {
  /* KILN HAS 4 JOBS WITH 2 DONE, PORTAGE 10 WITH 5 DONE, AND 2 APPLY EVERYWHERE WITH 1 DONE. What Kiln sees is its 4
     and the 2 global ones, 3 of them done. The first cut returned before the inherit check and answered 2 of 16:
     Kiln's own done jobs against every job of both projects. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const page: Declaration = {
    id: 'page.work',
    kind: 'page',
    body: {
      page: 'work',
      title: 'Work',
      requires: ['register.jobs', 'register.chores'],
      blocks: [
        { kind: 'ring', heading: 'Kiln done', source: 'register.jobs', where: 'project is Kiln, state is done', inherit: true },
        { kind: 'ring', heading: 'Unscoped', source: 'register.chores', where: 'state is done', inherit: true },
      ],
    } as never,
  };
  const installed = await k.install([PROJECTS, JOBS, LISTED, page]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('things', { name: 'Kiln' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('things', { name: 'Portage' }, { actor: 'p_1' }).ok);
  const add = (n: number, done: number, project?: string) => {
    for (let i = 0; i < n; i++)
      assert.ok(k.create('jobs', { what: `${project ?? 'Global'} ${i}`, state: i < done ? 'done' : 'open', ...(project ? { project } : {}) }, { actor: 'p_1' }).ok);
  };
  add(4, 2, 'things#1');
  add(10, 5, 'things#2');
  add(2, 1);
  const r = k.page('work') as { ok: boolean; value?: { blocks?: Answered[] } };
  assert.ok(r.ok, JSON.stringify(r));
  const [kiln, unscoped] = r.value?.blocks ?? [];
  assert.deepEqual(kiln?.refusals, []);
  assert.deepEqual(cells(kiln!), ['Kiln done', 3, 6]);
  /* AND A RING THAT INHERITS OVER A LIST WITH NO SCOPE FIELD SAYS SO, as a table does, rather than drawing the list. */
  assert.equal(unscoped?.refusals?.[0]?.code, 'FIELD_UNKNOWN', JSON.stringify(unscoped?.refusals));
  assert.equal(unscoped?.refusals?.[0]?.at, 'inherit');
  assert.deepEqual(unscoped?.rows ?? [], []);
  sql.close();
});

test('CHIPS THAT INHERIT COUNT THEIR PROJECT\'S ROWS AND THE ONES THAT APPLY EVERYWHERE, as the list beside them reads', async () => {
  /* THE SAME RECORD AS THE RING ABOVE: Kiln's 4 jobs and the 2 global ones are 6, 3 of them done; Portage's 10 are not Kiln's. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PROJECTS, JOBS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('things', { name: 'Kiln' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('things', { name: 'Portage' }, { actor: 'p_1' }).ok);
  const add = (n: number, done: number, project?: string) => {
    for (let i = 0; i < n; i++)
      assert.ok(k.create('jobs', { what: `${project ?? 'Global'} ${i}`, state: i < done ? 'done' : 'open', ...(project ? { project } : {}) }, { actor: 'p_1' }).ok);
  };
  add(4, 2, 'things#1');
  add(10, 5, 'things#2');
  add(2, 1);
  const b = k.block({ kind: 'chips', source: 'register.jobs', where: 'project is Kiln', inherit: true, columns: [{ field: 'state' }] } as never) as Answered & {
    matched?: number;
    wholeRead?: { rows: { label: unknown; rows: number; value: number | null }[]; total: number | null };
  };
  assert.deepEqual(b.refusals, []);
  assert.equal(b.matched, 6);
  assert.equal(b.wholeRead?.total, 6);
  assert.deepEqual(b.wholeRead?.rows.map((r) => [r.label, r.value]).sort(), [['done', 3], ['open', 3]]);
  sql.close();
});
