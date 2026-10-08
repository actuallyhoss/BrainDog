/**
 * One clock for a run (AGT-C02): working, quiet, left a step, ended, stopped, or from before, worked out in one place.
 *
 * MEASURED BEFORE: the foot of the rail on the owner's record said 4 working while two of the four were last heard from
 * two and four hours before, because eight readers compared `last_seen` with the clock eight ways. What is asserted is
 * the one answer every reader now asks for: the word each run reads as, the runs working now with their helpers folded
 * in, and the runs an agent starting here is told are around it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABANDON_MS as SCHEDULE_ABANDON_MS } from '../src/schedule.ts';
import { QUIET_MS as SESSION_QUIET_MS, STALE_MS as SESSION_STALE_MS } from '../src/session.ts';
import {
  ABANDON_MS,
  QUIET_MS,
  STALE_MS,
  WORKING_MS,
  liveRuns,
  openRecord,
  presenceOf,
  workingRuns,
  type Declaration,
  type SessionHints,
  type WriteContext,
} from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const run = (state: string, heard: number | null) => ({ state, fields: heard === null ? { state } : { state, last_seen: iso(NOW - heard * MIN) } });

test('THREE NUMBERS IN ONE PLACE: working is fifteen minutes, stale forty-five, written off twelve hours, and the old homes say the same', () => {
  assert.deepEqual([WORKING_MS, STALE_MS, ABANDON_MS], [15 * MIN, 45 * MIN, 12 * 60 * MIN]);
  assert.equal(QUIET_MS, WORKING_MS, 'quiet is the working window itself');
  /* Exported again from where they were, so a reader that imported them there moves with the clock. */
  assert.deepEqual([SESSION_STALE_MS, SESSION_QUIET_MS, SCHEDULE_ABANDON_MS], [STALE_MS, QUIET_MS, ABANDON_MS]);
});

test('ONE WORD A RUN: working only while active and heard from inside fifteen minutes, and each finished state its own word', () => {
  assert.equal(presenceOf(run('active', 14), NOW), 'working');
  assert.equal(presenceOf(run('active', 16), NOW), 'quiet');
  assert.equal(presenceOf(run('idle', 1), NOW), 'quiet', 'a run resting a minute ago is not at work');
  assert.equal(presenceOf(run('handoff', 1), NOW), 'left');
  assert.equal(presenceOf(run('done', 1), NOW), 'ended');
  assert.equal(presenceOf(run('abandoned', 600), NOW), 'stopped');
  /* NEVER HEARD FROM HERE: a run carried in from somewhere else, whatever its state says. */
  assert.equal(presenceOf(run('active', null), NOW), 'before');
  /* A reader holding the fields alone, as a page's row does. */
  assert.equal(presenceOf({ fields: { state: 'active', last_seen: iso(NOW - 2 * MIN) } }, NOW), 'working');
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([TASKS])).ok);
  return { k, sql, clock };
}

const as = (session: SessionHints, token = 't_1'): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token }, session });

test('WORKING NOW IS ONE ROW A SESSION: its helpers fold into it, a quiet run is left out, and a helper whose session went quiet stands alone', async () => {
  const { k, sql, clock } = await record();
  /* S1 a session, S2 and S3 its subagents; S4 another session that goes quiet; S5 its helper, still busy. */
  assert.ok(k.create('tasks', { what: 'Main' }, as({ client_id: 'main' })).ok);
  assert.ok(k.create('tasks', { what: 'Helper A' }, as({ client_id: 'helper-a', parent: 'S1' })).ok);
  assert.ok(k.create('tasks', { what: 'Helper B' }, as({ client_id: 'helper-b', parent: 'S1' })).ok);
  assert.ok(k.create('tasks', { what: 'Other' }, as({ client_id: 'other' })).ok);
  assert.ok(k.create('tasks', { what: 'Its helper' }, as({ client_id: 'other-helper', parent: 'S4' })).ok);
  clock.advance(16 * MIN);
  for (const c of ['main', 'helper-a', 'helper-b', 'other-helper']) assert.ok(k.create('tasks', { what: `Again ${c}` }, as({ client_id: c })).ok);

  const working = workingRuns(sql, clock.now());
  assert.deepEqual(
    working.map((r) => [`S${String(r.seq)}`, r.helpers]).sort(),
    [['S1', 2], ['S5', 0]],
  );
  /* And past the window nobody is working, though every run is still open. */
  assert.deepEqual(workingRuns(sql, clock.now() + 16 * MIN), []);
  sql.close();
});

test('A PARENT FROM ANOTHER KEY IS NOT ONE: a run names as its parent only a run its own key opened', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('tasks', { what: 'Mine' }, as({ client_id: 'mine' })).ok);
  assert.ok(k.create('tasks', { what: 'Theirs' }, as({ client_id: 'theirs', parent: 'S1' }, 't_2')).ok);
  assert.equal(k.get('S2')?.fields.parent, undefined);
  assert.deepEqual(workingRuns(sql, NOW).map((r) => [`S${String(r.seq)}`, r.helpers]).sort(), [['S1', 0], ['S2', 0]]);
  sql.close();
});

test('LIVE IS OPEN AND HEARD FROM INSIDE FORTY-FIVE MINUTES: a briefing names no dead run, and a finished one is never live', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('tasks', { what: 'Old' }, as({ client_id: 'old' })).ok);
  clock.advance(30 * MIN);
  assert.ok(k.create('tasks', { what: 'Resting' }, as({ client_id: 'resting' })).ok);
  assert.ok(k.update('session', 'S2', { state: 'idle' }, { actor: 'p_owner' }).ok);
  assert.ok(k.create('tasks', { what: 'Finished' }, as({ client_id: 'finished' })).ok);
  assert.ok(k.update('session', 'S3', { state: 'done' }, { actor: 'p_owner' }).ok);
  clock.advance(20 * MIN);
  assert.deepEqual(liveRuns(sql, clock.now()).map((r) => `S${String(r.seq)}`), ['S2']);
  sql.close();
});
