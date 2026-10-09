/**
 * A step is reached only from its place, and a step whose left time does not parse still ages (`src/handoff.ts`).
 *
 * Before this any agent key could take or drop another project's next step, since `take` and `drop` checked no place;
 * and a `next_at` that did not parse read as age 0, so the step was `next` for good and the sweep never closed it.
 *
 * On the real kernel and `node:sqlite`, with the writes sent through the write path as the record sends them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drop, expire, inPlace, openHandoffs, runPlace, take, type HandoffPlace, type HandoffWrite, type RunRow } from '../src/handoff.ts';
import { openRecord, type Declaration, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;
const DAY = 86_400_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const REPO = 'braindog';
const as = (client_id: string): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', repo: REPO },
});
const ok = (r: { ok: boolean }): void => assert.ok(r.ok, JSON.stringify(r));
const refusal = (r: unknown): { code?: string; fix?: string } => (r as { refusal?: { code?: string; fix?: string } }).refusal ?? {};

/** Places a run in a project, as the record does when it resolves one. */
const placeIn = (sql: NodeSql, id: string, project: string): void => {
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.project', ?) WHERE id = ?", project, id);
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  ok(await k.install([TASKS]));
  const write: HandoffWrite = (id, c) =>
    k.update('session', id, c.state ? { state: c.state } : {}, {
      actor: c.actor,
      cascade: false,
      stamp: c.stamp,
      ...(c.note === null ? {} : { note: c.note }),
    });
  const row = (spoken: string) => {
    const got = k.get(spoken)!;
    return { id: got.id, state: got.state, fields: got.fields };
  };
  const work = (client: string) => {
    ok(k.create('tasks', { what: `Work of ${client}` }, as(client)));
    const run = k.findRun({ client_id: client }, 't_1')!;
    return { id: run.id, spoken: `S${String(run.seq)}` };
  };
  const leave = (client: string, next: string) => {
    const run = work(client);
    ok(k.update('session', run.spoken, { next }, as(client)));
    ok(k.endRun(as(client), {}));
    return run;
  };
  return { k, sql, clock, write, row, work, leave };
}

const OWNER: WriteContext = { actor: 'p_owner', principal: { kind: 'person' } };

test('IN PLACE: the rule placeSql holds in SQL, the project first, else the repository, nowhere holds nothing', () => {
  const run = (fields: Record<string, string>) => ({ fields });
  assert.equal(inPlace({ project: 'A', repo: REPO }, run({ project: 'A', repo: 'other' })), true);
  assert.equal(inPlace({ project: 'A', repo: REPO }, run({ project: 'B', repo: REPO })), false, 'another project in the same repository');
  assert.equal(inPlace({ project: 'A', repo: REPO }, run({ repo: REPO })), true, 'a run naming no project but this repository');
  assert.equal(inPlace({ project: 'A', repo: REPO }, run({ project: '', repo: REPO })), true);
  assert.equal(inPlace({ project: 'A' }, run({ repo: REPO })), false);
  assert.equal(inPlace({ repo: REPO }, run({ project: 'B', repo: REPO })), true);
  assert.equal(inPlace({}, run({ project: 'A', repo: REPO })), false, 'a caller who is nowhere reaches nothing');
  assert.equal(inPlace({ project: 'A', repo: REPO }, { fields: { project: 7, repo: REPO } }), false, 'a project that is not text is not no project');
  assert.equal(inPlace({ project: 'A', repo: REPO }, { fields: { project: null, repo: REPO } }), true);
});

test('ANOTHER PROJECT: a key placed in A cannot take or drop a step left in B, and learns nothing of it', async () => {
  const { sql, clock, write, row, work, leave } = await record();
  const s1 = leave('claude', 'Ship the invoice page');
  placeIn(sql, s1.id, 'B');
  clock.advance(5 * MIN);
  const s2 = work('codex');
  placeIn(sql, s2.id, 'A');
  const here: HandoffPlace = { project: 'A', repo: REPO };
  const may = (run: RunRow): boolean => inPlace(here, run);

  assert.deepEqual(openHandoffs(sql, here, s2.id, clock.now()), [], 'the step is not offered in A');
  const missing = take(sql, s2, 'S999', clock.now(), write, may);
  const took = take(sql, s2, s1.spoken, clock.now(), write, may);
  assert.equal(took.ok, false);
  assert.deepEqual(refusal(took), { ...refusal(missing), fix: `There is no run called ${s1.spoken} here. Name one of the open steps.` });
  assert.equal(refusal(took).code, 'ROW_UNKNOWN');
  const byId = take(sql, s2, s1.id, clock.now(), write, may);
  assert.equal(refusal(byId).code, 'ROW_UNKNOWN', 'its id reaches it no better than its name');

  const dropped = drop(sql, 'agent:codex', s1.spoken, 'Already shipped', clock.now(), write, may);
  assert.equal(refusal(dropped).code, 'ROW_UNKNOWN');
  assert.equal(refusal(dropped).fix, refusal(took).fix);
  assert.equal(row(s1.spoken).state, 'handoff', 'the step in B is still open');
  assert.equal(row(s2.spoken).fields.took, undefined);

  /* A run in B takes it as before. */
  const s3 = work('cursor');
  placeIn(sql, s3.id, 'B');
  /* Its place read from its own run, as the record builds a taker's `may`. */
  const at = runPlace(row(s3.spoken));
  assert.deepEqual(at, { project: 'B', repo: REPO });
  const theirs = take(sql, s3, s1.spoken, clock.now(), write, (run) => inPlace(at, run));
  ok(theirs);
  assert.equal(row(s1.spoken).fields.taken_by, s3.spoken);
  sql.close();
});

test('A PERSON: no place holds them, so a person drops a step in any project, and takes none, as before', async () => {
  const { k, sql, clock, row, leave } = await record();
  const s1 = leave('claude', 'Ship the invoice page');
  placeIn(sql, s1.id, 'B');
  clock.advance(MIN);
  const s2 = leave('codex', 'Rename the export');
  placeIn(sql, s2.id, 'A');
  assert.equal(refusal(k.takeHandoff(OWNER, s1.spoken)).code, 'FORBIDDEN', 'a person is never a run, so takes nothing');
  ok(k.dropHandoff(OWNER, s1.spoken, 'Already shipped'));
  ok(k.dropHandoff(OWNER, s2.id, 'No longer true'));
  assert.equal(row(s1.spoken).fields.closed_as, 'dropped');
  assert.equal(row(s2.spoken).fields.closed_as, 'dropped');
  sql.close();
});

test('A BAD TIME: a step whose next_at does not parse reads earlier, never next, and the sweep still closes it', async () => {
  const { sql, clock, write, row, work, leave } = await record();
  const s1 = leave('claude', 'Rename the export');
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.next_at', 'sometime soon') WHERE id = ?", s1.id);
  clock.advance(MIN);
  const s2 = work('codex');

  const open = openHandoffs(sql, { repo: REPO }, s2.id, clock.now());
  assert.deepEqual(open.map((h) => [h.spoken, h.mark]), [[s1.spoken, 'earlier']]);
  assert.ok(open[0]!.age_s >= 7 * 86_400, 'its age is never under seven days');

  clock.advance(29 * DAY);
  assert.equal(expire(sql, clock.now(), write), 0, 'under thirty days from its last change it stays open');
  assert.equal(row(s1.spoken).state, 'handoff');
  clock.advance(DAY);
  assert.equal(expire(sql, clock.now(), write), 1);
  assert.equal(row(s1.spoken).state, 'done');
  assert.equal(row(s1.spoken).fields.closed_as, 'expired');
  sql.close();
});
