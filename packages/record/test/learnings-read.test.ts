/**
 * `learnings`, the read (`src/methods/learnings.ts`, AGT-C14 job c, Build 3): the learnings a session is handed, the
 * right forty in the right order. Method before fact, this project's before everywhere, newest first; forty by
 * default with `truncated`; one replaced, taken back or faded is not there, and the faded are counted.
 *
 * Through the real record on a real kernel in memory, with the seed and the agents add-on installed as any add-on is.
 * The seed's own learnings are taken back first, so every row an assertion counts is one this file wrote.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { LEARNED_SHOWN, learnedOrder, methods as learningMethods, type Learned, type Learnings } from '../src/methods/learnings.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';

const DAY = 86_400_000;
const MIN = 60_000;
/** Two hundred days after the seed was written, so "a hundred days ago" is still after it. */
const NOW = SEEDED + 200 * DAY;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** Somebody invited to the tasks and nothing else: the learnings are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['tasks'] };
/** A run in the seed's Portage, placed by its repository's folder name. */
const inPortage: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c-1', client: 'claude-code', host: 'mac', repo: 'portage' },
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Made = { api: Api; sql: ReturnType<typeof openSqlite>; clock: ReturnType<typeof fixedClock>; portage: string };

const refusal = (out: unknown): Refusal => {
  const x = out as { ok: boolean; refusal?: Refusal };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * `learnings` as the record answers it. Until `methods/index.ts` holds its line the method is built here over the same
 * kernel, and its guards are THE RECORD'S OWN ANSWERS, asked first: whether this caller may read a list is what `list`
 * says of that list, sentence and all. With the line in, this is the record's own method.
 */
const learnings = async (r: Made, ctx: CallContext, args: unknown = {}): Promise<Result<Learnings>> => {
  const own = (r.api as unknown as { learnings?: (a: unknown, c: CallContext) => Promise<Result<Learnings>> }).learnings;
  if (typeof own === 'function') return own(args, ctx);
  const closed = new Map<string, Refusal>();
  for (const id of r.api.kernel.registers().keys()) {
    const got = (await r.api.list({ register: id, limit: 1 }, ctx)) as { ok: boolean; refusal?: Refusal };
    if (!got.ok && got.refusal) closed.set(id, got.refusal);
  }
  const deps = {
    kernel: r.api.kernel,
    sql: r.sql,
    clock: r.clock,
    scoped: () => null,
    readable: (_c: CallContext, register: string) => closed.get(register) ?? null,
    no: (code: string, fix: string, more: object = {}) => ({ ok: false, refusal: { code, fix, ...more } }),
  } as unknown as RecordDeps;
  return learningMethods(deps).learnings(args as never, ctx);
};

const WHY = 'Taken off so this file counts only what it wrote.';

/** The seed and the agents add-on, the seed's own learnings taken back, and the clock at `NOW`. */
async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(await installAgentsPack(api.kernel));
  const seeded = value<{ rows: Entry[] }>(await api.list({ register: 'learnings', limit: 50 }, owner)).rows;
  for (const row of seeded) if (row.state === 'active') value(await api.update({ register: 'learnings', seq: row.seq!, patch: { state: 'reverted', why: WHY } }, owner));
  const things = value<{ rows: Entry[] }>(await api.list({ register: 'things', where: { field: 'name', is: 'Portage' } }, owner)).rows[0];
  if (!things) assert.fail('the seed has no Portage');
  clock.set(NOW);
  return { api, sql, clock, portage: `things#${String(things.seq)}` };
}

/** One learning written at an instant, `here` in Portage or everywhere, and the name a person says it by. */
async function learn(r: Made, at: number, lesson: string, kind: 'method' | 'fact', here: boolean, more: Record<string, unknown> = {}): Promise<string> {
  r.clock.set(at);
  const row = value<Entry>(
    await r.api.create(
      { register: 'learnings', fields: { lesson, because: `It went wrong once, and this is the note of how: ${lesson}`, kind, ...(here ? { project: r.portage } : {}), ...more } },
      owner,
    ),
  );
  r.clock.set(NOW);
  return r.api.kernel.nameOf(row.id);
}

const lessons = (got: Learnings): string[] => got.rows.map((row) => row.lesson);

