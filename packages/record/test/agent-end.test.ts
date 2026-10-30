/**
 * `end`: a closed session's run ended once, through the record.
 *
 * What is asserted is what a person reads the next day on the Agents page: a session that closed with nothing left
 * reads Ended and not Abandoned, one that left a fresh next step waits for the next session, its helpers end with it,
 * and a second end changes nothing. And what an agent can never do through it: open a run only to end it, pick its own
 * state, or end a run as a person.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

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

/** A token's call from one host session, as the end hook sends it. */
const agent = (session: CallContext['session'] = {}, scope: 'read' | 'propose' | 'write' = 'write'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope, person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'kiln', agent: 'claude', ...session },
});

type Ended = { run: string; state: string; changed: boolean };

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

const runs = (sql: NodeSql): number[] => sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' ORDER BY seq").map((r) => r.seq);

const run = async (api: Awaited<ReturnType<typeof record>>['api'], spoken: string): Promise<Entry> =>
  value<Entry | null>(await api.get({ spoken }, owner)) ?? assert.fail(`${spoken} is not there`);

const lines = (sql: NodeSql, id: string): number => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event WHERE target = ?', `entry:${id}`)!.n;

/** A run opened by one write from the session `client_id`, and its spoken id. */
const working = async (api: Awaited<ReturnType<typeof record>>['api'], client_id: string, more: CallContext['session'] = {}): Promise<void> => {
  value(await api.create({ register: 'tasks', fields: { what: `Work in ${client_id}` } }, agent({ client_id, ...more })));
};

test('A SESSION THAT CLOSES WITH NOTHING LEFT ENDS DONE, ONCE: the note says where it stopped, and a second end changes nothing', async () => {
  const { api, sql, clock } = await record();
  await working(api, 'claude-run-1');
  assert.deepEqual(runs(sql), [1]);
  clock.advance(20 * MIN);

  const first = value<Ended>(await api.end({ branch: 'main', head: 'a1b2c3d' }, agent({ client_id: 'claude-run-1' }, 'propose')));
  assert.deepEqual(first, { run: 'S1', state: 'done', changed: true });
  const s1 = await run(api, 'S1');
  assert.equal(s1.state, 'done');
  assert.equal(s1.fields.next ?? null, null);
  const note = sql.one<{ note: string | null }>("SELECT note FROM event WHERE target = ? AND kind != 'create' ORDER BY rowid DESC LIMIT 1", `entry:${s1.id}`);
  assert.equal(note?.note, 'Ended at a1b2c3d with no next step.');

  /* The hook fires again, or a lost answer is retried: the same answer, nothing written. */
  const kept = { version: s1.version, lines: lines(sql, s1.id) };
  clock.advance(MIN);
  const again = value<Ended>(await api.end({ head: 'a1b2c3d' }, agent({ client_id: 'claude-run-1' }, 'propose')));
  assert.deepEqual(again, { run: 'S1', state: 'done', changed: false });
  const after = await run(api, 'S1');
  assert.deepEqual({ version: after.version, lines: lines(sql, after.id) }, kept);
  assert.deepEqual(runs(sql), [1], 'an end opened a run');
  sql.close();
});

test('A RUN THAT LEFT A FRESH NEXT STEP WAITS AS A HANDOFF, its step kept for the next session', async () => {
  const { api, sql, clock } = await record();
  await working(api, 'claude-run-2');
  value(await api.handoff({ next: 'Run the refusal gates after the build' }, agent({ client_id: 'claude-run-2' })));
  clock.advance(5 * MIN);

  const ended = value<Ended>(await api.end({ head: 'f00dbab' }, agent({ client_id: 'claude-run-2' })));
  assert.deepEqual(ended, { run: 'S1', state: 'handoff', changed: true });
  const s1 = await run(api, 'S1');
  assert.equal(s1.state, 'handoff');
  assert.equal(s1.fields.next, 'Run the refusal gates after the build');
  sql.close();
});

test('ITS HELPERS END WITH IT, and a helper that ends itself is done even with a next step, since it works for another run', async () => {
  const { api, sql, clock } = await record();
  await working(api, 'claude-run-main');
  /* Two subagents of S1, each its own run under the same key, each saying whose it is. */
  await working(api, 'claude-run-helper-a', { parent: 'S1' });
  await working(api, 'claude-run-helper-b', { parent: 'S1' });
  assert.deepEqual(runs(sql), [1, 2, 3]);

  /* B ends on its own, with a next step it leaves for its parent: done all the same. */
  value(await api.handoff({ next: 'Fold the second pass into the first' }, agent({ client_id: 'claude-run-helper-b' })));
  const b = value<Ended>(await api.end({}, agent({ client_id: 'claude-run-helper-b' })));
  assert.deepEqual(b, { run: 'S3', state: 'done', changed: true });

  clock.advance(10 * MIN);
  const main = value<Ended>(await api.end({ head: 'a1b2c3d' }, agent({ client_id: 'claude-run-main' })));
  assert.deepEqual(main, { run: 'S1', state: 'done', changed: true });
  for (const spoken of ['S1', 'S2', 'S3']) assert.equal((await run(api, spoken)).state, 'done', spoken);
  assert.deepEqual(runs(sql), [1, 2, 3]);
  sql.close();
});

test('NO RUN IS OPENED TO BE ENDED: a session that never wrote is refused, and the record holds no run after it', async () => {
  const { api, sql } = await record();
  const out = await api.end({ head: 'a1b2c3d' }, agent({ client_id: 'claude-run-never' }));
  assert.equal(out.ok, false);
  assert.deepEqual(runs(sql), []);
  sql.close();
});

test('WHAT END REFUSES, BEFORE ANYTHING IS FOUND OR OPENED: a person, a read token, a state, and anything else it does not take', async () => {
  const { api, sql } = await record();
  const person = refusal(await api.end({}, owner));
  assert.equal(person.code, 'FORBIDDEN');
  assert.match(person.fix, /a person is never a run/u);
  const reader = refusal(await api.end({}, agent({ client_id: 'c-1' }, 'read')));
  assert.equal(reader.code, 'FORBIDDEN');
  assert.match(reader.fix, /asks the person, and this token only reads/u);

  const stated = refusal(await api.end({ state: 'done' } as never, agent({ client_id: 'c-1' })));
  assert.deepEqual([stated.code, stated.at], ['FIELD_UNKNOWN', 'state']);
  assert.match(stated.fix, /picks the state itself/u);
  const stray = refusal(await api.end({ next: 'Ship it' } as never, agent({ client_id: 'c-1' })));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'next']);
  const blank = refusal(await api.end({ head: '  ' }, agent({ client_id: 'c-1' })));
  assert.deepEqual([blank.code, blank.at], ['VALUE_MALFORMED', 'head']);
  const long = refusal(await api.end({ branch: 'b'.repeat(281) }, agent({ client_id: 'c-1' })));
  assert.deepEqual([long.code, long.at], ['OUT_OF_BOUNDS', 'branch']);

  for (const r of [person, reader, stated, stray, blank, long]) assert.doesNotMatch(r.fix, /—/u);
  assert.deepEqual(runs(sql), []);
  sql.close();
});
