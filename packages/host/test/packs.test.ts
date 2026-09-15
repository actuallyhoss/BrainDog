/**
 * Turning a pack off and on over HTTP, through the wiring both hosts share.
 *
 * The status is what a client branches on: 422 for each refusal the switch can meet, 403 for a
 * token, and 200 for the cascade the refusal offered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    pack: 'portfolio',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    pack: 'work',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things', scope: {} },
    ],
  } as never,
};

type Answer = { ok: boolean; value?: Record<string, unknown> | Record<string, unknown>[]; refusal?: { code: string; allowed?: string[] } };

test('DISABLE AND ENABLE ARE ADMIN WRITES: 422 naming the dependents, 403 for a token, 200 for the cascade', async () => {
  for (const name of ['disablePack', 'enablePack']) {
    const route = ROUTES.find((r) => r.name === name) ?? assert.fail(`${name} is not routed`);
    assert.deepEqual([route.group, route.writes], ['ADMIN', true]);
  }

  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 15, 12)) });
  assert.ok((await api.kernel.install([THINGS, TASKS])).ok);
  const handlers = handlersFor(api);
  const call = async (name: string, body?: unknown, ctx: CallContext = owner) => {
    const request = body
      ? new Request(`https://x/api/${name}`, { method: 'POST', body: JSON.stringify(body) })
      : new Request(`https://x/api/${name}`);
    const res = await serveApi(request, handlers, ctx);
    return { status: res.status, body: (await res.json()) as Answer };
  };

  const alone = await call('disablePack', { id: 'portfolio' });
  assert.equal(alone.status, 422);
  assert.deepEqual([alone.body.refusal?.code, alone.body.refusal?.allowed], ['PACK_REQUIRED', ['work']]);

  const bearer = await call('disablePack', { id: 'portfolio', alsoDisable: ['work'] }, token);
  assert.deepEqual([bearer.status, bearer.body.refusal?.code], [403, 'NEEDS_BROWSER_SESSION']);

  const stray = await call('disablePack', { id: 'work', force: true });
  assert.deepEqual([stray.status, stray.body.refusal?.code], [422, 'FIELD_UNKNOWN']);

  const both = await call('disablePack', { id: 'portfolio', alsoDisable: ['work'] });
  assert.equal(both.status, 200);
  assert.deepEqual((both.body.value as { packs: string[] }).packs, ['portfolio', 'work']);

  const listed = await call('packs');
  assert.equal(listed.status, 200);
  assert.ok((listed.body.value as { disabled_at: string | null }[]).every((p) => p.disabled_at !== null), 'off is not absent');

  const write = await call('create', { register: 'tasks', fields: { what: 'Spacing' } });
  assert.deepEqual([write.status, write.body.refusal?.code], [422, 'PACK_DISABLED']);

  const early = await call('enablePack', { id: 'work' });
  assert.deepEqual([early.status, early.body.refusal?.code, early.body.refusal?.allowed], [422, 'PACK_DISABLED', ['portfolio']]);

  assert.equal((await call('enablePack', { id: 'portfolio' })).status, 200);
  assert.equal((await call('enablePack', { id: 'work' })).status, 200);
  sql.close();
});
