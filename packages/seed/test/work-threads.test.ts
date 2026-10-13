/**
 * Threads that plan, and follow-ups that follow (REC-C10, Work 1.19.0), on a real record.
 *
 * A THREAD HAD FOUR STATES AND NO DECLARED MOVES, so an idea went straight to done, and it had the day it was opened
 * and no day it aims for, so it was in no "Due this week". A follow-up took its parent's project and thread and never
 * who holds it, and took nothing at all once it named a project of its own. Each test below failed on that build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, readBlock, type Kernel, type PageBlock, type PageDeps } from '@braindog/kernel';
import { ok, sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, installSeed } from '../src/index.ts';
import { WORK_AUTOMATIONS, WORK_REGISTERS } from '../src/modules/work.ts';

const OWNER = { actor: 'p_1' };
const day = (n: number): string => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

type Answer = { ok: boolean; value?: { id: string; seq: number }; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };

const made = (r: unknown): { id: string; seq: number } => {
  const x = r as Answer;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value!;
};

/** The moves the pack declares, which the tests walk rather than spell a second time. */
const MOVES: Record<string, readonly string[]> = {
  idea: ['planned', 'open', 'dropped'],
  planned: ['idea', 'open', 'holding', 'dropped'],
  open: ['holding', 'done', 'dropped'],
  holding: ['planned', 'open', 'dropped'],
  done: ['open'],
  dropped: ['idea', 'open'],
};
const STATES = Object.keys(MOVES);

const stateField = () => WORK_REGISTERS.tracks!.fields.find((f) => f.id === 'state')!;

/* ── the six states and their moves ──────────────────────────────────────── */

test('A THREAD HAS SIX STATES, SHOWN AS IDEA, PLANNED, OPEN, HOLDING, DONE AND DROPPED, and the four it had are stored as they were', () => {
  const state = stateField() as { values?: readonly string[]; labels?: Record<string, string> };
  assert.deepEqual(state.values, STATES);
  assert.deepEqual(state.labels, { idea: 'Idea', planned: 'Planned', open: 'Open', holding: 'Holding', done: 'Done', dropped: 'Dropped' });
  assert.deepEqual(WORK_REGISTERS.tracks!.done, ['done', 'dropped'], 'an idea and a plan are still in play');
});

test('THE MOVES A THREAD MAY MAKE ARE DECLARED, each state to the ones it leads to and no other', () => {
  const declared = stateField().transitions;
  assert.ok(declared, 'Threads declares no moves');
  assert.deepEqual(Object.fromEntries(Object.entries(declared).map(([from, move]) => [from, move.to])), MOVES);
});

test('AN IDEA CANNOT BE MARKED DONE IN ONE STEP, and the refusal names the moves allowed', async () => {
  const k = await seeded();
  const thread = made(k.create('tracks', { name: 'A second specimen', state: 'idea' }, OWNER));
  const ref = `tracks#${thread.seq}`;
  const refused = k.update('tracks', ref, { state: 'done' }, OWNER) as Answer;
  assert.equal(refused.ok, false, 'an idea went straight to done');
  assert.equal(refused.refusal?.code, 'TRANSITION_ILLEGAL');
  assert.equal(refused.refusal?.at, 'state');
  assert.deepEqual(refused.refusal?.allowed, ['planned', 'open', 'dropped']);
  assert.equal(k.get(ref)!.fields.state, 'idea', 'the refused move was written');
  /* IDEA, THEN OPEN, THEN DONE PASSES, and a finished thread reopens. */
  for (const state of ['open', 'done', 'open']) made(k.update('tracks', ref, { state }, OWNER));
  assert.equal(k.get(ref)!.fields.state, 'open');
});

test('EVERY MOVE BETWEEN TWO STATES IS TAKEN OR REFUSED AS DECLARED, all thirty of them', async () => {
  const k = await seeded();
  for (const from of STATES)
    for (const to of STATES.filter((s) => s !== from)) {
      const thread = made(k.create('tracks', { name: `From ${from} to ${to}`, state: from }, OWNER));
      const out = k.update('tracks', `tracks#${thread.seq}`, { state: to }, OWNER) as Answer;
      const allowed = MOVES[from]!.includes(to);
      assert.equal(out.ok, allowed, `${from} to ${to} was ${out.ok ? 'taken' : 'refused'}`);
      if (!allowed) assert.deepEqual(out.refusal?.allowed, MOVES[from], `the refusal of ${from} to ${to} names other moves`);
    }
});

/* ── the day a thread aims for ───────────────────────────────────────────── */

/** What a page reads through, over the record itself, so a `deadlines` block is read as any Home reads it. */
function depsOver(k: Kernel): PageDeps {
  const schemaOf = k.schemaOf;
  return {
    pages: () => [],
    metric: () => null,
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
    metrics: () => [],
  };
}

/** "Due this week" as the use cases declare it: every list that holds a due day, seven days ahead. */
const DUE_THIS_WEEK: PageBlock = { kind: 'table', heading: 'Due this week', source: 'deadlines', horizon: 7, limit: 50 };

test('A THREAD SAYS THE DAY IT AIMS FOR, a deadline with a reminder on the day', () => {
  const target = WORK_REGISTERS.tracks!.fields.find((f) => f.id === 'target');
  assert.ok(target, 'Threads has no target');
  assert.deepEqual(
    [target.label, target.type, target.deadline, target.remind],
    ['Aiming for', 'day', true, ['0d']],
  );
});

