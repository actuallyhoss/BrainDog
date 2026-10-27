/**
 * `end`, a closed session's run ended once: routed as a DATA write beside `attach` and `handoff`, handed to the
 * record method of the same name with the body as sent, and answered `NOT_IN_THIS_BUILD` by a record built before it
 * had one, never a 500. That answer is what the end hook falls back on, so a self-host not yet updated keeps its runs.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): DATA, a token's write, so the route table's DATA
 * rows grow by exactly this one and no browser-session group grows at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (scope: 'read' | 'propose' | 'write'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope, person: 'p_1', level: 'owner' },
  session: { client_id: 'claude-run-1', agent: 'claude' },
});
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const ENDED = { run: 'S7', state: 'done', changed: true };

const post = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, body?: unknown) => {
  const request =
    body === undefined ? new Request('https://x/api/end') : new Request('https://x/api/end', { method: 'POST', body: JSON.stringify(body) });
  const res = await serveApi(request, handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 8, 12)) });
  return { sql, api };
};

const runs = (sql: ReturnType<typeof openSqlite>): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n;

test('END IS ONE DATA WRITE, routed once from routes/, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'end');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['end', 'DATA', true]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'end').length, 1, 'served from routes/, not written twice');
  const what = rows[0]!.what;
  assert.match(what, /next step/u, 'the sentence says when a run waits instead of ending');
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP: end adds one DATA route and nothing a browser alone reaches', () => {
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'end'));
  assert.equal(all.DATA, (without.DATA ?? 0) + 1);
  for (const group of ['READ+', 'KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('IT REACHES THE RECORD METHOD OF ITS NAME as a POST, with the body as sent, and a GET is refused', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      end: async (args: unknown) => (heard.push({ ...(args as object) }), ok(ENDED)),
    }),
  );
  const out = await post(handlers, agent('propose'), { branch: 'main', head: 'a1b2c3d' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, value: ENDED });
  assert.deepEqual(heard, [{ branch: 'main', head: 'a1b2c3d' }]);
  assert.equal((await post(handlers, agent('propose'))).status, 405);
  sql.close();
});

test('THROUGH THE REAL RECORD: a person is never a run, a read token may not end one, and a state is refused, each before any run is opened', async () => {
  const { sql, api } = await fresh();
  const handlers = handlersFor(api);

  const person = await post(handlers, owner, {});
  assert.equal(person.body.refusal?.code, 'FORBIDDEN');
  assert.match(person.body.refusal?.fix ?? '', /a person is never a run/u);

  const reader = await post(handlers, agent('read'), {});
  assert.equal(reader.body.ok, false);

  const stated = await post(handlers, agent('propose'), { state: 'done' });
  assert.equal(stated.body.refusal?.code, 'FIELD_UNKNOWN');
  assert.equal(stated.body.refusal?.at, 'state');
  assert.match(stated.body.refusal?.fix ?? '', /picks the state itself/u);

  const stray = await post(handlers, agent('propose'), { next: 'Ship it' });
  assert.equal(stray.body.refusal?.code, 'FIELD_UNKNOWN');
  assert.equal(stray.body.refusal?.at, 'next');

  for (const r of [person, reader, stated, stray]) assert.doesNotMatch(r.body.refusal?.fix ?? '', /—/u);
  assert.equal(runs(sql), 0, 'a refused end opened a run');
  sql.close();
});

test('A RECORD WITHOUT END ANSWERS 501 WITH A SENTENCE, which is what the end hook falls back on, and nothing is changed', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { end: undefined });
  const out = await post(handlersFor(older as never), agent('propose'), { head: 'a1b2c3d' });
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  assert.equal(runs(sql), 0);
  sql.close();
});
