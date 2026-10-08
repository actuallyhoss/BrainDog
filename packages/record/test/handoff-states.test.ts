/**
 * The states a run hands itself into (AGT-C04, the record's line): `handoff` takes exactly idle, handoff and done, from
 * one exported constant the agent door's tool reads too. `active` is refused with why and with the same call without
 * it, and a refused call opens no run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, HANDOFF_ACTIVE, HANDOFF_STATES, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (client_id: string): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'dev-mac', repo: 'braindog', agent: 'claude', client_id },
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Refused = { code: string; fix: string; at?: string; allowed?: readonly string[]; try?: string };
const refusal = (r: { ok: boolean }): Refused => {
  const x = r as { ok: boolean; refusal?: Refused };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const runs = async () => value<{ rows: Entry[] }>(await api.list({ register: 'session' }, owner)).rows;
  return { api, sql, runs };
}

test('THE STATES ARE ONE CONSTANT: idle, handoff and done, and each is taken', async () => {
  assert.deepEqual([...HANDOFF_STATES], ['idle', 'handoff', 'done']);
  const { api, sql } = await record();
  for (const [n, state] of HANDOFF_STATES.entries()) {
    const run = value<Entry>(await api.handoff({ state, next: 'Run the refusal gates after the build' }, agent(`c-${n}`)));
    assert.equal(run.state, state);
  }
  sql.close();
});

test('ACTIVE IS REFUSED WITH WHY AND THE CORRECTED CALL, and opens no run', async () => {
  const { api, sql, runs } = await record();
  const said = refusal(await api.handoff({ state: 'active', next: 'Run the refusal gates after the build' }, agent('c-1')));
  assert.equal(said.fix, HANDOFF_ACTIVE);
  assert.equal(said.fix, 'A run is active when it writes. Leave state out.');
  assert.equal(said.at, 'state');
  assert.deepEqual(said.allowed, HANDOFF_STATES);
  assert.equal(said.try, 'handoff {"next":"Run the refusal gates after the build"}');
  assert.deepEqual(await runs(), []);
  /* AND THE CORRECTED CALL DOES WHAT WAS MEANT: the run is active because it wrote. */
  const run = value<Entry>(await api.handoff({ next: 'Run the refusal gates after the build' }, agent('c-1')));
  assert.equal(run.state, 'active');
  sql.close();
});

test('A STATE THE RUN DOES NOT HAND ITSELF INTO IS REFUSED BY NAME, abandoned among them', async () => {
  const { api, sql, runs } = await record();
  for (const state of ['abandoned', 'banana']) {
    const said = refusal(await api.handoff({ state, note: 'Stopping here.' }, agent('c-1')));
    assert.deepEqual([said.code, said.at, said.allowed], ['ENUM_VALUE_UNKNOWN', 'state', HANDOFF_STATES]);
  }
  assert.deepEqual(await runs(), []);
  sql.close();
});
