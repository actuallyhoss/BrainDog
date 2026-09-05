/**
 * The half both hosts share.
 *
 * The failure this package exists to prevent is not a bug in a route — it is a route that exists in
 * the Worker and not in the self-host, so the product behaves differently depending on where a
 * customer runs it, and nobody finds out until a record moves between them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, httpStatus, serveApi, type Handler } from '../src/index.ts';
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

  /* Every route in the table is wired, which is the invariant the whole package is for. */
  const handlers: Record<string, Handler> = {
    boot: (_a, ctx) => api.boot(ctx as CallContext),
    version: (_a, ctx) => api.version(ctx as CallContext),
    schema: (a, ctx) => api.schema(a as never, ctx as CallContext),
    get: (a, ctx) => api.get(a as never, ctx as CallContext),
    list: (a, ctx) => api.list(a as never, ctx as CallContext),
    history: (a, ctx) => api.history(a as never, ctx as CallContext) as never,
    create: (a, ctx) => api.create(a as never, ctx as CallContext),
    update: (a, ctx) => api.update(a as never, ctx as CallContext),
  };

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
  const { handlers, sql } = await host();
  for (const route of ROUTES) assert.ok(handlers[route.name], `${route.name} is declared and not wired`);
  for (const name of Object.keys(handlers)) assert.ok(ROUTES.some((r) => r.name === name), `${name} is wired and not declared`);
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

  // 404: there is no such thing.
  assert.equal((await call('schema?register=atlantis')).status, 404);
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

test('the status table is closed, and an unknown code is a 500 rather than a plausible 400', async () => {
  assert.equal(httpStatus('VERSION_STALE'), 409);
  assert.equal(httpStatus('SCOPE_INSUFFICIENT'), 403);
  assert.equal(httpStatus('SCHEMA_MISMATCH'), 503);
  assert.equal(httpStatus('SOMETHING_NOBODY_MAPPED'), 500, 'an unmapped code was quietly given a 4xx');
});