test('METHOD BEFORE FACT, THIS PROJECT BEFORE EVERYWHERE, NEWEST FIRST, each a learning in its own words with where it applies', async () => {
  const r = await record();
  /* Written oldest first, and in an order no part of the answer follows. */
  const names = {
    factWide: await learn(r, NOW - 9 * DAY, 'Money here is whole minor units.', 'fact', false, { topic: 'money' }),
    methodWideOld: await learn(r, NOW - 8 * DAY, 'Attach what a proposal read.', 'method', false),
    factHere: await learn(r, NOW - 7 * DAY, 'Portage invoices carry a reference.', 'fact', true),
    methodHereOld: await learn(r, NOW - 6 * DAY, 'Match a line by its renewal date.', 'method', true, { topic: 'reconcile', confirmed_on: dayOf(NOW - DAY) }),
    methodWideNew: await learn(r, NOW - 5 * DAY, 'Read the whole diff before a review.', 'method', false),
    methodHereNew: await learn(r, NOW - 4 * DAY, 'Run the import twice to prove it holds.', 'method', true),
  };
  /* AN EDIT MOVES NOTHING: the oldest fact is changed last of all, and it is still the last row. */
  const oldest = value<{ rows: Entry[] }>(await r.api.list({ register: 'learnings', where: { field: 'lesson', is: 'Money here is whole minor units.' } }, owner)).rows[0]!;
  value(await r.api.update({ register: 'learnings', seq: oldest.seq!, patch: { topic: 'minor units' } }, owner));

  const got = value<Learnings>(await learnings(r, inPortage));
  assert.deepEqual(
    got.rows.map((row) => row.spoken),
    [names.methodHereNew, names.methodHereOld, names.methodWideNew, names.methodWideOld, names.factHere, names.factWide],
    JSON.stringify(lessons(got)),
  );
  assert.equal(got.truncated, false);
  assert.equal(got.faded, 0);

  for (const row of got.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['because', 'confirmed_on', 'kind', 'lesson', 'made', 'spoken', 'topic', 'where']);
    assert.match(row.spoken, /^LN[1-9][0-9]*$/u, 'a learning is called what a person calls it');
    assert.ok(row.where === 'here' || row.where === 'everywhere', `where is ${String(row.where)}`);
    assert.ok(!JSON.stringify(row).includes(r.portage) && !/[0-9A-HJKMNP-TV-Z]{26}/u.test(JSON.stringify(row)), 'no row id and no handle of a project');
  }
  const held = got.rows[1]!;
  assert.deepEqual(held, {
    spoken: names.methodHereOld,
    lesson: 'Match a line by its renewal date.',
    because: 'It went wrong once, and this is the note of how: Match a line by its renewal date.',
    kind: 'method',
    topic: 'reconcile',
    where: 'here',
    confirmed_on: dayOf(NOW - DAY),
    made: dayOf(NOW - 6 * DAY),
  });
  assert.deepEqual([got.rows[5]!.where, got.rows[5]!.topic, got.rows[5]!.confirmed_on], ['everywhere', 'minor units', null]);

  /* THE COMPARATOR IS THE SAME ONE, handed the kinds in the order the list declares them. */
  const shuffled = [...got.rows].reverse().sort(learnedOrder(['method', 'fact']));
  assert.deepEqual(shuffled.map((row) => row.spoken), got.rows.map((row) => row.spoken));

  /* A RUN PLACED NOWHERE is handed what applies everywhere, and nothing of a project it is not in. */
  const nowhere: CallContext = { ...inPortage, session: { client_id: 'c-9', client: 'claude-code', host: 'mac', repo: 'no-such-place' } };
  const wide = value<Learnings>(await learnings(r, nowhere));
  assert.deepEqual(wide.rows.map((row) => row.spoken), [names.methodWideNew, names.methodWideOld, names.factWide]);
  assert.ok(wide.rows.every((row) => row.where === 'everywhere'));
});

