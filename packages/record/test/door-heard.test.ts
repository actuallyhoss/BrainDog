/**
 * `heard` and `doorHeard`: who may leave which of the door's marks (audit 38-39, findings 2 and 5).
 *
 * WHAT IS ASSERTED IS THE EDGE EACH FINDING WAS: a key that POSTs `{ kind: 'called' }` to the routed `heard` is refused
 * in one sentence and moves no mark, no last tool call and no sign, so `delivered` reads red for a run that called
 * nothing; the door's own `called`, through `doorHeard`, moves the key's `last_tool_at` and turns `delivered` green.
 * `doorHeard` is not a row in the host's route table, so nothing over /api reaches it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES } from '../../host/src/routes/door.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import type { DoorHealth } from '../src/methods/door.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (token: string): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: `c-${token}`, agent: 'claude', host: 'studio-mac', client: 'claude-code', client_version: '2.1.4' },
});

const ok = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(r));
  return out.value as T;
};

const refused = (r: unknown): { code: string; fix: string; at?: string } => {
  const out = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(out.ok, false, JSON.stringify(r));
  return out.refusal!;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  ok(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const id = ok<{ id: string }>(await api.createToken({ scope: 'write', label: 'Studio Mac' }, owner)).id;
  ok(await api.attach({ source: 'startup' }, agent(id)));
  return { api, sql, id };
}

const lastTool = (sql: NodeSql, id: string) => sql.one<{ at: string | null }>('SELECT last_tool_at AS at FROM token WHERE id = ?', id)!.at;
const markCount = (sql: NodeSql) => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM door_mark')!.n;

test('A POSTED CALLED IS REFUSED: no mark, no last tool call, and delivered stays red', async () => {
  const { api, sql, id } = await record();
  const before = markCount(sql);
  for (const kind of ['hello', 'listed', 'called', 'internal']) {
    const no = refused(await api.heard({ kind, n: 1 }, agent(id)));
    assert.equal(no.code, 'FORBIDDEN');
    assert.equal(no.at, 'kind');
    assert.equal(no.fix, `The agent door marks ${kind} itself when a session reaches it, so heard takes only hook.`);
    assert.ok(!no.fix.includes('—'), 'an em dash in a refusal a person reads');
  }
  assert.equal(markCount(sql), before, 'a refused mark was kept');
  assert.equal(lastTool(sql, id), null);
  const health = ok<DoorHealth>(await api.doorHealth({}, owner));
  assert.equal(health.signs.delivered, 1, 'a key said it called a tool, and the sign believed it');
  assert.equal(health.connections[0]!.last_tool_at, null);
  sql.close();
});

test('THE START HOOK STILL POSTS: heard keeps hook, and refuses a kind that is not a mark at all', async () => {
  const { api, sql, id } = await record();
  ok(await api.heard({ kind: 'hook', ms: 420, build: '2026.10.09+1a2b3c4' }, agent(id)));
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM door_mark WHERE kind = 'hook'")!.n, 1);
  assert.equal(refused(await api.heard({ kind: 'listen' }, agent(id))).fix, 'kind is hook.');
  assert.equal(lastTool(sql, id), null, 'a hook moved the last tool call');
  sql.close();
});

test('THE DOOR’S CALLED MOVES THE KEY’S LAST TOOL CALL, and delivered turns green', async () => {
  const { api, sql, id } = await record();
  ok(await api.doorHeard({ kind: 'hello', build: '0.9.2', client: 'claude-code 2.1.4' }, agent(id)));
  ok(await api.doorHeard({ kind: 'listed', n: 16 }, agent(id)));
  assert.equal(lastTool(sql, id), null, 'a hello or a tool list is not a tool call');
  ok(await api.doorHeard({ kind: 'called', n: 1 }, agent(id)));
  assert.equal(lastTool(sql, id), new Date(NOW).toISOString());
  const health = ok<DoorHealth>(await api.doorHealth({}, owner));
  assert.equal(health.signs.delivered, 0);
  assert.equal(health.connections[0]!.last_tool_at, new Date(NOW).toISOString());
  sql.close();
});

test('DOORHEARD TAKES ONLY THE DOOR’S FOUR, a person moves no key, and no route reaches it', async () => {
  const { api, sql, id } = await record();
  assert.equal(refused(await api.doorHeard({ kind: 'hook', ms: 3 }, agent(id))).code, 'FIELD_UNKNOWN');
  assert.equal(refused(await api.doorHeard({ kind: 'hook' }, agent(id))).fix, 'kind is one of hello, listed, called, internal.');
  ok(await api.doorHeard({ kind: 'called', n: 2 }, owner));
  assert.equal(lastTool(sql, id), null, 'a person’s call moved a key');
  assert.ok(!ROUTES.some((r) => r.name === 'doorHeard'), 'doorHeard is a route, so a key could post it');
  assert.ok(ROUTES.some((r) => r.name === 'heard'));
  sql.close();
});
