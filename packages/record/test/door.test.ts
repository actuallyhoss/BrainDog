/**
 * `heard` and `doorSigns`: the agent door's own signs through the record (AGT-B01).
 *
 * What is asserted is the door, not the sums, which are the kernel's (`kernel/test/door.test.ts`): a mark from a token
 * with no run is kept against the token and opens no run, a mark from a session with a run is kept against that run, a
 * wrong key is refused in the usual sentence, and the signs are read only by a caller who reads the whole record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  return { api, sql };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (client_id: string, scope: 'read' | 'write' = 'write'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope, person: 'p_1', level: 'owner' },
  session: { client_id, agent: 'claude', host: 'dev-pc', repo: 'kiln' },
});

const ok = <T>(r: { ok: boolean; value?: T }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.value as T;
};

const refused = (r: unknown): { code: string; fix: string; at?: string } => {
  const out = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(out.ok, false, JSON.stringify(r));
  assert.ok(out.refusal, JSON.stringify(r));
  return out.refusal;
};

const marks = (sql: NodeSql) =>
  sql.all<{ run: string; kind: string; n: number }>('SELECT run, kind, n FROM door_mark ORDER BY run, kind').map((r) => ({ ...r }));
const runs = (sql: NodeSql) => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n;

test('A SESSION WITH NO RUN IS MARKED AGAINST ITS KEY, opens no run, and moves all three signs from 0 to 1', async () => {
  const { api, sql } = await record();
  const before = ok<{ said: string }>(await api.doorSigns({}, owner));
  assert.equal(before.said, 'Sessions that connected in the last 7 days: 0. Given the tools: 0. Made a call: 0.');
  const events = sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n;
  ok(await api.heard({ kind: 'hello', build: '0.9.2', client: 'claude-code 2.1.4' }, agent('c-1')));
  ok(await api.heard({ kind: 'listed', n: 16 }, agent('c-1')));
  ok(await api.heard({ kind: 'called', n: 2 }, agent('c-1')));
  assert.equal(runs(sql), 0, 'a mark opened a run');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n, events, 'a mark wrote a line of history');
  assert.deepEqual(marks(sql), [
    { run: 'token:tok_1', kind: 'called', n: 2 },
    { run: 'token:tok_1', kind: 'hello', n: 1 },
    { run: 'token:tok_1', kind: 'listed', n: 16 },
  ]);
  const after = ok<{ said: string; calls: number; builds: { build: string; n: number }[] }>(await api.doorSigns({}, owner));
  assert.equal(after.said, 'Sessions that connected in the last 7 days: 1. Given the tools: 1. Made a call: 1.');
  assert.equal(after.calls, 2);
  assert.deepEqual(after.builds, [{ build: '0.9.2', n: 1 }]);
  sql.close();
});

test('A SESSION WITH A RUN IS MARKED AGAINST THAT RUN, by its name, and a read-only key still says hello', async () => {
  const { api, sql } = await record();
  ok(await api.attach({ source: 'startup' }, agent('c-2')));
  assert.equal(runs(sql), 1);
  ok(await api.heard({ kind: 'hook', ms: 420 }, agent('c-2')));
  ok(await api.heard({ kind: 'hello' }, agent('c-3', 'read')));
  assert.equal(runs(sql), 1, 'the read-only session was given a run by its mark');
  const rows = marks(sql);
  assert.ok(rows.some((r) => /^S\d+$/.test(r.run) && r.kind === 'hook'), JSON.stringify(rows));
  assert.ok(rows.some((r) => r.run === 'token:tok_1' && r.kind === 'hello'), JSON.stringify(rows));
  sql.close();
});

test('A WRONG KEY, KIND OR VALUE IS REFUSED IN ONE SENTENCE that names the fix, and nothing is kept', async () => {
  const { api, sql } = await record();
  const stray = refused(await api.heard({ kind: 'called', count: 3 }, agent('c-1')));
  assert.equal(stray.code, 'FIELD_UNKNOWN');
  assert.equal(stray.fix, 'count is not something heard takes. It takes kind, n, ms, build, client.');
  assert.equal(refused(await api.heard({ kind: 'listen' }, agent('c-1'))).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refused(await api.heard({ kind: 'called', n: -1 }, agent('c-1'))).code, 'VALUE_MALFORMED');
  assert.equal(refused(await api.heard({ kind: 'hook', ms: 1.5 }, agent('c-1'))).code, 'VALUE_MALFORMED');
  assert.equal(refused(await api.heard({ kind: 'hello', build: 'x'.repeat(81) }, agent('c-1'))).code, 'OUT_OF_BOUNDS');
  assert.equal(refused(await api.heard(undefined, agent('c-1'))).code, 'VALUE_MALFORMED');
  assert.deepEqual(marks(sql), []);
  sql.close();
});

test('THE SIGNS ARE THE WHOLE RECORD’S: one held to a list is told so, one who may only add is held by the read guard', async () => {
  const { api, sql } = await record();
  const narrow: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, registers: ['tasks'] };
  const adder: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'append' } };
  assert.equal(refused(await api.doorSigns({}, narrow)).code, 'FORBIDDEN');
  assert.equal(refused(await api.doorSigns({}, adder)).code, 'LEVEL_REQUIRED');
  /* An appender may still leave a mark about her own connection: a mark is not a read. */
  ok(await api.heard({ kind: 'hello' }, adder));
  /* The agent on the owner's key reads them, and days narrows the window, within the 30 the marks are kept. */
  assert.match(ok<{ said: string }>(await api.doorSigns({ days: 1 }, agent('c-1'))).said, /^Sessions that connected in the last day: 1\./);
  assert.match(ok<{ said: string }>(await api.doorSigns({ days: '30' }, owner)).said, /last 30 days/);
  assert.equal(refused(await api.doorSigns({ days: 31 }, owner)).code, 'OUT_OF_BOUNDS');
  assert.equal(refused(await api.doorSigns({ since: 3 }, owner)).code, 'FIELD_UNKNOWN');
  sql.close();
});
