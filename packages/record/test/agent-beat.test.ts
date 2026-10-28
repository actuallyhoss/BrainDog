/**
 * `beat`: a session says it is still working, through the record.
 *
 * MEASURED BEFORE: last seen moved only when a run wrote, so on the owner's record a session that read and edited files
 * for half an hour read as Quiet beside one that had died. What is asserted is what the Agents page reads after a beat:
 * the run working again, its row at the same version with no new line in its history; and what a beat never does: open
 * a run, wake one that stopped, or speak for a person.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { presenceOf, type Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  return { api, sql, clock };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A token's call from one host session, as the door and the hook send it. */
const agent = (session: CallContext['session'] = {}, scope: 'read' | 'propose' | 'write' = 'write'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope, person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'kiln', agent: 'claude', ...session },
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: { ok: boolean }): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const run = async (api: Awaited<ReturnType<typeof record>>['api'], spoken: string): Promise<Entry> =>
  value<Entry | null>(await api.get({ spoken }, owner)) ?? assert.fail(`${spoken} is not there`);

const lines = (sql: NodeSql, id: string): number => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event WHERE target = ?', `entry:${id}`)!.n;

const runs = (sql: NodeSql): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n;

test('A SESSION THAT WROTE ONCE AND WORKS ON STAYS WORKING: each beat moves last seen, and the row and its history stay', async () => {
  const { api, sql, clock } = await record();
  value(await api.create({ register: 'tasks', fields: { what: 'Write once' } }, agent({ client_id: 'long' })));
  const was = await run(api, 'S1');
  const before = lines(sql, was.id);
  /* Forty minutes of editing files with no write, a beat every ten. */
  for (let i = 0; i < 4; i++) {
    clock.advance(10 * MIN);
    assert.deepEqual(value(await api.beat(undefined, agent({ client_id: 'long' }, 'propose'))), { run: 'S1' });
    assert.equal(presenceOf(await run(api, 'S1'), clock.now()), 'working');
  }
  const now = await run(api, 'S1');
  assert.equal(now.fields.last_seen, new Date(clock.now()).toISOString());
  assert.deepEqual([now.version, now.updated_at, lines(sql, now.id)], [was.version, was.updated_at, before]);
  sql.close();
});

test('A BEAT OPENS NOTHING AND WAKES NOTHING: no run answers null, and an ended run stays ended', async () => {
  const { api, sql, clock } = await record();
  assert.deepEqual(value(await api.beat(undefined, agent({ client_id: 'never-wrote' }, 'propose'))), { run: null });
  assert.equal(runs(sql), 0);
  value(await api.create({ register: 'tasks', fields: { what: 'Then stop' } }, agent({ client_id: 'stops' })));
  value(await api.end({}, agent({ client_id: 'stops' }, 'propose')));
  clock.advance(5 * MIN);
  assert.deepEqual(value(await api.beat({}, agent({ client_id: 'stops' }, 'propose'))), { run: null });
  assert.equal((await run(api, 'S1')).state, 'done');
  assert.equal(runs(sql), 1);
  sql.close();
});

test('A PERSON IS NEVER A RUN, a read key cannot beat, and beat takes nothing', async () => {
  const { api, sql } = await record();
  const person = refusal(await api.beat(undefined, owner));
  assert.equal(person.code, 'FORBIDDEN');
  assert.equal(person.fix, 'beat is how an agent says it is still working, and a person is never a run.');
  /* Nor a person whose call carries a session's hints, as the app's would beside a run it opened. */
  const hinted = refusal(await api.beat(undefined, { ...owner, session: { client_id: 'r', agent: 'claude' } }));
  assert.equal(hinted.code, 'FORBIDDEN');
  assert.notEqual(refusal(await api.beat(undefined, agent({ client_id: 'r' }, 'read'))).code, undefined);
  const stray = refusal(await api.beat({ state: 'active' } as never, agent({ client_id: 'x' }, 'propose')));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'state']);
  assert.doesNotMatch(person.fix + stray.fix, /—/u, 'no em dash in words a person reads');
  sql.close();
});
