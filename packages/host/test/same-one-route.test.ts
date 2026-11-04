/**
 * `sameOne`, a person asking whether entries held twice are one: routed as a DATA write, handed to the record
 * method of the same name with the list and the entries as they were sent, and answered `NOT_IN_THIS_BUILD` by a record
 * built before it had one, never a 500.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): DATA, since the method's first statement is
 * `guard(ctx, 'write', ...)`, so the table's DATA rows grow by exactly this one.
 *
 * WHAT `rows` MUST BE IS THE RECORD'S TO SAY, NOT THE HOST'S. The table says the shape each argument arrives in and is
 * not a validator (`ArgType` in `../src/index.ts`): a `register` that is not text is refused here, at `register`, and a
 * `rows` that is missing or not a list reaches the record untouched and is refused there, at `rows`, in its own words.
 *
 * THE ROW IS TESTED WHERE IT IS WRITTEN, AND THE SERVING ONCE IT IS REGISTERED. `routes/index.ts` is the integrator's
 * line, so the tests that go through `serveApi` skip with a sentence on a tree that has not registered the file yet, and
 * the last one asks the real record and skips on a tree whose record has no `sameOne`.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { ROUTES as OWN } from '../src/routes/same-one.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const A = '01JA0000000000000000000001';
const B = '01JA0000000000000000000002';
const ASKED = { question: '01JA00000000000000000000QQ' };

const post = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, body: unknown, init: RequestInit = {}) => {
  const res = await serveApi(
    new Request('https://x/api/sameOne', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init }),
    handlers,
    ctx,
  );
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13, 12)) });
  return { sql, api };
};

/** The record with a `sameOne` that answers `said` and keeps what it was called with. */
const withSameOne = (api: object, said: unknown, heard: unknown[] = []) =>
  handlersFor(
    Object.assign(Object.create(api), {
      sameOne: async (args: unknown, ctx: CallContext) => (heard.push([{ ...(args as object) }, ctx.principal.id]), said),
    }) as never,
  );

/** Whether `routes/index.ts` serves the file yet. A test that needs the serving skips with a sentence until it does. */
const unrouted = (t: TestContext): boolean => {
  if (ROUTES.some((r) => r.name === 'sameOne')) return false;
  t.skip('routes/index.ts does not register routes/same-one.ts yet, so only the row is tested');
  return true;
};

test('SAME ONE IS ONE DATA WRITE, written once in its file, taking the list and the entries, with a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['sameOne', 'DATA', true]]);
  assert.deepEqual(OWN[0]!.takes, { register: 'text', rows: 'json' });
  assert.equal(OWN[0]!.postRead, undefined, 'it opens a question, so it is no read sent as a write');
  const what = OWN[0]!.what;
  assert.match(what, /one question/u, 'the sentence says it asks once');
  assert.match(what, /merges them at once, with Undo/u, 'the sentence says only his own agent merges, and with Undo');
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP: sameOne is routed once from routes/, adds one DATA route and nothing else', (t) => {
  if (unrouted(t)) return;
  assert.deepEqual(ROUTES.filter((r) => r.name === 'sameOne'), [OWN[0]], 'the table serves the row its file wrote');
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'sameOne').length, 1, 'served from routes/, not written twice');
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'sameOne'));
  assert.equal(all.DATA, (without.DATA ?? 0) + 1);
  for (const group of ['READ+', 'KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('A POST REACHES THE RECORD METHOD OF ITS NAME with the list and the entries as sent, and answers its question', async (t) => {
  if (unrouted(t)) return;
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = withSameOne(api, ok(ASKED), heard);
  for (const ctx of [owner, member]) {
    const out = await post(handlers, ctx, { register: 'people', rows: [A, B] });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { ok: true, value: ASKED });
  }
  assert.deepEqual(heard, [[{ register: 'people', rows: [A, B] }, 'p_1'], [{ register: 'people', rows: [A, B] }, 'p_2']], 'the caller as the host knew them');
  sql.close();
});

