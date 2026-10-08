/**
 * Migration 28's three data steps (AGT-C04), run from the hourly sweep 200 runs at a time.
 *
 * MEASURED BEFORE: about 740 of the 752 runs on the owner's record read abandoned, because the end hook wrote idle and
 * the sweep wrote every closed session off twelve hours later. What is asserted: a run whose newest state line is the
 * sweep's own idle-to-abandoned move is done, one the sweep took while active stays abandoned, each run's writes are
 * counted from the log without its opening, attaching and coming back, its step's time is read from the newest line
 * that set it, all in place, and a page of 200 at a time until every run is through.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RUNS_PAGE, runsDataSteps } from '../src/migrations/0028_runs.ts';
import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number): string => new Date(ms).toISOString();

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const as = (session: SessionHints): WriteContext => ({ actor: 'agent:claude', principal: { kind: 'token', token: 't_1' }, session });
const ok = (r: { ok: boolean }): void => assert.ok(r.ok, JSON.stringify(r));

/** Every run as a record before migration 28 held it: none of the fields the data steps fill. */
const asBefore28 = (sql: NodeSql): void =>
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.wrote', '$.next_at', '$.stretch_at') WHERE register = 'session'");

const rows = (sql: NodeSql) =>
  sql.all<{ seq: number; state: string; version: number; updated_at: string; fields: string }>(
    "SELECT seq, state, version, updated_at, fields FROM entry WHERE register = 'session' ORDER BY seq",
  );

test('THE THREE STEPS: closed sessions the sweep took are done, one it took mid-work is not, and writes and steps are counted from the log, in place', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  ok(await k.install([TASKS]));

  /* S1 works twice, leaves a step, rests (the old end hook), and is swept. */
  ok(k.create('tasks', { what: 'One' }, as({ client_id: 'closed' })));
  ok(k.create('tasks', { what: 'Two' }, as({ client_id: 'closed' })));
  /* Past the three minutes in which a row's own edits fold into the line that made it. */
  clock.advance(5 * MIN);
  ok(k.update('session', 'S1', { next: 'Ship it' }, as({ client_id: 'closed' })));
  ok(k.update('session', 'S1', { state: 'idle' }, as({ client_id: 'closed' })));
  /* S2 works once and goes silent mid-work. */
  ok(k.create('tasks', { what: 'Three' }, as({ client_id: 'crashed' })));
  /* S3 is opened for an attach and never writes. */
  ok(k.runFor(as({ client_id: 'attached' }), 'opened: attach'));
  asBefore28(sql);

  clock.advance(13 * HOUR);
  for (const [s, to] of [['S1', 'abandoned'], ['S2', 'abandoned']] as const)
    ok(k.update('session', s, { state: to }, { actor: 'system', note: 'Nothing heard from this run in twelve hours.' }));
  const before = rows(sql);
  const lines = sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n;

  assert.equal(runsDataSteps(sql), 3);
  const after = rows(sql);
  assert.deepEqual(after.map((r) => r.state), ['done', 'abandoned', 'active']);
  const f = after.map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  /* S1: two tasks, its step and its rest, by its own name; its opening is not counted. */
  assert.deepEqual([f[0]!.wrote, f[1]!.wrote, f[2]!.wrote], [4, 1, 0]);
  assert.deepEqual([f[0]!.next_at, f[1]!.next_at, f[2]!.next_at], [iso(NOW + 5 * MIN), undefined, undefined]);
  assert.equal(f[0]!.state, 'done', 'the state field and its column disagree');
  /* IN PLACE: no version, no `updated_at`, no line. */
  assert.deepEqual(after.map((r) => [r.version, r.updated_at]), before.map((r) => [r.version, r.updated_at]));
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n, lines);

  /* ONCE: every run is through, so the next hour finds nothing. */
  assert.equal(runsDataSteps(sql), 0);
  sql.close();
});

test('A PAGE OF 200 AN HOUR, from the hourly sweep, until every run has had them, and a run opened now never needs them', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  /* 205 runs as an older record holds them, made by hand. */
  for (let i = 0; i < 205; i++) ok(k.create('session', { doing: `Run ${String(i + 1)}` }, { actor: 'p_owner' }));
  asBefore28(sql);
  assert.equal(RUNS_PAGE, 200);

  const waiting = (): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session' AND json_extract(fields, '$.wrote') IS NULL")!.n;
  const sweep = async (): Promise<void> => {
    sql.exec(
      `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'purge', 'sweep', '{}', 'pending', 0)
       ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, state = 'pending'`,
      `01J000000000000000000000${String(clock.now()).slice(-2)}`,
      iso(clock.now()),
    );
    await k.drain();
  };
  await sweep();
  assert.equal(waiting(), 5);
  clock.advance(HOUR);
  await sweep();
  assert.equal(waiting(), 0);

  /* A run the ladder opens now carries its count from its first write. */
  ok(k.create('session', { doing: 'By hand' }, { actor: 'p_owner' }));
  ok(await k.install([TASKS]));
  ok(k.create('tasks', { what: 'New' }, as({ client_id: 'new' })));
  assert.equal(k.get('S207')?.fields.wrote, 1);
  sql.close();
});
