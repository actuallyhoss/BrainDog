/**
 * A run ends once (AGT-C04, `endRun`): the kernel's half of the end hook's call, which the record's `end` passes on.
 *
 * MEASURED BEFORE: the end hook wrote idle, and twelve hours later the sweep wrote off every session that had closed
 * normally. About 740 of the 752 runs on the owner's record read abandoned. What is asserted is what the Agents page
 * reads the next day: a session that closed with nothing left is done, one that left a fresh step waits for the next
 * session, its helpers end with it, a second end changes nothing, and no run is opened only to be ended.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;

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

type Ended = { run: string; state: string; changed: boolean };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const runs = (sql: NodeSql): number[] => sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' ORDER BY seq").map((r) => r.seq);
const lastNote = (sql: NodeSql, id: string): string | null =>
  sql.one<{ note: string | null }>("SELECT note FROM event WHERE target = ? AND kind = 'state' ORDER BY ts DESC, id DESC LIMIT 1", `entry:${id}`)?.note ?? null;
const lines = (sql: NodeSql, id: string): number => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event WHERE target = ?', `entry:${id}`)!.n;

test('A SESSION THAT CLOSES WITH NOTHING LEFT IS DONE, ONCE: the note says where it stopped, and a second end changes nothing', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-1' })));
  clock.advance(20 * MIN);
  const first = value<Ended>(k.endRun(as({ client_id: 'cc-1' }), { branch: 'main', head: 'a1b2c3d' }));
  assert.deepEqual(first, { run: 'S1', state: 'done', changed: true });
  const s1 = k.get('S1')!;
  assert.deepEqual([s1.state, s1.fields.branch, s1.fields.head], ['done', 'main', 'a1b2c3d']);
  assert.equal(lastNote(sql, s1.id), 'Ended at a1b2c3d with no next step.');

  const kept = { version: s1.version, lines: lines(sql, s1.id) };
  clock.advance(MIN);
  assert.deepEqual(value<Ended>(k.endRun(as({ client_id: 'cc-1' }), { head: 'a1b2c3d' })), { run: 'S1', state: 'done', changed: false });
  assert.deepEqual({ version: k.get('S1')!.version, lines: lines(sql, s1.id) }, kept);
  assert.deepEqual(runs(sql), [1], 'an end opened a run');
  sql.close();
});

test('A SESSION THAT LEFT A FRESH STEP WAITS AS A HANDOFF, its step kept; one whose step is from before its stretch ends done and clears it', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-2' })));
  value(k.update('session', 'S1', { next: 'Run the gates after the build' }, as({ client_id: 'cc-2' })));
  clock.advance(5 * MIN);
  assert.deepEqual(value<Ended>(k.endRun(as({ client_id: 'cc-2' }), { head: 'f00dbab' })), { run: 'S1', state: 'handoff', changed: true });
  assert.deepEqual([k.get('S1')!.state, k.get('S1')!.fields.next], ['handoff', 'Run the gates after the build']);
  assert.equal(lastNote(sql, k.get('S1')!.id), 'Ended at f00dbab and left a next step.');

  /* RESUMED AND ONLY LOOKED AT, it writes nothing, so it is still the handoff it was and its step still waits. */
  assert.deepEqual(value<Ended>(k.endRun(as({ client_id: 'cc-2' }), {})), { run: 'S1', state: 'handoff', changed: false });

  /* RESUMED AND WORKED IN, it is working again; closed without writing its step again, the old step is not what it left. */
  clock.advance(HOUR);
  value(k.create('tasks', { what: 'Back at it' }, as({ client_id: 'cc-2' })));
  assert.equal(k.get('S1')!.state, 'active');
  assert.deepEqual(value<Ended>(k.endRun(as({ client_id: 'cc-2' }), { head: 'beef123' })), { run: 'S1', state: 'done', changed: true });
  assert.deepEqual([k.get('S1')!.state, k.get('S1')!.fields.next], ['done', undefined]);
  sql.close();
});

test('ITS HELPERS END WITH IT, and a helper that ends itself is done even with a step, since its step is its session’s', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Main' }, as({ client_id: 'main' })));
  value(k.create('tasks', { what: 'Helper A' }, as({ client_id: 'helper-a', parent: 'S1' })));
  value(k.create('tasks', { what: 'Helper B' }, as({ client_id: 'helper-b', parent: 'S1' })));
  value(k.update('session', 'S3', { next: 'Fold the second pass in' }, as({ client_id: 'helper-b' })));
  assert.deepEqual(value<Ended>(k.endRun(as({ client_id: 'helper-b' }), {})), { run: 'S3', state: 'done', changed: true });
  clock.advance(10 * MIN);
  assert.deepEqual(value<Ended>(k.endRun(as({ client_id: 'main' }), { head: 'a1b2c3d' })), { run: 'S1', state: 'done', changed: true });
  assert.deepEqual(['S1', 'S2', 'S3'].map((s) => k.get(s)!.state), ['done', 'done', 'done']);
  assert.equal(lastNote(sql, k.get('S2')!.id), 'Ended with the session it worked for.');
  assert.deepEqual(runs(sql), [1, 2, 3]);
  sql.close();
});

test('A RUN THE SWEEP WROTE OFF ENDS AS ANY OTHER when its session says it closed', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-4' })));
  value(k.update('session', 'S1', { state: 'abandoned' }, { actor: 'system' }));
  clock.advance(13 * HOUR);
  assert.deepEqual(value<Ended>(k.endRun(as({ client_id: 'cc-4' }), {})), { run: 'S1', state: 'done', changed: true });
  assert.equal(lastNote(sql, k.get('S1')!.id), 'Ended with no next step.');
  sql.close();
});

test('NO RUN IS OPENED TO BE ENDED, and nobody ends a run that is not theirs: a person, a session that never wrote, another key', async () => {
  const { k, sql } = await record();
  const person = k.endRun({ actor: 'p_owner' }, {});
  assert.equal(person.ok, false);
  const never = k.endRun(as({ client_id: 'never-wrote' }), { head: 'a1b2c3d' });
  assert.equal(never.ok, false);
  assert.deepEqual(runs(sql), []);

  value(k.create('tasks', { what: 'Mine' }, as({ client_id: 'mine' })));
  const theirs = k.endRun(as({ spoken: 'S1' }, 't_2'), {});
  assert.equal(theirs.ok, false);
  assert.equal(k.get('S1')!.state, 'active');
  for (const r of [person, never, theirs]) assert.doesNotMatch((r as { refusal: { fix: string } }).refusal.fix, /—/u);
  sql.close();
});
