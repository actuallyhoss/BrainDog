/**
 * `heldTwice`, who may be on the record twice (AGT-D05): routed as a READ+ read that writes nothing, handed to the
 * record method of the same name with the list as it was sent, and answered `NOT_IN_THIS_BUILD` by a record built
 * before it had one, never a 500.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): READ+, since the method's first statement is
 * `guard(ctx, 'read', ...)`, so the table's READ+ rows grow by exactly this one and nothing that writes grows at all.
 *
 * WHETHER THE LIST IS WHERE THE RECORD KEEPS PEOPLE IS THE RECORD'S TO SAY, NOT THE HOST'S. The table says only that
 * `register` arrives as text, so a list named by anything else is refused here, at `register`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { ROUTES as OWN } from '../src/routes/held-twice.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const SAID = { seqs: [2, 5] };

const get = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, query: string) => {
  const res = await serveApi(new Request(`https://x/api/heldTwice${query}`), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13, 12)) });
  return { sql, api };
};

/** The record with a `heldTwice` that answers `said` and keeps what it was called with. */
const withHeldTwice = (api: object, said: unknown, heard: unknown[] = []) =>
  handlersFor(
    Object.assign(Object.create(api), {
      heldTwice: async (args: unknown, ctx: CallContext) => (heard.push([{ ...(args as object) }, ctx.principal.id]), said),
    }) as never,
  );

test('HELD TWICE IS ONE READ+ READ, written once in its file, taking the list, with a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['heldTwice', 'READ+', false]]);
  assert.deepEqual(OWN[0]!.takes, { register: 'text' });
  const what = OWN[0]!.what;
  assert.match(what, /changes nothing/u);
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b|\{\{/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP: heldTwice is routed once from routes/, adds one READ+ route and nothing that writes', () => {
  assert.deepEqual(ROUTES.filter((r) => r.name === 'heldTwice'), [OWN[0]], 'the table serves the row its file wrote');
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'heldTwice').length, 1, 'served from routes/, not written twice');
  const by = (rows: readonly { group: string }[]) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'heldTwice'));
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 1);
  for (const group of ['DATA', 'VAULT', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('A GET REACHES THE RECORD METHOD OF ITS NAME with the list as sent, for a person and for a token that reads', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = withHeldTwice(api, ok(SAID), heard);
  for (const ctx of [owner, agent]) {
    const out = await get(handlers, ctx, '?register=people');
    assert.deepEqual([out.status, out.body], [200, { ok: true, value: SAID }]);
  }
  assert.deepEqual(heard, [[{ register: 'people' }, 'p_1'], [{ register: 'people' }, 'tok_1']], 'the caller as the host knew them');
  sql.close();
});

test('NOTHING IS PASSED ON AS NOTHING, never as an empty answer: a list that is not where the record keeps people', async () => {
  const { sql, api } = await fresh();
  const out = await get(withHeldTwice(api, ok(null)), owner, '?register=things');
  assert.deepEqual([out.status, out.body], [200, { ok: true, value: null }]);
  sql.close();
});

test('A LIST NAMED BY SOMETHING THAT IS NOT TEXT IS REFUSED AT register, before the record hears it', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = withHeldTwice(api, ok(SAID), heard);
  for (const register of [7, ['people'], { length: 1 }]) {
    const res = await serveApi(
      new Request('https://x/api/heldTwice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ register }) }),
      handlers,
      owner,
    );
    const body = (await res.json()) as Answer;
    assert.equal(body.ok, false);
    assert.equal(body.refusal?.at, 'register');
    assert.notEqual(res.status, 500);
  }
  assert.deepEqual(heard, []);
  sql.close();
});

test('A RECORD WITHOUT HELD TWICE ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { heldTwice: undefined });
  const out = await get(handlersFor(older as never), owner, '?register=people');
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});

test('THROUGH THE REAL RECORD: a list it does not hold is refused by name in one sentence, and no list at all at register', async () => {
  const { sql, api } = await fresh();
  const unknown = await get(handlersFor(api), owner, '?register=nowhere');
  assert.equal(unknown.body.ok, false);
  assert.equal(unknown.body.refusal?.code, 'REGISTER_UNKNOWN');
  assert.notEqual(unknown.status, 500);
  const unnamed = await get(handlersFor(api), owner, '');
  assert.equal(unnamed.body.ok, false);
  assert.notEqual(unnamed.status, 500);
  assert.doesNotMatch(unnamed.body.refusal?.fix ?? '', /—|\bULIDs?\b/u);
  sql.close();
});