test('A THREAD WITH A TARGET THREE DAYS OUT IS IN DUE THIS WEEK, and one finished or aimed past the week is not', async () => {
  const k = await seeded();
  made(k.create('tracks', { name: 'Ship the specimen page', state: 'planned', target: day(3) }, OWNER));
  made(k.create('tracks', { name: 'Rework the licence page', state: 'open', target: day(30) }, OWNER));
  made(k.create('tracks', { name: 'Close the old year', state: 'done', target: day(2) }, OWNER));
  const week = readBlock(depsOver(k), DUE_THIS_WEEK);
  assert.deepEqual(week.refusals, []);
  const threads = week.rows.filter((r) => r.fields.list === 'tracks').map((r) => [r.fields.title, r.fields.day]);
  assert.deepEqual(threads, [['Ship the specimen page', day(3)]]);
});

/* ── a follow-up starts where its parent is ──────────────────────────────── */

type Run = (ctx: unknown) => Promise<void>;

/** A script of Work's, loaded from the source the pack ships, so what runs here is what a host runs. */
async function scriptOf(id: string): Promise<Run> {
  const decl = WORK_AUTOMATIONS.find((a) => a.script === id);
  assert.ok(decl, `Work ships no script called ${id}`);
  const mod = (await import(`data:text/javascript,${encodeURIComponent(String(decl.source))}`)) as { default: Run };
  return mod.default;
}

/**
 * The script run for one new task, over the record itself: `ctx.record.get` is the record's own read and `ctx.update`
 * its own write. A host queues the run and runs it in its sandbox (`apps/selfhost/test/follow-ups.test.ts`); here it
 * is run where the rule would have started it.
 */
async function placed(k: Kernel, run: Run, id: string): Promise<void> {
  const writes: [string, Record<string, unknown>, number][] = [];
  await run({
    input: { id },
    record: { get: async (spoken: string) => k.get(spoken) },
    update: (spoken: string, patch: Record<string, unknown>, version: number) => void writes.push([spoken, patch, version]),
  });
  for (const [spoken, patch, version] of writes) made(k.update('tasks', spoken, patch, { actor: 'script:start_with_parent@v1', version }));
}

const idOf = (k: Kernel, ref: string): string => k.get(ref)!.id;

test('A FOLLOW-UP THAT NAMES NOTHING TAKES ITS PARENT’S PROJECT, THREAD, OWNER AND AGENT', async () => {
  const k = await seeded();
  const run = await scriptOf('start_with_parent');
  const parent = made(k.create('tasks', { what: 'Master the italics', state: 'doing', thing: 'things#1', track: 'tracks#1', owner: 'people#1', agent: 'claude' }, OWNER));
  const step = made(k.create('tasks', { what: 'Check the italic kerning', state: 'open', parent: `tasks#${parent.seq}` }, OWNER));
  await placed(k, run, step.id);
  const now = k.get(`tasks#${step.seq}`)!.fields;
  assert.deepEqual(
    { thing: now.thing, track: now.track, owner: now.owner, agent: now.agent },
    { thing: idOf(k, 'things#1'), track: idOf(k, 'tracks#1'), owner: idOf(k, 'people#1'), agent: 'claude' },
  );
});

test('A FOLLOW-UP THAT NAMES ITS OWN PROJECT KEEPS IT, and still takes the thread, the owner and the agent', async () => {
  const k = await seeded();
  const run = await scriptOf('start_with_parent');
  const parent = made(k.create('tasks', { what: 'Master the italics', state: 'doing', thing: 'things#1', track: 'tracks#1', owner: 'people#1', agent: 'claude' }, OWNER));
  const step = made(k.create('tasks', { what: 'Tell Portage the italics are late', state: 'open', parent: `tasks#${parent.seq}`, thing: 'things#3' }, OWNER));
  await placed(k, run, step.id);
  const now = k.get(`tasks#${step.seq}`)!.fields;
  assert.equal(now.thing, idOf(k, 'things#3'), 'the project the follow-up named was written over');
  assert.deepEqual(
    { track: now.track, owner: now.owner, agent: now.agent },
    { track: idOf(k, 'tracks#1'), owner: idOf(k, 'people#1'), agent: 'claude' },
    'the copy stopped at the project',
  );
});

test('WHAT A FOLLOW-UP ALREADY SAYS IS LEFT AS IT SAID IT, each of the four on its own', async () => {
  const k = await seeded();
  const run = await scriptOf('start_with_parent');
  const parent = made(k.create('tasks', { what: 'Master the italics', state: 'doing', thing: 'things#1', track: 'tracks#1', owner: 'people#1', agent: 'claude' }, OWNER));
  const step = made(k.create('tasks', { what: 'Proof the italics', state: 'open', parent: `tasks#${parent.seq}`, track: 'tracks#3', owner: 'people#2', agent: 'codex' }, OWNER));
  await placed(k, run, step.id);
  const now = k.get(`tasks#${step.seq}`)!.fields;
  assert.deepEqual(
    { thing: now.thing, track: now.track, owner: now.owner, agent: now.agent },
    { thing: idOf(k, 'things#1'), track: idOf(k, 'tracks#3'), owner: idOf(k, 'people#2'), agent: 'codex' },
  );
});
