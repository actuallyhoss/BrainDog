/**
 * One lesson learned twice (`src/learning-promote.ts`, and `learningsTwice` and `promoteLearnings` in
 * `src/methods/learnings.ts`, AGT-D15 jobs 2 and 3): two active learnings in two projects, the same topic, four words
 * in five shared once folded, are one lesson, offered on a person's press as one question that keeps it once for
 * everywhere.
 *
 * The rule first, pure; then both methods on a real record on a real kernel in memory, with the seed and the agents
 * add-on installed as any add-on is, and the seed's own learnings taken back so every row counted is one this wrote.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { PROMOTED_WHY, foldWords, promotionQuestion, promotionsFor, type Lesson } from '../src/learning-promote.ts';
import { TWICE_OPEN_MOST, type LearnedTwice, type Promoted } from '../src/methods/learnings.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';

/* ── the rule, pure ───────────────────────────────────────────────────────────────────────────────────────────── */

const lesson = (id: string, words: string, topic: string | null, made: string, active = true): Lesson => ({ id, lesson: words, topic, active, made });
const projects: Record<string, string> = { a1: 'pA', a2: 'pB', b1: 'pA', b2: 'pB', c1: 'pA', c2: 'pA' };
const projectOf = (l: Lesson): string | null => projects[l.id] ?? null;

test('FOUR WORDS IN FIVE PAIR, older first; three in five, one project, two topics, a finished one and one everywhere do not', () => {
  /* Five words that count each: "run", "import", "twice", "prove", "hold". The second says four of them. */
  const rows = [
    lesson('a2', 'Always run imports twice and prove they hold.', ' Imports ', '2026-10-02T00:00:00.000Z'),
    lesson('a1', 'Run the import twice to prove it holds.', 'imports', '2026-10-01T00:00:00.000Z'),
  ];
  const pairs = promotionsFor(rows, projectOf);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]!.older.id, 'a1', 'the older row is first');
  assert.equal(pairs[0]!.newer.id, 'a2');
  assert.equal(pairs[0]!.of, 5);
  assert.ok(pairs[0]!.shared >= 4);

  const four = [lesson('b1', 'Run the import twice to prove it holds.', 't', '2026-10-01'), lesson('b2', 'Run the import twice to prove nothing.', 't', '2026-10-02')];
  assert.equal(promotionsFor(four, projectOf).length, 1, 'four of five pair');
  const three = [lesson('b1', 'Run the import twice to prove it holds.', 't', '2026-10-01'), lesson('b2', 'Run the import twice, check totals.', 't', '2026-10-02')];
  assert.equal(promotionsFor(three, projectOf).length, 0, 'three of five do not');
  const one = [lesson('c1', 'Run the import twice to prove it holds.', 't', '2026-10-01'), lesson('c2', 'Run the import twice to prove it holds.', 't', '2026-10-02')];
  assert.equal(promotionsFor(one, projectOf).length, 0, 'one project is not two');
  const topics = [lesson('a1', 'Run the import twice to prove it holds.', 'imports', '2026-10-01'), lesson('a2', 'Run the import twice to prove it holds.', 'money', '2026-10-02')];
  assert.equal(promotionsFor(topics, projectOf).length, 0, 'two topics are two lessons');
  const finished = [lesson('a1', 'Run the import twice to prove it holds.', 't', '2026-10-01'), lesson('a2', 'Run the import twice to prove it holds.', 't', '2026-10-02', false)];
  assert.equal(promotionsFor(finished, projectOf).length, 0, 'a finished one is not paired');
  const wide = [lesson('a1', 'Run the import twice to prove it holds.', 't', '2026-10-01'), lesson('zz', 'Run the import twice to prove it holds.', 't', '2026-10-02')];
  assert.equal(promotionsFor(wide, projectOf).length, 0, 'one already everywhere is not paired');
  assert.deepEqual([...foldWords('The Imports, ALWAYS.')], ['import'], 'case, plurals and small words folded');
});

test('THE QUESTION names both projects and writes the four parts under it, with no id and no em dash', () => {
  const [pair] = promotionsFor(
    [lesson('a1', 'Run the import twice to prove it holds', 'imports', '2026-10-01'), { ...lesson('a2', 'Always run imports twice and prove they hold.', 'imports', '2026-10-02'), because: 'An import ran once and doubled a month of lines.' }],
    projectOf,
  );
  const asked = promotionQuestion(pair!, (p) => (p === 'pA' ? 'Kiln' : 'Oxbow.gg'));
  assert.equal(asked.question, 'Kiln and Oxbow.gg learned the same thing. Keep it once, for everywhere?');
  assert.equal(asked.parts.length, 4);
  assert.match(asked.parts[0], /^It changes what a session does: Run the import twice to prove it holds\.$/u);
  assert.match(asked.parts[1], /Kiln and Oxbow\.gg each learned it/u);
  assert.match(asked.parts[2], /doubled a month of lines\.$/u);
  assert.match(asked.parts[3], /no other home/u);
  for (const said of [asked.question, ...asked.parts]) assert.ok(!/[—]|pA|pB|a1|a2/u.test(said), said);
  assert.equal(PROMOTED_WHY, 'The same lesson, kept once for everywhere');
});

