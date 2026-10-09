/**
 * A session saying it is still working (AGT-C03, `kernel.heartbeat`): its own run's clock moves, and nothing else does.
 *
 * MEASURED BEFORE: `last_seen` moved only when a run wrote, so a session that read and thought for twenty minutes read
 * as Quiet on the Agents page beside one that had died. What is asserted is what the page and the history read after a
 * beat: the run is heard from now, its version, `updated_at` and history are as they were, nothing is opened for a
 * session that never wrote, another key's run is never moved, and a door mark of a call beats too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;

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

const as = (session: SessionHints, token = 't_1'): WriteContext => ({ actor: 'agent:claude', principal: { kind: 'token', token }, session });
const runs = (sql: NodeSql): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n;
const row = (sql: NodeSql, seq: number) => {
  const r = sql.one<{ id: string; fields: string; version: number; updated_at: string }>(
    "SELECT id, fields, version, updated_at FROM entry WHERE register = 'session' AND seq = ?",
    seq,
  )!;
  const lines = sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event WHERE target = ?', `entry:${r.id}`)!.n;
  return { lastSeen: (JSON.parse(r.fields) as { last_seen?: string }).last_seen, version: r.version, updated: r.updated_at, lines };
};

test('A BEAT MOVES THE RUN\'S CLOCK AND NOTHING ELSE: no event, no version, no updated_at', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-1' })).ok);
  const before = row(sql, 1);
  clock.advance(20 * MIN);
  assert.equal(k.heartbeat(as({ client_id: 'cc-1' })), 'S1');
  const after = row(sql, 1);
  assert.equal(after.lastSeen, new Date(NOW + 20 * MIN).toISOString(), 'the run was not heard from');
  assert.deepEqual([after.version, after.updated, after.lines], [before.version, before.updated, before.lines]);
  assert.equal(runs(sql), 1);
  sql.close();
});

test('A BEAT OPENS NOTHING: a session that never wrote has no run, and a person is never one', async () => {
  const { k, sql } = await record();
  assert.equal(k.heartbeat(as({ client_id: 'cc-never' })), null);
  assert.equal(k.heartbeat({ actor: 'p_owner' }), null);
  assert.equal(runs(sql), 0, 'a beat opened a run');
  sql.close();
});

test('A BEAT IS THE CALLER\'S OWN: another key naming the run moves nothing; an ended run stays where it stopped', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-1' })).ok);
  const before = row(sql, 1).lastSeen;
  clock.advance(20 * MIN);
  assert.equal(k.heartbeat(as({ client_id: 'cc-1' }, 't_other')), null);
  assert.equal(row(sql, 1).lastSeen, before, 'another key moved the run');

  assert.ok(k.endRun(as({ client_id: 'cc-1' }), {}).ok);
  const ended = row(sql, 1);
  clock.advance(20 * MIN);
  assert.equal(k.heartbeat(as({ client_id: 'cc-1' })), null);
  assert.equal(row(sql, 1).lastSeen, ended.lastSeen, 'an ended run was woken');
  sql.close();
});

test('A CALL MARKED AT THE DOOR IS A BEAT TOO, and a hello is not', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-1' })).ok);
  const before = row(sql, 1);
  clock.advance(20 * MIN);
  assert.ok(k.heard(as({ client_id: 'cc-1' }), { kind: 'hello' }).ok);
  assert.equal(row(sql, 1).lastSeen, before.lastSeen, 'a hello moved the run');
  assert.ok(k.heard(as({ client_id: 'cc-1' }), { kind: 'called' }).ok);
  const after = row(sql, 1);
  assert.equal(after.lastSeen, new Date(NOW + 20 * MIN).toISOString(), 'a call did not beat');
  assert.deepEqual([after.version, after.lines], [before.version, before.lines]);
  sql.close();
});
