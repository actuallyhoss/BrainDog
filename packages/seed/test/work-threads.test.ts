/**
 * Threads that plan, and follow-ups that follow (REC-C10, Work 1.19.0), on a real record.
 *
 * A THREAD HAD FOUR STATES AND NO DECLARED MOVES, so an idea went straight to done, and it had the day it was opened
 * and no day it aims for, so it was in no "Due this week". A follow-up took its parent's project and thread and never
 * whose it is, and took nothing at all once it named a project of its own. Each test below failed on that build.
 *
 * TWO THINGS THE FIRST CUT OF 1.19.0 GOT WRONG ARE HELD HERE TOO: a thread held up could not be marked done, and a
 * follow-up took its parent's agent, so a step a person added under an agent's task was handed to that agent.
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
  holding: ['planned', 'open', 'done', 'dropped'],
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

test('A THREAD HELD UP CAN BE MARKED DONE WHERE IT STANDS, and a planned one still cannot', async () => {
  const k = await seeded();
  /* THE SEEDED ONE, as a person meets it: Move the newsletter off portagemail has been Holding for ninety days. */
  const held = k.list({ register: 'tracks', where: 'state is holding' });
  assert.ok(held.ok && held.value.rows.length > 0, 'the example record holds no thread that is held up');
  const seededRef = `tracks#${held.value.rows[0]!.seq}`;
  made(k.update('tracks', seededRef, { state: 'done' }, OWNER));
  assert.equal(k.get(seededRef)!.fields.state, 'done');
  /* AND AS AN AGENT WRITES IT, which was answered TRANSITION_ILLEGAL. */
  const thread = made(k.create('tracks', { name: 'Wait for the foundry licence', state: 'holding' }, OWNER));
  const ref = `tracks#${thread.seq}`;
  made(k.update('tracks', ref, { state: 'done' }, { actor: 'agent:claude' }));
  assert.equal(k.get(ref)!.fields.state, 'done');
  /* A FINISHED THREAD COMES BACK OPEN, never straight back to holding. */
  const back = k.update('tracks', ref, { state: 'holding' }, OWNER) as Answer;
  assert.equal(back.refusal?.code, 'TRANSITION_ILLEGAL');
  assert.deepEqual(back.refusal?.allowed, ['open']);
  /* WORK NOT STARTED IS STILL NOT DONE IN ONE STEP, and the refusal now says holding leads there. */
  const plan = made(k.create('tracks', { name: 'A second specimen', state: 'planned' }, OWNER));
  const refused = k.update('tracks', `tracks#${plan.seq}`, { state: 'done' }, OWNER) as Answer;
  assert.equal(refused.refusal?.code, 'TRANSITION_ILLEGAL');
  assert.deepEqual(refused.refusal?.allowed, ['idea', 'open', 'holding', 'dropped']);
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

test('A FOLLOW-UP THAT NAMES NOTHING TAKES ITS PARENT’S PROJECT, THREAD AND OWNER, and never its agent', async () => {
  const k = await seeded();
  const run = await scriptOf('start_with_parent');
  const parent = made(k.create('tasks', { what: 'Master the italics', state: 'doing', thing: 'things#1', track: 'tracks#1', owner: 'people#1', agent: 'claude' }, OWNER));
  const step = made(k.create('tasks', { what: 'Check the italic kerning', state: 'open', parent: `tasks#${parent.seq}` }, OWNER));
  await placed(k, run, step.id);
  const now = k.get(`tasks#${step.seq}`)!.fields;
  assert.deepEqual(
    { thing: now.thing, track: now.track, owner: now.owner },
    { thing: idOf(k, 'things#1'), track: idOf(k, 'tracks#1'), owner: idOf(k, 'people#1') },
  );
  assert.equal(now.agent ?? null, null, 'a step a person added under an agent’s task was handed to that agent');
});

test('A PERSON’S FOLLOW-UP OF AN AGENT’S TASK IS ON NO AGENT’S LIST, and the parent stays with its agent', async () => {
  const k = await seeded();
  const run = await scriptOf('start_with_parent');
  const parent = made(k.create('tasks', { what: 'Master the italics', state: 'doing', track: 'tracks#1', agent: 'claude' }, { actor: 'agent:claude' }));
  const step = made(k.create('tasks', { what: 'Ring the foundry about the italics', state: 'open', parent: `tasks#${parent.seq}` }, OWNER));
  await placed(k, run, step.id);
  /* READ AS THE OVERVIEW READS IT: With an agent is every task in hand that names one. */
  const withAgent = k.list({ register: 'tasks', where: 'agent is set, state is not done or dropped', limit: 200 });
  assert.ok(withAgent.ok, sayOf(withAgent));
  const names = withAgent.value.rows.map((r) => r.fields.what);
  assert.ok(names.includes('Master the italics'), 'the agent lost its own task');
  assert.ok(!names.includes('Ring the foundry about the italics'), 'the person’s step is listed as with an agent');
  assert.equal(k.get(`tasks#${step.seq}`)!.fields.track, idOf(k, 'tracks#1'), 'the step lost its thread with the agent');
});

test('AN AGENT THAT NAMES ITSELF ON ITS OWN STEP KEEPS IT, since the script gives a step to nobody and takes it from nobody', async () => {
  const k = await seeded();
  const run = await scriptOf('start_with_parent');
  const parent = made(k.create('tasks', { what: 'Master the italics', state: 'doing', track: 'tracks#1', agent: 'claude' }, { actor: 'agent:claude' }));
  const step = made(k.create('tasks', { what: 'Master the bold italics', state: 'doing', parent: `tasks#${parent.seq}`, agent: 'claude' }, { actor: 'agent:claude' }));
  await placed(k, run, step.id);
  const now = k.get(`tasks#${step.seq}`)!.fields;
  assert.deepEqual({ track: now.track, agent: now.agent }, { track: idOf(k, 'tracks#1'), agent: 'claude' });
});

test('A FOLLOW-UP THAT NAMES ITS OWN PROJECT KEEPS IT, and still takes the thread and the owner', async () => {
  const k = await seeded();
  const run = await scriptOf('start_with_parent');
  const parent = made(k.create('tasks', { what: 'Master the italics', state: 'doing', thing: 'things#1', track: 'tracks#1', owner: 'people#1', agent: 'claude' }, OWNER));
  const step = made(k.create('tasks', { what: 'Tell Portage the italics are late', state: 'open', parent: `tasks#${parent.seq}`, thing: 'things#3' }, OWNER));
  await placed(k, run, step.id);
  const now = k.get(`tasks#${step.seq}`)!.fields;
  assert.equal(now.thing, idOf(k, 'things#3'), 'the project the follow-up named was written over');
  assert.deepEqual(
    { track: now.track, owner: now.owner },
    { track: idOf(k, 'tracks#1'), owner: idOf(k, 'people#1') },
    'the copy stopped at the project',
  );
  assert.equal(now.agent ?? null, null);
});

test('WHAT A FOLLOW-UP ALREADY SAYS IS LEFT AS IT SAID IT, each field on its own', async () => {
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