/* ── both methods, on a real record ───────────────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const NOW = SEEDED + 200 * DAY;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const token: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c-1', client: 'claude-code', host: 'mac', repo: 'portage' },
};
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['tasks'] };

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Doors = {
  learningsTwice: (a: unknown, c: CallContext) => Promise<unknown>;
  promoteLearnings: (a: unknown, c: CallContext) => Promise<unknown>;
  undo: (a: unknown, c: CallContext) => Promise<unknown>;
};
type Made = { api: Api; doors: Doors; sql: ReturnType<typeof openSqlite>; clock: ReturnType<typeof fixedClock>; at: Record<string, string> };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (out: unknown): Refusal => {
  const x = out as { ok: boolean; refusal?: Refusal };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(await installAgentsPack(api.kernel));
  const seeded = value<{ rows: Entry[] }>(await api.list({ register: 'learnings', limit: 50 }, owner)).rows;
  for (const row of seeded)
    if (row.state === 'active') value(await api.update({ register: 'learnings', seq: row.seq!, patch: { state: 'reverted', why: 'Taken off so this file counts only what it wrote.' } }, owner));
  const at: Record<string, string> = {};
  for (const name of ['Kiln', 'Portage', 'Tallow']) {
    const row = value<{ rows: Entry[] }>(await api.list({ register: 'things', where: { field: 'name', is: name } }, owner)).rows[0];
    if (!row) assert.fail(`the seed has no ${name}`);
    at[name] = `things#${String(row.seq)}`;
  }
  clock.set(NOW);
  return { api, doors: api as unknown as Doors, sql, clock, at };
}

/** One learning, made `daysAgo`, in a project of the seed, and its row. */
async function learn(r: Made, daysAgo: number, words: string, topic: string, project: string): Promise<Entry> {
  r.clock.set(NOW - daysAgo * DAY);
  const row = value<Entry>(
    await r.api.create({ register: 'learnings', fields: { lesson: words, because: `It went wrong once, and this is how: ${words}`, kind: 'method', topic, project: r.at[project] } }, owner),
  );
  r.clock.set(NOW);
  return row;
}

const openOnes = (r: Made) => r.sql.all<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND cause LIKE 'learned-twice#%' ORDER BY opened_at, rowid");
const now = (r: Made, id: string): Entry => r.api.kernel.get(id)!;
/** What the newer row's state was after the Undo, for the test after it. */
let stateAfterUndo: string | null = null;

