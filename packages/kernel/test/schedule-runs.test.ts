/**
 * The hourly sweep of runs, with the clock moved thirteen hours (AGT-C04).
 *
 * A run silent for twelve hours that left a fresh next step and works for no other run waits as a handoff, so the step
 * reaches the next session; any other silent run is abandoned, as before. The sweep never writes done, and a run that
 * already ended or left a step is not touched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SWEPT_NOTE, SWEPT_STEP_NOTE } from '../src/schedule.ts';
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
const lastNote = (sql: NodeSql, id: string): string | null =>
  sql.one<{ note: string | null }>("SELECT note FROM event WHERE target = ? AND kind = 'state' ORDER BY ts DESC, id DESC LIMIT 1", `entry:${id}`)?.note ?? null;

test('THIRTEEN HOURS ON: a run that left a fresh step waits as a handoff, a helper and a run with no step are abandoned, and none is done', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  ok(await k.install([TASKS]));

  ok(k.create('tasks', { what: 'Left a step' }, as({ client_id: 'step' })));
  ok(k.update('session', 'S1', { next: 'Run the gates' }, as({ client_id: 'step' })));
  ok(k.create('tasks', { what: 'Left nothing' }, as({ client_id: 'nothing' })));
  ok(k.create('tasks', { what: 'Helping' }, as({ client_id: 'helper', parent: 'S1' })));
  ok(k.update('session', 'S3', { next: 'For my session' }, as({ client_id: 'helper' })));
  /* A run resumed and worked in after it left its step: the step is from before its stretch. */
  ok(k.create('tasks', { what: 'Old step' }, as({ client_id: 'stale-step' })));
  ok(k.update('session', 'S4', { next: 'Yesterday’s step', state: 'handoff' }, as({ client_id: 'stale-step' })));
  clock.advance(MIN);
  ok(k.create('tasks', { what: 'Back' }, as({ client_id: 'stale-step' })));
  ok(k.create('tasks', { what: 'Ended' }, as({ client_id: 'ended' })));
  ok(k.endRun(as({ client_id: 'ended' }), {}));

  clock.advance(13 * HOUR);
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('01J00000000000000000000001', ?, 'purge', 'sweep', '{}', 'pending', 0)",
    iso(clock.now()),
  );
  assert.ok((await k.drain()).done >= 1);

  assert.deepEqual(['S1', 'S2', 'S3', 'S4', 'S5'].map((s) => k.get(s)!.state), ['handoff', 'abandoned', 'abandoned', 'abandoned', 'done']);
  assert.equal(k.get('S1')!.fields.next, 'Run the gates', 'the step was taken off the run that left it');
  assert.equal(lastNote(sql, k.get('S1')!.id), SWEPT_STEP_NOTE);
  assert.equal(lastNote(sql, k.get('S2')!.id), SWEPT_NOTE);
  assert.equal(SWEPT_STEP_NOTE, 'Nothing heard in twelve hours. It left a next step.');

  /* ELEVEN HOURS IS NOT TWELVE: a run heard from since is left alone by the next hour's sweep. */
  ok(k.create('tasks', { what: 'Fresh' }, as({ client_id: 'fresh' })));
  clock.advance(11 * HOUR);
  sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'purge'", iso(clock.now()));
  await k.drain();
  assert.equal(k.get('S6')!.state, 'active');
  sql.close();
});
