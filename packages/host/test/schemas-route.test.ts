/**
 * `schemas`, several lists' declarations in one read: routed as a READ+ read that writes nothing, handed to the record
 * method of the same name with the lists as they were sent, and answered `NOT_IN_THIS_BUILD` by a record built before
 * it had one, never a 500, so a client can fall back to asking `schema` once a list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { ROUTES as OWN } from '../src/routes/schemas.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: { lists: Record<string, unknown>; refused: Record<string, { code: string }> }; refusal?: { code: string; fix: string; at?: string } };

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 21, 12)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  await api.kernel.install([
    { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
  ] as never);
  return { sql, api };
};

const get = async (handlers: ReturnType<typeof handlersFor>, query: string) => {
  const res = await serveApi(new Request(`https://x/api/schemas${query}`), handlers, owner);
  return { status: res.status, body: (await res.json()) as Answer };
};

test('SCHEMAS IS ONE READ+ READ, written once in its file, taking the lists as JSON, with a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['schemas', 'READ+', false]]);
  assert.deepEqual(OWN[0]!.takes, { registers: 'json', every: 'json' });
  assert.match(OWN[0]!.what, /changes nothing/u);
  assert.doesNotMatch(OWN[0]!.what, /—|\bids?\b|\brows?\b|\{\{/u);
  assert.deepEqual(ROUTES.filter((r) => r.name === 'schemas'), [OWN[0]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'schemas').length, 1);
});

test('A GET CARRIES THE LISTS AS A LIST and the record answers each', async () => {
  const { sql, api } = await fresh();
  const out = await get(handlersFor(api), `?registers=${encodeURIComponent(JSON.stringify(['things', 'nowhere']))}`);
  assert.equal(out.status, 200);
  assert.deepEqual(Object.keys(out.body.value?.lists ?? {}), ['things']);
  assert.equal(out.body.value?.refused.nowhere?.code, 'REGISTER_UNKNOWN');
  sql.close();
});

test('EVERY LIST ASKED AS true, from an address, is every list the caller reads', async () => {
  const { sql, api } = await fresh();
  const out = await get(handlersFor(api), '?every=true');
  assert.equal(out.status, 200);
  assert.ok(Object.keys(out.body.value?.lists ?? {}).includes('things'));
  sql.close();
});

test('NO LISTS, OR NOT A LIST, IS REFUSED AT registers, never a 500', async () => {
  const { sql, api } = await fresh();
  for (const q of ['', '?registers=things', '?registers=%5B7%5D']) {
    const out = await get(handlersFor(api), q);
    assert.equal(out.body.ok, false, q);
    assert.equal(out.body.refusal?.at, 'registers', q);
    assert.notEqual(out.status, 500);
  }
  sql.close();
});

test('A RECORD WITHOUT SCHEMAS ANSWERS 501 NOT_IN_THIS_BUILD, which a client reads as ask schema once a list', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { schemas: undefined });
  const out = await get(handlersFor(older as never), `?registers=${encodeURIComponent(JSON.stringify(['things']))}`);
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  sql.close();
});
