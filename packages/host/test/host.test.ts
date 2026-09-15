/**
 * The half both hosts share.
 *
 * The failure this package exists to prevent is not a bug in a route — it is a route that exists in
 * the Worker and not in the self-host, so the product behaves differently depending on where a
 * customer runs it, and nobody finds out until a record moves between them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clash, no, ok } from '@braindog/ports';

import { ROUTES, handlersFor, httpStatus, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; allowed?: string[] } };

async function host() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);

  /* Through `handlersFor`, which is what both hosts call — a test that built its own map would be
     testing a third wiring nobody ships. */
  const handlers = handlersFor(api);

  const call = async (name: string, body?: unknown, ctx: CallContext = owner) => {
    const request = body
      ? new Request(`https://x/api/${name}`, { method: 'POST', body: JSON.stringify(body) })
      : new Request(`https://x/api/${name}`);
    const res = await serveApi(request, handlers, ctx);
    return { status: res.status, body: (await res.json()) as Answer };
  };

  return { api, sql, call, handlers };
}

test('EVERY ROUTE IN THE TABLE IS WIRED, which is the whole reason the table is data', async () => {
  // `handlersFor` throws if the two ever disagree, so this asserts the shape it produced rather than
  // re-checking the check. What it adds is the sentence: a route nobody can read about is a route
  // nobody calls.
  const { handlers, sql } = await host();
  assert.equal(Object.keys(handlers).length, ROUTES.length);
  for (const route of ROUTES) assert.ok(handlers[route.name], `${route.name} is declared and not wired`);
  assert.ok(ROUTES.every((r) => r.what.length > 20), 'a route with no sentence is a route nobody can call');
  sql.close();
});

test('a read is a GET with its arguments in the query string, and a predicate survives the trip', async () => {
  const { call, sql } = await host();
  await call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } });
  await call('create', { register: 'obligations', fields: { what: 'Invoice 42', state: 'paid' } });

  const all = await call('list?register=obligations');
  assert.equal(all.status, 200);
  assert.equal((all.body.value as { matched: number }).matched, 2);

  const open = await call(`list?register=obligations&where=${encodeURIComponent(JSON.stringify({ field: 'state', is: 'open' }))}`);
  assert.equal((open.body.value as { matched: number }).matched, 1);
  sql.close();
});

test('what is new and the log are reads, with their numbers checked on the way in', async () => {
  const { call, sql } = await host();
  await call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } });

  const news = await call('whatsNew');
  assert.equal(news.status, 200);
  assert.equal((news.body.value as { events: { title: string | null }[] }).events[0]?.title, 'Invoice 41');

  const page = await call('recentHistory?limit=1');
  assert.equal(page.status, 200);
  assert.equal((page.body.value as { events: unknown[] }).events.length, 1);

  const bad = await call('recentHistory?cursor=soon');
  assert.equal(bad.status, 422);
  assert.equal(bad.body.refusal?.code, 'VALUE_MALFORMED');
  sql.close();
});

test('the inbox is a read an owner makes, and a token is refused it', async () => {
  const { api, call, sql } = await host();
  api.kernel.arrive({ channel: 'email', headers: { From: 'billing@fenwick.example', Subject: 'Your invoice' }, body: 'Total GBP 58.00', sha256: 'h1' });
  api.kernel.arrive({ channel: 'email', headers: { From: 'ap@halden.example', Subject: 'RE: Invoice 41' }, body: 'Paying on the 12th', sha256: 'h2' });

  const page = await call('inbox?limit=1');
  assert.equal(page.status, 200);
  const value = page.body.value as { arrivals: { subject: string }[]; cursor: number | null };
  assert.deepEqual(value.arrivals.map((a) => a.subject), ['RE: Invoice 41']);
  assert.notEqual(value.cursor, null);

  const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'owner' } };
  const refused = await call('inbox', undefined, token);
  assert.equal(refused.body.refusal?.code, 'FORBIDDEN');
  assert.equal(refused.body.value, undefined);

  const bad = await call('inbox?cursor=soon');
  assert.equal(bad.body.refusal?.code, 'VALUE_MALFORMED');
  sql.close();
});

test('A WRITE IS A POST, because a GET that changes something is a change a prefetch can make', async () => {
  const { call, sql } = await host();
  const wrong = await call('create');
  assert.equal(wrong.status, 405);
  assert.match(wrong.body.refusal?.fix ?? '', /changes the record/);
  sql.close();
});