test('A GET IS REFUSED, since asking opens a question, and the record is never called', async (t) => {
  if (unrouted(t)) return;
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const res = await serveApi(new Request(`https://x/api/sameOne?register=people&rows=${encodeURIComponent(JSON.stringify([A, B]))}`), withSameOne(api, ok(ASKED), heard), owner);
  assert.equal(res.status, 405);
  assert.equal(((await res.json()) as Answer).refusal?.code, 'ROUTE_UNKNOWN');
  assert.deepEqual(heard, []);
  sql.close();
});

test('A LIST NAMED BY SOMETHING THAT IS NOT TEXT IS REFUSED AT register, before the record hears it', async (t) => {
  if (unrouted(t)) return;
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = withSameOne(api, ok(ASKED), heard);
  for (const register of [{ length: 1 }, 7, ['people']]) {
    const out = await post(handlers, owner, { register, rows: [A, B] });
    assert.equal(out.status, 422);
    assert.equal(out.body.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(out.body.refusal?.at, 'register');
  }
  assert.deepEqual(heard, []);
  sql.close();
});

test('ROWS MISSING OR NOT A LIST REACH THE RECORD UNTOUCHED, and its refusal at rows is passed on in its own words', async (t) => {
  if (unrouted(t)) return;
  const { sql, api } = await fresh();
  const refusal = { code: 'REQUIRED_MISSING', fix: 'Say which people you mean: two or more of them.', at: 'rows' };
  const heard: unknown[] = [];
  const handlers = withSameOne(api, { ok: false, refusal }, heard);
  for (const body of [{ register: 'people' }, { register: 'people', rows: A }, { register: 'people', rows: { 0: A, length: 1 } }, { register: 'people', rows: null }]) {
    const out = await post(handlers, owner, body);
    assert.equal(out.body.ok, false);
    assert.deepEqual(out.body.refusal, refusal);
    assert.notEqual(out.status, 500);
    assert.notEqual(out.status, 200);
  }
  assert.deepEqual(
    heard.map((h) => (h as [unknown])[0]),
    [{ register: 'people' }, { register: 'people', rows: A }, { register: 'people', rows: { 0: A, length: 1 } }, { register: 'people', rows: null }],
    'nothing guessed at and nothing made into a list on the way',
  );
  sql.close();
});

test('A BODY THAT IS NOT AN OBJECT IS REFUSED AS A BODY, before the record hears it', async (t) => {
  if (unrouted(t)) return;
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const out = await post(withSameOne(api, ok(ASKED), heard), owner, [A, B]);
  assert.equal(out.status, 400);
  assert.equal(out.body.refusal?.code, 'BODY_MALFORMED');
  assert.deepEqual(heard, []);
  sql.close();
});

test('A RECORD WITHOUT SAME ONE ANSWERS 501 WITH A SENTENCE, never a 500', async (t) => {
  if (unrouted(t)) return;
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { sameOne: undefined });
  const out = await post(handlersFor(older as never), owner, { register: 'people', rows: [A, B] });
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});

test('THROUGH THE REAL RECORD: rows missing or not a list are refused by field name, in one sentence', async (t) => {
  if (unrouted(t)) return;
  const { sql, api } = await fresh();
  if (typeof (api as { sameOne?: unknown }).sameOne !== 'function') {
    sql.close();
    return t.skip('this tree’s record has no sameOne method yet, so only the host’s half is tested');
  }
  for (const body of [{ register: 'people' }, { register: 'people', rows: A }, { register: 'people', rows: { 0: A, length: 1 } }]) {
    const out = await post(handlersFor(api), owner, body);
    assert.equal(out.body.ok, false);
    assert.equal(out.body.refusal?.at, 'rows');
    assert.notEqual(out.status, 500);
    assert.doesNotMatch(out.body.refusal?.fix ?? '', /—|\bULIDs?\b/u);
  }
  sql.close();
});
