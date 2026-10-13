/**
 * `setup`, the one call that makes a record from what a person accepted (USE-B04): routed as an ADMIN write and handed
 * to the record method of its name with the body as sent and the caller as the host knew them. The record says who may
 * (the owner, in a browser), so the host passes its refusal on with its status and decides nothing itself.
 *
 * THE RECORD'S METHOD LANDS BESIDE THIS ROUTE, in the same wave. Until it is there the route answers `NOT_IN_THIS_BUILD`,
 * and the last test here starts checking the real record the moment it has the method.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const colleague: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const ask = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, body?: unknown) => {
  const request = body === undefined ? new Request('https://x/api/setup') : new Request('https://x/api/setup', { method: 'POST', body: JSON.stringify(body) });
  const res = await serveApi(request, handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const record = async () => {
  const sql = openSqlite();
  return { sql, api: await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13)) }) };
};

test('SETUP IS AN ADMIN WRITE, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'setup');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['setup', 'ADMIN', true]]);
  assert.doesNotMatch(rows[0]!.what, /—|\bid\b|\brows?\b|\bentity\b/u);
  assert.equal(rows[0]!.takes, undefined, 'a write carries its own shapes in its body');
});

test('IT REACHES THE RECORD METHOD OF ITS NAME, with the body as sent, and answers what was done and what was not', async () => {
  const { sql, api } = await record();
  const heard: unknown[] = [];
  const answer = { done: ['work', 'people', 'me'], failed: [{ part: 'money', why: 'Money needs a currency first.' }] };
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, { setup: async (args: unknown) => (heard.push(args), ok(answer)) }),
  );
  const body = { usecase: 'founder', packs: ['work', 'people', 'money'], me: { name: 'Sam', email: 'sam@example.com' }, names: { tasks: 'jobs' }, again: true };
  const out = await ask(handlers, owner, body);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, value: answer });
  assert.deepEqual(heard.map((a) => ({ ...(a as object) })), [body]);
  assert.equal((await ask(handlers, owner)).status, 405, 'a GET changes nothing, so it is refused');
  sql.close();
});

test('SOMEBODY WHO IS NOT THE OWNER IS REFUSED BY THE RECORD, and the host hands that on with who asked', async () => {
  const { sql, api } = await record();
  const asked: unknown[] = [];
  /* The record's own door for an owner's call (`admin` in `packages/record/src/index.ts`), stood in for while the method lands. */
  const setup = async (_args: unknown, ctx: CallContext) => {
    asked.push(ctx.principal);
    if (ctx.principal.kind === 'token')
      return { ok: false as const, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot set this record up.', at: 'principal' } };
    if (ctx.principal.kind !== 'person' || ctx.principal.level !== 'owner')
      return { ok: false as const, refusal: { code: 'LEVEL_REQUIRED', fix: 'Only an owner sets this record up.', at: 'principal' } };
    return ok({ done: [], failed: [] });
  };
  const handlers = handlersFor(Object.assign(Object.create(api) as typeof api, { setup }));
  const out = await ask(handlers, colleague, { packs: ['work'] });
  assert.equal(out.status, 403);
  assert.equal(out.body.refusal?.code, 'LEVEL_REQUIRED');
  assert.deepEqual(asked, [colleague.principal], 'the caller reaches the record as the host knew them');
  assert.equal((await ask(handlers, owner, { packs: [] })).status, 200);
  sql.close();
});

test('ON THE RECORD ITSELF: answered when the record has the method, and said plainly when it has not', async () => {
  const { sql, api } = await record();
  const handlers = handlersFor(api);
  const out = await ask(handlers, colleague, { packs: [] });
  if (typeof (api as unknown as Record<string, unknown>).setup !== 'function') {
    assert.equal(out.status, 501);
    assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.equal(out.body.refusal?.at, 'setup', 'the client reads this to tell no such call from a refusal of the record');
    assert.doesNotMatch(out.body.refusal?.fix ?? '', /—|\brows?\b/u);
  } else {
    assert.equal(out.body.ok, false, `a colleague set a record up: ${JSON.stringify(out.body)}`);
    assert.equal(out.status, 403);
    const mine = await ask(handlers, owner, {});
    if (mine.body.ok) {
      const value = mine.body.value as { done?: unknown; failed?: unknown };
      assert.ok(Array.isArray(value.failed), 'failed is a list of { part, why }');
      assert.ok('done' in value);
    }
  }
  sql.close();
});