test('a refusal carries its sentence and a status that says what to do about it', async () => {
  const { call, sql } = await host();
  await call('create', { register: 'obligations', fields: { what: 'a' } });

  // 422: fix the value.
  const bad = await call('create', { register: 'obligations', fields: { amount: { amount: 1, currency: 'GBP' } } });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.refusal?.code, 'REQUIRED_MISSING');

  // 409: re-read, do not retry.
  const stale = await call('update', { register: 'obligations', seq: 1, patch: { what: 'b' }, version: 99 });
  assert.equal(stale.status, 409);

  // 403: retrying will never work.
  const forbidden = await call('create', { register: 'obligations', fields: { what: 'x' } }, {
    principal: { kind: 'token', id: 't', scope: 'read', person: 'p_1', level: 'owner' },
  });
  assert.equal(forbidden.status, 403);

  // 422: a register nobody declared is a value the caller can fix, not a missing route. 30 §6 is
  // explicit that ANY refusal is a 422 — the exceptions are enumerated and this is not one of them.
  const nowhere = await call('schema?register=atlantis');
  assert.equal(nowhere.status, 422);
  assert.equal(nowhere.body.refusal?.code, 'REGISTER_UNKNOWN');
  sql.close();
});

test('a route that does not exist says which ones do', async () => {
  const { call, sql } = await host();
  const out = await call('nonsense');
  assert.equal(out.status, 404);
  assert.equal(out.body.refusal?.code, 'ROUTE_UNKNOWN');
  assert.ok(out.body.refusal?.allowed?.includes('list'));
  sql.close();
});

test('a body that is not a JSON object is refused before anything reads it', async () => {
  const res = await serveApi(
    new Request('https://x/api/create', { method: 'POST', body: 'not json' }),
    { create: async () => ({ ok: true, value: null }) },
    owner,
  );
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as Answer).refusal?.code, 'BODY_MALFORMED');
});

test('every answer has one shape, and no answer is cacheable', async () => {
  // A client that has to branch on shape per route is a client that gets one of them wrong. And one
  // customer's answer must never be served to another.
  const { call, sql } = await host();
  for (const name of ['boot', 'version', 'list?register=obligations', 'schema?register=obligations']) {
    const out = await call(name);
    assert.equal(out.status, 200, name);
    assert.equal(out.body.ok, true, `${name} answered in a different shape`);
    assert.ok('value' in out.body);
  }
  const res = await serveApi(new Request('https://x/api/boot'), { boot: async () => ({ ok: true, value: 1 }) }, owner);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  sql.close();
});

test('THE STATUS COMES FROM THE SHAPE, so a code nobody enumerated is still a 422', () => {
  // The table this replaced had forty rows and two ways to be wrong: a code nobody remembered to add
  // came back as a 500 — an ordinary "you typed the wrong enum value" arriving as "the server is
  // broken" — and a code somebody guessed at got a 409, telling a client to re-read a row that never
  // moved and retry a write that will be refused forever.
  assert.equal(httpStatus(no('SOMETHING_NOBODY_MAPPED', 'x')), 422);
  assert.equal(httpStatus(no('ENUM_VALUE_UNKNOWN', 'x')), 422);
  assert.equal(httpStatus(ok(1)), 200);
});

test('and a conflict is a 409 while a refusal never is', () => {
  // The one distinction a client acts on: 409 means re-read and re-apply, 422 means fix the value.
  assert.equal(httpStatus(clash(7, { id: 'x' }, 'p_ada')), 409);
  // `PLAN_STALE` and `IMPORT_NOT_EMPTY` read like conflicts and are refusals — 30 §6 says so by name,
  // because repeating either will fail again until the caller does something different.
  assert.equal(httpStatus(no('PLAN_STALE', 'x')), 422);
  assert.equal(httpStatus(no('IMPORT_NOT_EMPTY', 'x')), 422);
  assert.equal(httpStatus(no('UNIQUE_VIOLATION', 'x')), 422);
});

test('the four exceptions each say something different to the caller', () => {
  assert.equal(httpStatus(no('UNAUTHORIZED', 'x')), 401, 'the credential is wrong');
  assert.equal(httpStatus(no('FORBIDDEN', 'x')), 403, 'retrying will never work');
  assert.equal(httpStatus(no('NEEDS_BROWSER_SESSION', 'x')), 403, 'the wrong KIND of credential, with the envelope');
  assert.equal(httpStatus(no('SCHEMA_NEWER', 'x')), 503, 'a deploy fixes it');
});

test('A CONFLICT LEAVES THE HOST AS A CONFLICT, body and all', async () => {
  // The body is the whole point: `current` is the row as it now stands and `actor` is who moved it,
  // and without both the client cannot re-apply — which is what a 409 is instructing it to do.
  const res = await serveApi(
    new Request('https://x/api/boot'),
    { boot: async () => clash(41, { id: 'obligations#1', fields: { due: '2026-07-27' } }, 'p_ada') },
    owner,
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { ok: boolean; conflict: { version: number; actor: string; current: unknown } };
  assert.equal(body.ok, false);
  assert.equal(body.conflict.version, 41);
  assert.equal(body.conflict.actor, 'p_ada');
  assert.deepEqual(body.conflict.current, { id: 'obligations#1', fields: { due: '2026-07-27' } });
});
