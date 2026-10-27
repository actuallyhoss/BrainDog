/**
 * A real heartbeat and the carried day, on the one clock.
 *
 * MEASURED BEFORE: `last_seen` moved when a run wrote and at no other time, so a session that read, thought or edited
 * files for half an hour read as Quiet beside one that had died; and an imported run's age was the import's morning,
 * because `heardAt` fell back to when its row last changed. What is asserted: a beat moves the clock in place and
 * nothing else, at most once a minute, for an open run only; and a run carried in is heard from on its carried day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BEAT_MS, beatRun, heardAt, isStale } from '../src/presence.ts';
import { liveRuns, openRecord, runAge, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([TASKS])).ok);
  return { k, sql, clock };
}

const as = (session: SessionHints): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session });

/** A run's row as the table holds it: its version, when it changed, its `last_seen`, and how many lines its history has. */
function rowOf(sql: ReturnType<typeof openSqlite>, id: string) {
  const r = sql.one<{ version: number; updated_at: string; seen: string | null }>(
    "SELECT version, updated_at, json_extract(fields, '$.last_seen') AS seen FROM entry WHERE id = ?",
    id,
  );
  const events = sql.one<{ n: number }>('SELECT count(*) AS n FROM event WHERE target = ?', `entry:${id}`)?.n ?? 0;
  return { ...r, events };
}

test('A BEAT IS NOT A WRITE: last seen moves to now, and the version, the time the row changed and its history stay', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('tasks', { what: 'Write once' }, as({ client_id: 'long' })).ok);
  const id = k.get('S1')!.id;
  const was = rowOf(sql, id);
  clock.advance(30 * MIN);
  assert.equal(beatRun(sql, id, clock.now()), true);
  const now = rowOf(sql, id);
  assert.equal(now.seen, iso(clock.now()));
  assert.deepEqual([now.version, now.updated_at, now.events], [was.version, was.updated_at, was.events]);
  /* NO SECOND RUN: a beat opens nothing. */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'session'")?.n, 1);
  sql.close();
});

test('ONCE A MINUTE AT MOST: a beat inside a minute of the last moves nothing and says so', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('tasks', { what: 'Busy' }, as({ client_id: 'busy' })).ok);
  const id = k.get('S1')!.id;
  clock.advance(BEAT_MS - 1);
  assert.equal(beatRun(sql, id, clock.now()), false);
  assert.equal(rowOf(sql, id).seen, iso(NOW));
  clock.advance(1);
  assert.equal(beatRun(sql, id, clock.now()), true);
  assert.equal(rowOf(sql, id).seen, iso(NOW + BEAT_MS));
  sql.close();
});

test('A BEAT REVIVES NOTHING: idle moves, and an ended, handed off or written off run stays where it stopped', async () => {
  const { k, sql, clock } = await record();
  for (const c of ['a', 'b', 'c', 'd']) assert.ok(k.create('tasks', { what: `Run ${c}` }, as({ client_id: c })).ok);
  const states = ['idle', 'done', 'handoff', 'abandoned'];
  states.forEach((state, i) => assert.ok(k.update('session', `S${String(i + 1)}`, { state }, { actor: 'p_owner' }).ok, state));
  clock.advance(10 * MIN);
  const moved = states.map((_, i) => beatRun(sql, k.get(`S${String(i + 1)}`)!.id, clock.now()));
  assert.deepEqual(moved, [true, false, false, false]);
  assert.deepEqual(states.map((_, i) => k.get(`S${String(i + 1)}`)!.state), states);
  sql.close();
});

test('A BEAT STARTS NO CLOCK: a run carried in with no last seen stays from before, and an unknown id moves nothing', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('tasks', { what: 'Carried' }, as({ client_id: 'carried' })).ok);
  const id = k.get('S1')!.id;
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.last_seen') WHERE id = ?", id);
  clock.advance(10 * MIN);
  assert.equal(beatRun(sql, id, clock.now()), false);
  assert.equal(rowOf(sql, id).seen, null);
  assert.equal(beatRun(sql, 'no-such-run', clock.now()), false);
  sql.close();
});

test('THE CARRIED DAY IS WHEN IT WAS HEARD FROM: last seen first, then seen before, then when the row changed', () => {
  const changed = iso(NOW);
  const before = iso(NOW - 10 * 24 * 60 * MIN);
  assert.equal(heardAt({ fields: { last_seen: iso(NOW - MIN), seen_before: before }, updated_at: changed }), NOW - MIN);
  assert.equal(heardAt({ fields: { seen_before: before }, updated_at: changed }), Date.parse(before));
  assert.equal(heardAt({ fields: {}, updated_at: changed }), NOW);
  /* So a run carried in this morning, last seen ten days ago, is stale and not offered as company, and its age stops
     at its carried day rather than running to the clock. */
  const carried = { state: 'active', fields: { state: 'active', seen_before: before }, created_at: changed, updated_at: changed };
  assert.equal(isStale(carried, NOW), true);
  assert.equal(runAge(carried, NOW + 60 * MIN), 0);
});

test('A RUN CARRIED IN IS NO COMPANY: the live runs read its carried day, not the morning it was imported', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('tasks', { what: 'Here' }, as({ client_id: 'here' })).ok);
  assert.ok(k.create('tasks', { what: 'Carried' }, as({ client_id: 'carried' })).ok);
  sql.exec(
    "UPDATE entry SET fields = json_set(json_remove(fields, '$.last_seen'), '$.seen_before', ?) WHERE id = ?",
    iso(NOW - 3 * 24 * 60 * MIN),
    k.get('S2')!.id,
  );
  assert.deepEqual(liveRuns(sql, NOW).map((r) => `S${String(r.seq)}`), ['S1']);
  sql.close();
});

test('A CARRIED DAY AHEAD OF THE CLOCK READS AS THE DAY IT WAS CARRIED: an adapter running fast keeps no run fresh', async () => {
  const { k, sql, clock } = await record();
  const ahead = iso(NOW + 30 * 24 * 60 * MIN);
  assert.ok(k.create('session', { doing: 'From the future', state: 'active', last_seen: ahead }, { actor: 'p_owner' }).ok);
  const row = k.get('S1')!;
  assert.equal(row.fields.seen_before, ahead);
  assert.equal(heardAt(row), Date.parse(row.updated_at));
  clock.advance(3 * 24 * 60 * MIN);
  assert.equal(isStale(row, clock.now()), true);
  assert.deepEqual(liveRuns(sql, clock.now()), []);
  sql.close();
});