test('FORTY IN ALL BY DEFAULT, AND IT SAYS WHEN THERE ARE MORE; a limit is taken, and one that is no count is refused', async () => {
  const r = await record();
  /* Forty-five standing: fifteen facts here first, then thirty methods everywhere, each a minute after the last. */
  for (let i = 0; i < 45; i++) await learn(r, NOW - DAY + i * MIN, `Standing learning number ${String(i + 1)}.`, i < 15 ? 'fact' : 'method', i < 15);

  const got = value<Learnings>(await learnings(r, inPortage));
  assert.equal(LEARNED_SHOWN, 40);
  assert.equal(got.rows.length, 40);
  assert.equal(got.truncated, true);
  assert.equal(got.rows.filter((row) => row.kind === 'method').length, 30, 'every method is there before any fact is');
  assert.equal(got.rows[0]!.lesson, 'Standing learning number 45.', 'the newest method leads');
  assert.equal(got.rows[30]!.lesson, 'Standing learning number 15.', 'then the newest fact');
  assert.equal(got.rows[39]!.lesson, 'Standing learning number 6.', 'and the oldest five facts are the ones left out');

  const five = value<Learnings>(await learnings(r, inPortage, { limit: 5 }));
  assert.deepEqual(lessons(five), [45, 44, 43, 42, 41].map((n) => `Standing learning number ${String(n)}.`));
  assert.equal(five.truncated, true);

  const all = value<Learnings>(await learnings(r, inPortage, { limit: 45 }));
  assert.deepEqual([all.rows.length, all.truncated], [45, false]);

  for (const limit of [0, -1, 1.5, '5', 100_000]) {
    const no = refusal(await learnings(r, inPortage, { limit }));
    assert.equal(no.code, 'VALUE_MALFORMED', JSON.stringify(limit));
    assert.equal(no.at, 'limit');
  }
});

test('ONE THAT WAS REPLACED, TAKEN BACK OR FADED IS NOT A ROW, and the faded are counted', async () => {
  const r = await record();
  const stands = await learn(r, NOW - 3 * DAY, 'Chase an invoice once its terms have run out.', 'method', true);
  const replaced = await learn(r, NOW - 20 * DAY, 'Chase an invoice at thirty days.', 'method', true);
  const takenBack = await learn(r, NOW - 10 * DAY, 'Never rebase a shared branch.', 'method', false);
  /* A hundred days old and never confirmed: faded. As old and confirmed five days ago: it stands. */
  await learn(r, NOW - 100 * DAY, 'The staging copy has no mail domain.', 'fact', false);
  await learn(r, NOW - 120 * DAY, 'The old importer drops the last line.', 'fact', true);
  const confirmed = await learn(r, NOW - 100 * DAY, 'Proof on paper before the web.', 'method', false);
  /* Confirmed, and that too is more than ninety days ago: faded. */
  await learn(r, NOW - 150 * DAY, 'Export the variable font last of all.', 'method', false, { confirmed_on: dayOf(NOW - 95 * DAY) });

  const seqOf = (spoken: string): number => Number(spoken.replace(/^[A-Z]+/u, ''));
  value(await r.api.update({ register: 'learnings', seq: seqOf(replaced), patch: { state: 'superseded', why: `Replaced by ${stands}, which waits for the terms.` } }, owner));
  value(await r.api.update({ register: 'learnings', seq: seqOf(takenBack), patch: { state: 'reverted', why: 'It was wrong: a rebase before the review is asked for here.' } }, owner));
  value(await r.api.update({ register: 'learnings', seq: seqOf(confirmed), patch: { confirmed_on: dayOf(NOW - 5 * DAY) } }, owner));

  const got = value<Learnings>(await learnings(r, inPortage));
  assert.deepEqual(got.rows.map((row) => row.spoken), [stands, confirmed], JSON.stringify(lessons(got)));
  assert.equal(got.faded, 3);
  assert.equal(got.truncated, false);
  const kept: Learned = got.rows[1]!;
  assert.deepEqual([kept.made, kept.confirmed_on], [dayOf(NOW - 100 * DAY), dayOf(NOW - 5 * DAY)], 'made long ago, and it held last week');

  /* NINETY DAYS TO THE DAY STILL STANDS, and the day after it does not. */
  r.clock.set(NOW + 87 * DAY);
  assert.deepEqual(value<Learnings>(await learnings(r, inPortage)).rows.map((row) => row.spoken), [stands]);
  r.clock.set(NOW + 88 * DAY);
  const later = value<Learnings>(await learnings(r, inPortage));
  assert.deepEqual([later.rows.length, later.faded], [0, 5]);
});

