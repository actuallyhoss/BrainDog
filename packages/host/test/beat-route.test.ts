/**
 * `beat`, a session saying it is still working (AGT-C03 job 3): routed as a DATA call beside `end`, handed to the record
 * method of the same name with the body as sent, and answered `NOT_IN_THIS_BUILD` by a record built before it had one,
 * never a 500. That answer is what the hook's beat falls back on, so a self-host not yet updated loses nothing.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): DATA, a token's call, so the route table's DATA
 * rows grow by exactly this one and no browser-session group grows at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (scope: 'read' | 'propose' | 'write'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope, person: 'p_1', level: 'owner' },
  session: { client_id: 'claude-run-1', agent: 'claude' },
});
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const post = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, body?: unknown) => {
  const request =
    body === undefined ? new Request('https://x/api/beat') : new Request('https://x/api/beat', { method: 'POST', body: JSON.stringify(body) });
  const res = await serveApi(request, handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  return { sql, api, clock };
};

const runs = (sql: ReturnType<typeof openSqlite>): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n;

test('BEAT IS ONE DATA CALL, routed once from routes/, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'beat');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['beat', 'DATA', true]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'beat').length, 1, 'served from routes/, not written twice');
  const what = rows[0]!.what;
  assert.match(what, /still working/u);
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP: beat adds one DATA route and nothing a browser alone reaches', () => {
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'beat'));
  assert.equal(all.DATA, (without.DATA ?? 0) + 1);
  for (const group of ['READ+', 'VAULT', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('IT REACHES THE RECORD METHOD OF ITS NAME as a POST, with the body as sent, and a GET is refused', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      beat: async (args: unknown) => (heard.push({ ...(args as object) }), ok({ run: 'S7' })),
    }),
  );
  const out = await post(handlers, agent('propose'), {});
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, value: { run: 'S7' } });
  assert.deepEqual(heard, [{}]);
  assert.equal((await post(handlers, agent('propose'))).status, 405);
  sql.close();
});

test('THROUGH THE REAL RECORD: a run that wrote is heard from again, and one that never wrote is not opened', async () => {
  const { sql, api, clock } = await fresh();
  const handlers = handlersFor(api);
  assert.deepEqual((await post(handlers, agent('propose'), {})).body, { ok: true, value: { run: null } });
  assert.equal(runs(sql), 0, 'a beat opened a run');

  const tasks = { id: 'register.tasks', kind: 'register' as const, body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
  assert.ok((await api.kernel.install([tasks])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Write once' } }, agent('write'))).ok);
  clock.advance(20 * 60_000);
  assert.deepEqual((await post(handlers, agent('propose'), {})).body, { ok: true, value: { run: 'S1' } });
  const seen = sql.one<{ s: string }>("SELECT json_extract(fields, '$.last_seen') AS s FROM entry WHERE register = 'session'")!.s;
  assert.equal(seen, new Date(clock.now()).toISOString());
  sql.close();
});

test('A PERSON IS NEVER A RUN, a read key may not beat, and a record without beat answers 501 with a sentence', async () => {
  const { sql, api } = await fresh();
  const person = await post(handlersFor(api), owner, {});
  assert.equal(person.body.refusal?.code, 'FORBIDDEN');
  assert.match(person.body.refusal?.fix ?? '', /a person is never a run/u);
  assert.equal((await post(handlersFor(api), agent('read'), {})).body.ok, false);

  const older = Object.assign(Object.create(api) as typeof api, { beat: undefined });
  const out = await post(handlersFor(older as never), agent('propose'), {});
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  for (const r of [person, out]) assert.doesNotMatch(r.body.refusal?.fix ?? '', /—/u);
  assert.equal(runs(sql), 0);
  sql.close();
});