test('LEARNED TWICE: the pair is read by name, asked once on a press, accepted as quoted, and one Undo takes it back', async () => {
  const r = await record();
  const older = await learn(r, 9, 'Run the import twice to prove it holds.', 'imports', 'Kiln');
  const newer = await learn(r, 3, 'Always run imports twice and prove they hold.', 'Imports', 'Portage');
  await learn(r, 2, 'Check the totals before a release goes.', 'imports', 'Tallow');

  const twice = value<LearnedTwice>(await r.doors.learningsTwice({}, owner));
  assert.equal(twice.pairs.length, 1);
  assert.equal(twice.truncated, false);
  const pair = twice.pairs[0]!;
  assert.deepEqual(pair.older, { spoken: r.api.kernel.nameOf(older.id), lesson: older.fields.lesson, project: 'Kiln' });
  assert.equal(pair.newer.project, 'Portage');
  assert.equal(pair.question, 'Kiln and Portage learned the same thing. Keep it once, for everywhere?');
  assert.ok(!/[0-9A-HJKMNP-TV-Z]{26}|things#/u.test(JSON.stringify(twice)), 'no row id and no handle of a project');
  assert.equal(value<LearnedTwice>(await r.doors.learningsTwice({}, token)).pairs.length, 1, 'an agent may read it');
  assert.ok(refusal(await r.doors.learningsTwice({}, shut)).code, 'a caller the list is closed to is refused');

  /* A KEY NEVER ASKS IT, and nothing is filed. */
  assert.equal(refusal(await r.doors.promoteLearnings({}, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(openOnes(r).length, 0);

  assert.deepEqual(value<Promoted>(await r.doors.promoteLearnings({}, owner)), { asked: [{ said: pair.question, opened: true }], open: 1 });
  assert.deepEqual(value<Promoted>(await r.doors.promoteLearnings({}, owner)), { asked: [], open: 1 }, 'asked twice is asked once');
  const [open] = openOnes(r);
  assert.equal(r.api.kernel.question(open!.id), pair.question);
  const body = JSON.parse(open!.body) as { context: string };
  assert.equal(body.context.split('\n').length, 4, 'the four parts are written under it');
  assert.equal(r.sql.one<{ opened_by: string }>('SELECT opened_by FROM suggestion WHERE id = ?', open!.id)!.opened_by, 'p_1', 'signed by who pressed, never system');

  value(await r.api.decide({ id: open!.id, decide: { option: 'accept', reason: 'Yes, everywhere.' } }, owner));
  assert.equal(now(r, older.id).fields.project ?? null, null, 'the older one holds everywhere');
  assert.equal(now(r, older.id).state, 'active');
  assert.equal(now(r, newer.id).state, 'superseded');
  assert.equal(now(r, newer.id).fields.why, PROMOTED_WHY);
  assert.equal(value<LearnedTwice>(await r.doors.learningsTwice({}, owner)).pairs.length, 0, 'nothing is learned twice now');
  /* A SESSION IN A THIRD PROJECT is handed it, as one that holds everywhere, and not the replaced copy. */
  const inTallow: CallContext = { ...token, session: { client_id: 'c-2', client: 'claude-code', host: 'mac', repo: 'tallow' } };
  const handed = value<{ rows: { lesson: string; where: string }[] }>(await (r.api as unknown as { learnings: Doors['undo'] }).learnings({}, inTallow)).rows;
  assert.deepEqual(handed.filter((l) => /import/u.test(l.lesson)), [{ ...handed.find((l) => l.lesson === older.fields.lesson)!, where: 'everywhere' }]);

  /* ONE UNDO takes the decision back: where it applies, the reason, and the state too, since undoing the decision that
     moved it is deciding (`undo.ts`). */
  const decision = r.sql.one<{ id: string }>("SELECT id FROM decision WHERE decided_by = 'p_1' ORDER BY rowid DESC LIMIT 1")!.id;
  const plan = value<{ hash: string; steps: unknown[] }>(await r.doors.undo({ decision, dry: true }, owner));
  assert.equal(plan.steps.length >= 2, true, 'both rows are in the one plan');
  value(await r.doors.undo({ decision, hash: plan.hash }, owner));
  assert.equal(now(r, older.id).fields.project, r.api.kernel.get(r.at.Kiln!)!.id, 'the older one is back in Kiln');
  assert.equal(now(r, newer.id).fields.why ?? null, null, 'the reason is taken back');
  stateAfterUndo = now(r, newer.id).state;
  /* A WHOLE UNDO OF A DECISION PUTS ITS QUESTION BACK IN DECIDE (the kernel's rule), so the pair is open there once
     again, and a press files no second question for it. */
  assert.deepEqual(value<Promoted>(await r.doors.promoteLearnings({}, owner)), { asked: [], open: 1 }, 'a pair asked once is not asked again');
  assert.equal(openOnes(r)[0]?.id, open!.id, 'the question back in Decide is the one that was asked');
});

test('ONE UNDO also puts the newer one back in use', () => {
  assert.equal(stateAfterUndo, 'active');
});

test('A NO IS KEPT, and no more than five wait at once', async () => {
  const r = await record();
  await learn(r, 9, 'Read the whole diff before a review starts.', 'review', 'Kiln');
  await learn(r, 8, 'Read the whole diff before any review starts.', 'review', 'Tallow');
  value(await r.doors.promoteLearnings({}, owner));
  const [asked] = openOnes(r);
  value(await r.api.decide({ id: asked!.id, decide: { option: 'reject', reason: 'They differ.' } }, owner));
  assert.deepEqual(value<Promoted>(await r.doors.promoteLearnings({}, owner)), { asked: [], open: 0 }, 'a pair he declined is never asked again');

  for (let i = 0; i < TWICE_OPEN_MOST + 2; i += 1) {
    const words = `Tag release ${i} build ${i} before shipping it.`;
    await learn(r, 7, words, `release ${i}`, 'Kiln');
    await learn(r, 6, words, `release ${i}`, 'Portage');
  }
  const five = value<Promoted>(await r.doors.promoteLearnings({}, owner));
  assert.equal(five.asked.length, TWICE_OPEN_MOST);
  assert.equal(five.open, TWICE_OPEN_MOST);
  assert.ok(five.asked.every((a) => a.said === 'Kiln and Portage learned the same thing. Keep it once, for everywhere?' && a.opened));
  assert.deepEqual(value<Promoted>(await r.doors.promoteLearnings({}, owner)), { asked: [], open: TWICE_OPEN_MOST });
});
