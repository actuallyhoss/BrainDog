/**
 * Open is not working: a run that is open and not working is quiet, and working is active and
 * heard from inside fifteen minutes (`WORKING_MS`, the one clock in `presence.ts`). Worked out when read and never a
 * state of its own; and a run's age stands still once it stops.
 *
 * MEASURED BEFORE: three of the owner's runs read "active" in `context` 48 minutes to 2.6 hours after anybody had heard
 * from them, and Working now counted each of them as an agent at work.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_BODY } from '../src/migrations/0044_seat.ts';
import { isQuiet, isStale, openRecord, QUIET_MS, runAge, STALE_MS, WORKING_MS, type Declaration, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

/** A run as a reader holds it: opened an hour before `NOW`, last heard from `heard` minutes before it. */
const run = (state: string, heard: number) => ({
  state,
  fields: { state, last_seen: iso(NOW - heard * MIN) },
  created_at: iso(NOW - 60 * MIN),
  updated_at: iso(NOW - 60 * MIN),
});

test('QUIET IS OPEN AND NOT WORKING: active and silent for fifteen minutes, or idle at all; a handoff and a finished run never are', () => {
  assert.equal(WORKING_MS, 15 * MIN);
  assert.equal(QUIET_MS, WORKING_MS, 'quiet is the working window itself');
  assert.ok(QUIET_MS < STALE_MS, 'a run went quiet only once the ladder had stopped adopting it');
  assert.equal(isQuiet(run('active', 14), NOW), false, 'active for 14 minutes');
  assert.equal(isQuiet(run('active', 16), NOW), true, 'active for 16 minutes');
  /* RESTING IS NOT WORKING: a run that wrote idle a minute ago is open and not at work. */
  for (const heard of [1, 16]) assert.equal(isQuiet(run('idle', heard), NOW), true, `idle for ${String(heard)} minutes`);
  for (const state of ['handoff', 'done', 'abandoned']) assert.equal(isQuiet(run(state, 600), NOW), false, `${state} went quiet`);
  /* Quiet comes before stale: past a quarter of an hour a person is told, and past three quarters the ladder stops guessing. */
  assert.deepEqual([isQuiet(run('active', 40), NOW), isStale(run('active', 40), NOW)], [true, false]);
  /* A reader holding the fields alone, as a page's row does, is answered the same. */
  const { state: _state, ...fieldsOnly } = run('active', 16);
  assert.equal(isQuiet(fieldsOnly, NOW), true);
  assert.equal(isQuiet({ ...fieldsOnly, fields: { ...fieldsOnly.fields, last_seen: iso(NOW - 14 * MIN) } }, NOW), false);
});

test('A RUN’S AGE FREEZES WHEN IT ENDS: it grows while the run works, and stands at its last word once it stops', () => {
  assert.equal(runAge(run('active', 1), NOW), 60 * 60, 'a working run is as old as the clock says');
  assert.equal(runAge(run('active', 1), NOW + 10 * MIN), 70 * 60);
  /* Quiet, stopped or finished, the age is from the start to the last time anybody heard from it. */
  for (const state of ['idle', 'handoff', 'done', 'abandoned']) {
    assert.equal(runAge(run(state, 20), NOW), 40 * 60, `${state}`);
    assert.equal(runAge(run(state, 20), NOW + 3 * 24 * 60 * MIN), 40 * 60, `${state} kept ageing`);
  }
  assert.equal(runAge(run('active', 45), NOW), 15 * 60, 'a quiet run aged as if it were busy');
});

test('NOTHING IS STORED: the register has no quiet field, and a run going quiet writes nothing', async () => {
  assert.ok(!SESSION_BODY.includes('quiet'));
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const tasks: Declaration = { id: 'register.tasks', kind: 'register', body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } };
  assert.ok((await k.install([tasks])).ok);
  const said: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client_id: 'cc-1' } };
  assert.ok(k.create('tasks', { what: 'One' }, said).ok);
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  clock.advance(16 * MIN);
  const s1 = k.get('S1')!;
  assert.deepEqual([s1.state, isQuiet(s1, clock.now()), runAge(s1, clock.now())], ['active', true, 0]);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before);
  sql.close();
});
