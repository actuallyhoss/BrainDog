/**
 * One lesson learned twice, the cases `learning-promote.test.ts` leaves out (AGT-D15 jobs 2 and 3, built in batch 90 as
 * `learningsTwice` and `promoteLearnings` in `src/methods/learnings.ts`).
 *
 * WHAT IS PINNED HERE. Somebody the learnings are closed to hears nothing: the read is refused, the press is refused,
 * and nothing is filed. Two lessons with no topic are never paired, since the topic is what says two lessons are about
 * one thing. Nothing asks by itself: learning the same thing twice files no question until a person presses, and the
 * one filed is signed by them, never by `system`. A pair said in other words across three projects is read pair by
 * pair, older first.
 *
 * On a real record on a real kernel in memory, the seed and the agents add-on installed as any add-on is, and the
 * seed's own learnings taken back so every row counted is one this wrote. The projects are the seed's invented ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import type { LearnedTwice, Promoted } from '../src/methods/learnings.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';

const DAY = 86_400_000;
const NOW = SEEDED + 200 * DAY;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['tasks'] };

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Door = (a: unknown, c: CallContext) => Promise<unknown>;
type Doors = { learningsTwice: Door; promoteLearnings: Door };
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

/** One learning, made `daysAgo`, in a project of the seed, with a topic or none. */
async function learn(r: Made, daysAgo: number, words: string, topic: string | null, project: string): Promise<Entry> {
  r.clock.set(NOW - daysAgo * DAY);
  const fields: Record<string, unknown> = { lesson: words, because: `It went wrong once: ${words}`, kind: 'method', project: r.at[project] };
  if (topic !== null) fields.topic = topic;
  const row = value<Entry>(await r.api.create({ register: 'learnings', fields }, owner));
  r.clock.set(NOW);
  return row;
}

const asked = (r: Made) => r.sql.all<{ id: string; opened_by: string }>("SELECT id, opened_by FROM suggestion WHERE cause LIKE 'learned-twice#%' ORDER BY opened_at, rowid");

test('SOMEBODY THE LEARNINGS ARE CLOSED TO HEARS NOTHING: the read and the press are refused, and nothing is filed', async () => {
  const r = await record();
  await learn(r, 9, 'Run the import twice to prove it holds.', 'imports', 'Kiln');
  await learn(r, 3, 'Always run imports twice and prove they hold.', 'imports', 'Portage');
  const read = refusal(await r.doors.learningsTwice({}, shut));
  assert.doesNotMatch(read.fix, /Kiln|Portage|import/u, 'the refusal says nothing of what is learned');
  const press = refusal(await r.doors.promoteLearnings({}, shut));
  assert.notEqual(press.code, 'NEEDS_BROWSER_SESSION', 'a person is refused for what they may not see, not for being one');
  assert.doesNotMatch(press.fix, /Kiln|Portage|import/u);
  assert.equal(asked(r).length, 0);
  r.sql.close();
});

test('TWO LESSONS WITH NO TOPIC ARE NEVER PAIRED, though they say the same words in two projects', async () => {
  const r = await record();
  await learn(r, 9, 'Run the import twice to prove it holds.', null, 'Kiln');
  await learn(r, 3, 'Run the import twice to prove it holds.', null, 'Portage');
  assert.deepEqual(value<LearnedTwice>(await r.doors.learningsTwice({}, owner)).pairs, []);
  assert.deepEqual(value<Promoted>(await r.doors.promoteLearnings({}, owner)), { asked: [], open: 0 });
  r.sql.close();
});

test('NOTHING ASKS BY ITSELF: the same lesson twice files nothing until a person presses, and then it is signed by them', async () => {
  const r = await record();
  const bySystem = () => r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system'")!.n;
  const before = bySystem();
  await learn(r, 9, 'Run the import twice to prove it holds.', 'imports', 'Kiln');
  await learn(r, 3, 'Always run imports twice and prove they hold.', 'imports', 'Portage');
  assert.equal(asked(r).length, 0, 'learning it twice asked nothing');
  assert.equal(bySystem(), before, 'nothing more signed by the record');
  value(await r.doors.promoteLearnings({}, owner));
  assert.deepEqual(asked(r).map((q) => q.opened_by), ['p_1'], 'one question, signed by who pressed');
  r.sql.close();
});

test('THREE PROJECTS THAT LEARNED IT are read pair by pair, older first, each naming its two projects and no id', async () => {
  const r = await record();
  await learn(r, 9, 'Run the import twice to prove it holds.', 'imports', 'Kiln');
  await learn(r, 6, 'Always run imports twice and prove they hold.', 'imports', 'Portage');
  await learn(r, 2, 'Run the imports twice, so you prove they hold.', 'Imports', 'Tallow');
  const { pairs } = value<LearnedTwice>(await r.doors.learningsTwice({}, owner));
  assert.ok(pairs.length >= 2, 'every pair of them is read');
  for (const pair of pairs) {
    assert.notEqual(pair.older.project, pair.newer.project);
    assert.equal(pair.question, `${pair.older.project} and ${pair.newer.project} learned the same thing. Keep it once, for everywhere?`);
  }
  assert.equal(pairs[0]!.older.project, 'Kiln', 'the oldest lesson leads');
  assert.ok(!/[0-9A-HJKMNP-TV-Z]{26}|things#|—/u.test(JSON.stringify(pairs)), 'no row id, no handle of a project, no em dash');
  r.sql.close();
});
