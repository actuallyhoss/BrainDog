/**
 * The model jobs wait while the model is silent (ENG-A04): a pass whose engine health says `not_answering` leases nothing
 * and leaves every job `pending` with its attempts as they were, tries the model every thirty minutes with a call that
 * leases no job, and runs as before once the model answers. Over a real record's outbox, so the attempts read are the
 * kernel's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';
import { createRecordApi } from '@braindog/record';

import { MODEL_TEST_EVERY_MS, serveModelJobs, type ModelJobMeter, type ModelJobsDeps } from '../src/model-jobs.ts';
import type { EngineHealth } from '../src/engine-health.ts';
import { enqueue } from '../../kernel/src/outbox.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 9, 9, 0);
const MIN = 60_000;
const ROOM: ModelJobMeter = { cap: 30, spent: () => 0 };

type Row = { state: string; attempts: number };

/** A record with two digests waiting on their prose, the engine's health as `state` says, and a model that answers `answers`. */
async function record() {
  let now = T0;
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now } });
  let n = 0;
  const ids = [1, 2].map((i) => enqueue(sql, () => `J${++n}`, now, 'infer.prose', { digest: `weekly-${i}`, headline: 'Your week', text: 'Three tasks closed.', channels: ['mcp'] }));
  const state: { health: EngineHealth['state']; answers: 'yes' | 'unreachable' | 'throws' } = { health: 'not_answering', answers: 'unreachable' };
  const asked: unknown[] = [];
  const lines: string[] = [];
  const store = openSqlite();
  const deps = (): ModelJobsDeps => ({
    inference: {
      draft: async () => assert.fail('no draft is queued'),
      prose: async (digest) => {
        asked.push(digest);
        if (state.answers === 'throws') throw new Error('The digest could not be read.');
        return state.answers === 'yes' ? { ok: true, value: { text: 'A quiet week.' } } : no('UNREACHABLE', 'The model did not answer.');
      },
    },
    meter: ROOM,
    now: () => now,
    store,
    log: (line) => lines.push(line),
    health: async () => ({ health: { state: state.health, last_ok: null, since: '2026-10-09T08:40:00.000Z' } }),
  });
  const rows = () => ids.map((id) => ({ ...sql.one<Row>('SELECT state, attempts FROM outbox WHERE id = ?', id) }));
  const pass = (at: number) => ((now = at), serveModelJobs(api, deps()));
  return { rows, pass, state, asked, lines };
}

test('A SILENT MODEL LEASES NOTHING: every job stays pending with its attempts as they were, and the wait is said once', async () => {
  const r = await record();
  await r.pass(T0);
  await r.pass(T0 + 10 * MIN);
  await r.pass(T0 + 29 * MIN);
  assert.equal(r.asked.length, 0, 'a job was asked of a model that is not answering');
  assert.deepEqual(r.rows(), [{ state: 'pending', attempts: 0 }, { state: 'pending', attempts: 0 }]);
  assert.equal(r.lines.length, 1, r.lines.join('\n'));
  assert.match(r.lines[0]!, /not answering.*attempts kept.*every 30 minutes/u);
});

test('EVERY THIRTY MINUTES ONE JOB GOES THROUGH AS A TEST, and the rest keep waiting', async () => {
  const r = await record();
  await r.pass(T0);
  await r.pass(T0 + MODEL_TEST_EVERY_MS);
  assert.equal(r.asked.length, 1, 'the test is one job');
  assert.deepEqual(r.rows(), [{ state: 'pending', attempts: 0 }, { state: 'pending', attempts: 0 }]);
  /* AND NOT AGAIN UNTIL THE NEXT HALF HOUR: the test is a call that leases no job, so both are still untouched. */
  await r.pass(T0 + MODEL_TEST_EVERY_MS + 10 * MIN);
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.rows()[1], { state: 'pending', attempts: 0 });
});

test('ONCE THE MODEL ANSWERS THE PASS RUNS AS BEFORE, and a later silence opens a fresh wait', async () => {
  const r = await record();
  await r.pass(T0);
  r.state.health = 'answering';
  r.state.answers = 'yes';
  await r.pass(T0 + 5 * MIN);
  assert.equal(r.asked.length, 2);
  assert.deepEqual(r.rows(), [{ state: 'done', attempts: 0 }, { state: 'done', attempts: 0 }], r.lines.join('\n'));
  /* A NEW SILENCE DOES NOT INHERIT THE OLD WAIT'S TEST TIME: it waits its own thirty minutes and says so again. */
  r.state.health = 'not_answering';
  await r.pass(T0 + 90 * MIN);
  assert.equal(r.lines.length, 2, r.lines.join('\n'));
});

test('A JOB THAT FAILS FOR A CAUSE THAT IS NOT THE MODEL STILL CLIMBS ITS OWN LADDER', async () => {
  const r = await record();
  r.state.health = 'answering';
  r.state.answers = 'throws';
  await r.pass(T0);
  assert.deepEqual(r.rows(), [{ state: 'failed', attempts: 1 }, { state: 'failed', attempts: 1 }]);
});

test('THE WAIT OUTLIVES THE ISOLATE: a fresh health read over the same store still waits, and does not test early', async () => {
  const r = await record();
  await r.pass(T0);
  /* `deps()` hands a new health function on every pass, as a Worker woken in a fresh isolate would build one. */
  await r.pass(T0 + 20 * MIN);
  assert.equal(r.asked.length, 0);
});
