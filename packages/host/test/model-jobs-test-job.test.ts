/**
 * The silent model's test spends no job's attempts. A job leased as the test and acked `failed`
 * lost one of its eight attempts every half hour, the oldest each time, so it died in about four hours of silence. The test
 * is one call that leases nothing: eight of them leave every job `pending` with its attempts as they were, and the first
 * one answered runs the pass as before, at once. Over a real record's outbox, so the attempts read are the kernel's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';
import { createRecordApi } from '@braindog/record';

import { MODEL_TEST_EVERY_MS, serveModelJobs, type ModelJobsDeps } from '../src/model-jobs.ts';
import type { EngineHealth } from '../src/engine-health.ts';
import { enqueue } from '../../kernel/src/outbox.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 9, 9, 0);

type Row = { state: string; attempts: number };

/** A record with one digest waiting on its prose, a silent engine, and a model that answers as `state.answers` says. */
async function record() {
  let now = T0;
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now } });
  const id = enqueue(sql, () => 'J1', now, 'infer.prose', { digest: 'weekly-1', headline: 'Your week', text: 'Three tasks closed.', channels: ['mcp'] });
  const state: { health: EngineHealth['state']; answers: 'yes' | 'no' | 'throws' } = { health: 'not_answering', answers: 'no' };
  const asked: unknown[] = [];
  const lines: string[] = [];
  const store = openSqlite();
  const deps = (): ModelJobsDeps => ({
    inference: {
      draft: async () => assert.fail('no draft is queued'),
      prose: async (digest) => {
        asked.push(digest);
        if (state.answers === 'throws') throw new Error('The model could not be reached.');
        return state.answers === 'yes' ? { ok: true, value: { text: 'A quiet week.' } } : no('UNREACHABLE', 'The model did not answer.');
      },
    },
    meter: { cap: 30, spent: () => 0 },
    now: () => now,
    store,
    log: (line) => lines.push(line),
    health: async () => ({ health: { state: state.health, last_ok: null, since: '2026-10-09T08:40:00.000Z' } }),
  });
  const row = () => ({ ...sql.one<Row>('SELECT state, attempts FROM outbox WHERE id = ?', id) });
  const pass = (at: number) => ((now = at), serveModelJobs(api, deps()));
  return { row, pass, state, asked, lines, sql, id };
}

test('EIGHT TESTS AGAINST A SILENT MODEL LEAVE THE JOB PENDING WITH ITS ATTEMPTS AS THEY WERE', async () => {
  const r = await record();
  await r.pass(T0);
  for (let i = 1; i <= 8; i++) await r.pass(T0 + i * MODEL_TEST_EVERY_MS);
  assert.equal(r.asked.length, 8, 'the model was tried once every half hour');
  assert.deepEqual(r.row(), { state: 'pending', attempts: 0 });
  /* THE TEST WAS NEVER THE JOB: every call was over the test's own digest, and the job's text was never sent. */
  assert.ok(r.asked.every((d) => (d as { digest?: unknown }).digest === 'model-test'), JSON.stringify(r.asked));
  assert.match(r.lines.at(-1)!, /still not answering.*attempts kept/u);
});

test('A TEST THE MODEL ANSWERS RUNS THE PASS AT ONCE, and the job it kept is answered', async () => {
  const r = await record();
  await r.pass(T0);
  await r.pass(T0 + MODEL_TEST_EVERY_MS);
  r.state.answers = 'yes';
  await r.pass(T0 + 2 * MODEL_TEST_EVERY_MS);
  assert.equal(r.asked.length, 3, 'two tests and then the job');
  assert.deepEqual(r.row(), { state: 'done', attempts: 0 }, r.lines.join('\n'));
});

test('A TEST THAT THROWS IS A MODEL STILL SILENT, and nothing is leased', async () => {
  const r = await record();
  await r.pass(T0);
  const lines = r.lines.length;
  r.state.answers = 'throws';
  await r.pass(T0 + MODEL_TEST_EVERY_MS);
  assert.equal(r.asked.length, 1);
  assert.equal(r.lines.length, lines + 1);
  assert.deepEqual(r.row(), { state: 'pending', attempts: 0 });
});

test('NOTHING WAITING, NOTHING TESTED: a silent model over an empty queue is not called every half hour', async () => {
  const r = await record();
  r.sql.exec('DELETE FROM outbox WHERE id = ?', r.id);
  await r.pass(T0);
  for (let i = 1; i <= 4; i++) await r.pass(T0 + i * MODEL_TEST_EVERY_MS);
  assert.equal(r.asked.length, 0);
});

test('NO COPY A PERSON READS CARRIES AN ID OR AN EM DASH', async () => {
  const r = await record();
  await r.pass(T0);
  await r.pass(T0 + MODEL_TEST_EVERY_MS);
  for (const line of r.lines) assert.doesNotMatch(line, /—|J1|weekly-1/u, line);
});
