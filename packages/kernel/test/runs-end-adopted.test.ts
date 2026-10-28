/**
 * A second end never ends another run (`endRun`).
 *
 * MEASURED BEFORE: S1 has no client id and S2 has one, both of one key on one machine and repository. Ending S1 twice,
 * the second call answered `{ run: 'S2', state: 'done', changed: true }`: the ladder dropped the finished S1 and rung 4
 * adopted S2, which was still working. A run the caller names is the run its end answers for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const HERE = { host: 'mac', repo: 'braindog' };
const as = (session: SessionHints, token = 't_1'): WriteContext => ({ actor: 'agent:claude', principal: { kind: 'token', token }, session });

type Ended = { run: string; state: string; changed: boolean };
type Answer = { ok: boolean; value?: Ended; refusal?: { code: string; fix: string } };

async function twoRuns() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([TASKS])).ok);
  assert.ok(k.create('tasks', { what: 'First' }, as({ ...HERE })).ok);
  clock.advance(MIN);
  assert.ok(k.create('tasks', { what: 'Second' }, as({ ...HERE, client_id: 'cc-2' })).ok);
  assert.deepEqual([k.get('S1')?.state, k.get('S2')?.state], ['active', 'active']);
  return { k, sql, clock };
}

test('ENDING S1 TWICE LEAVES S2 LIVE: the second end answers for S1 and changes nothing', async () => {
  const { k, sql, clock } = await twoRuns();
  const first = k.endRun(as({ ...HERE, spoken: 'S1' }), {}) as Answer;
  assert.deepEqual(first.value, { run: 'S1', state: 'done', changed: true });
  clock.advance(MIN);
  const again = k.endRun(as({ ...HERE, spoken: 'S1' }), {}) as Answer;
  assert.deepEqual(again.value, { run: 'S1', state: 'done', changed: false });
  assert.equal(k.get('S2')?.state, 'active', 'the second end ended the live run beside it');
  sql.close();
});

test('A NAMED RUN THAT IS NOT ON THE RECORD IS REFUSED, and the live run is left alone', async () => {
  const { k, sql } = await twoRuns();
  const r = k.endRun(as({ ...HERE, spoken: 'S9' }), {}) as Answer;
  assert.equal(r.ok, false);
  assert.equal(r.refusal?.code, 'ROW_UNKNOWN');
  assert.equal(k.get('S2')?.state, 'active');
  sql.close();
});

test("ANOTHER KEY'S FINISHED RUN, NAMED, IS REFUSED as not this key's, never swapped for this key's live run", async () => {
  const { k, sql } = await twoRuns();
  assert.ok(k.create('tasks', { what: 'Elsewhere' }, as({ host: 'pc', repo: 'other' }, 't_2')).ok);
  assert.ok((k.endRun(as({ host: 'pc', repo: 'other', spoken: 'S3' }, 't_2'), {}) as Answer).ok);
  const r = k.endRun(as({ ...HERE, spoken: 'S3' }), {}) as Answer;
  assert.equal(r.refusal?.code, 'FORBIDDEN');
  assert.deepEqual([k.get('S1')?.state, k.get('S2')?.state], ['active', 'active']);
  sql.close();
});

test('WITH NO NAME, an end still ends the run the session has', async () => {
  const { k, sql } = await twoRuns();
  const r = k.endRun(as({ ...HERE, client_id: 'cc-2' }), {}) as Answer;
  assert.deepEqual(r.value, { run: 'S2', state: 'done', changed: true });
  assert.equal(k.get('S1')?.state, 'active');
  sql.close();
});

test('WITH NOTHING LIVE BESIDE IT, a second end of a named run still answers for it, never as a session that wrote nothing', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([TASKS])).ok);
  assert.ok(k.create('tasks', { what: 'Only' }, as({ ...HERE })).ok);
  assert.deepEqual((k.endRun(as({ ...HERE, spoken: 'S1' }), {}) as Answer).value, { run: 'S1', state: 'done', changed: true });
  const again = k.endRun(as({ ...HERE, spoken: 'S1' }), {}) as Answer;
  assert.deepEqual(again.value, { run: 'S1', state: 'done', changed: false });
  sql.close();
});