test('A CALLER THE LEARNINGS ARE CLOSED TO IS REFUSED IN THE RECORD\'S OWN SENTENCE, and a record with no such list answers nothing and refuses nobody', async () => {
  const r = await record();
  await learn(r, NOW - DAY, 'Read the whole diff before a review.', 'method', false);

  const said = refusal(await r.api.list({ register: 'learnings' }, shut));
  const no = refusal(await learnings(r, shut));
  assert.deepEqual(no, said, 'the sentence `list` says of that list, and no other');
  assert.equal(no.code, 'FORBIDDEN');
  assert.ok(!JSON.stringify(no).includes('Read the whole diff'), 'and nothing of what is on it');

  /* The owner in a browser, standing in no project, reads what applies everywhere. */
  assert.deepEqual(lessons(value<Learnings>(await learnings(r, owner))), ['Read the whole diff before a review.']);

  /* A RECORD WITH ONE PLAIN LIST AND NO ADD-ON: no list whose rows fade. */
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([{ id: 'register.tasks', kind: 'register', body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } }] as never));
  const bare: Made = { api, sql, clock, portage: '' };
  assert.equal(api.kernel.registers().has('learnings'), false);
  for (const ctx of [owner, inPortage, shut]) assert.deepEqual(value<Learnings>(await learnings(bare, ctx)), { rows: [], truncated: false, faded: 0, replaced: 0 });
});

test('A CALLER LET INTO SOME OF THE LEARNINGS reads those and no others, and the ones kept from it are not counted as faded', async () => {
  const r = await record();
  const method = await learn(r, NOW - 3 * DAY, 'Read the whole diff before a review.', 'method', false);
  await learn(r, NOW - 2 * DAY, 'Money here is whole minor units.', 'fact', false);
  await learn(r, NOW - DAY, 'Portage invoices carry a reference.', 'fact', true);
  /* A fact that has faded is one this caller was never let into, so it is no part of its count. */
  await learn(r, NOW - 100 * DAY, 'The staging copy has no mail domain.', 'fact', false);
  await learn(r, NOW - 100 * DAY, 'Export the variable font last of all.', 'method', false);

  const methodsOnly = { ...inPortage, wheres: { learnings: { field: 'kind', is: 'method' } } } as unknown as CallContext;
  const got = value<Learnings>(await learnings(r, methodsOnly));
  assert.deepEqual(got.rows.map((row) => row.spoken), [method], JSON.stringify(lessons(got)));
  assert.deepEqual([got.truncated, got.faded], [false, 1]);

  /* The same caller with the whole list reads all three that stand. */
  assert.equal(value<Learnings>(await learnings(r, inPortage)).rows.length, 3);
});

test('context HANDS WHAT WAS LEARNED IN THE SAME ORDER, so the twenty a place it keeps are the ones the read leads with', async () => {
  const r = await record();
  /* A method written first and never touched again, then twenty-two facts: by the day last changed it would be cut. */
  await learn(r, NOW - 30 * DAY, 'Run the proof before the release.', 'method', false);
  for (let i = 0; i < 22; i++) await learn(r, NOW - 20 * DAY + i * MIN, `Fact number ${String(i)} of the order test.`, 'fact', false);
  /* FIVE IN THE BRIEF ANSWER AND TWENTY IN THE FULL ONE (AGT-B09), each the ones the read leads with. */
  for (const [format, n] of [['brief', 5], ['full', 20]] as const) {
    const told = value<{ registers: { id: string; inherited: { lesson?: unknown }[] }[] }>(
      await r.api.context({}, format === 'full' ? ({ ...owner, session: { ...(owner as { session?: object }).session, format } } as typeof owner) : owner),
    );
    const handed = (told.registers.find((g) => g.id === 'learnings')?.inherited ?? []).map((row) => row.lesson);
    assert.equal(handed.length, n);
    assert.equal(handed[0], 'Run the proof before the release.');
    assert.equal(handed[1], 'Fact number 21 of the order test.', 'and the newest fact after it');
    assert.deepEqual(handed, lessons(value<Learnings>(await learnings(r, owner, { limit: n }))));
  }
  r.sql.close();
});
