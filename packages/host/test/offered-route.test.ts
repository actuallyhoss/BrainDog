/**
 * `offered`, the agent door's list of resources in one read (AGT-B04): the record's method takes the caller alone,
 * `(ctx)`, so `handlersFor` wires it by hand, as it does `figures`, and the `routes/` loop leaves a handler written above
 * it alone. Before that the loop called it `(args, ctx)` and GET /api/offered answered 500 INTERNAL. A record built
 * before the method answers `NOT_IN_THIS_BUILD`, which is what the door falls back on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } };

const get = async (handlers: ReturnType<typeof handlersFor>) => {
  const res = await serveApi(new Request('https://x/api/offered'), handlers, owner);
  return { status: res.status, body: (await res.json()) as Answer };
};

test('GET /api/offered ANSWERS THE RECORD\'S LIST IN ONE READ, never a 500', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const { status, body } = await get(handlersFor(api as never));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  for (const part of ['fixed', 'lists', 'pages', 'figures', 'skills']) assert.ok(Array.isArray(body.value?.[part]), `${part} is a list`);
  sql.close();
});

test('A RECORD WITHOUT offered IS ANSWERED NOT_IN_THIS_BUILD', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const older = new Proxy(api, { get: (t, k) => (k === 'offered' ? undefined : Reflect.get(t, k)) });
  const { body } = await get(handlersFor(older as never));
  assert.equal(body.ok, false);
  assert.equal(body.refusal?.code, 'NOT_IN_THIS_BUILD');
  sql.close();
});
