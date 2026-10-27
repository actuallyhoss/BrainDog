/**
 * `signs`, the record's vital signs: routed as a READ+ read that writes nothing, handed to the record method of
 * the same name, and answered `NOT_IN_THIS_BUILD` by a record built before it had one, never a 500.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): READ+, so a token may read it, the route table's
 * READ+ rows grow by exactly this one and nothing that writes grows at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const SIGNS = { signs: [{ sign: 'oldest-question', state: 'green', value: 0, said: 'Nothing is waiting on you', facts: [], days: [] }] };

const read = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, init?: RequestInit) => {
  const res = await serveApi(new Request('https://x/api/signs', init), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 8, 12)) });
  return { sql, api };
};

test('SIGNS IS ONE READ+ READ, routed once from routes/, taking nothing, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'signs');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['signs', 'READ+', false]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'signs').length, 1, 'served from routes/, not written twice');
  assert.deepEqual(rows[0]!.takes, {});
  const what = rows[0]!.what;
  assert.match(what, /changes nothing/u, 'the sentence says it changes nothing');
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP: signs adds one READ+ route and nothing that writes', () => {
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'signs'));
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 1);
  for (const group of ['DATA', 'KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('A TOKEN’S GET REACHES THE RECORD METHOD OF ITS NAME, and answers what the record said', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      signs: async (args: unknown) => (heard.push({ ...(args as object) }), ok(SIGNS)),
    }),
  );
  const out = await read(handlers, agent);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, value: SIGNS });
  assert.deepEqual(heard, [{}]);
  sql.close();
});

test('A CALLER HELD TO PART OF THE RECORD IS REFUSED, in one sentence, through the real record', async () => {
  const { sql, api } = await fresh();
  const narrow: CallContext = { ...agent, registers: ['tasks'] };
  const out = await read(handlersFor(api), narrow);
  assert.equal(out.body.ok, false);
  assert.equal(out.body.refusal?.code, 'FORBIDDEN');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});

test('A RECORD WITHOUT SIGNS ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { signs: undefined });
  const out = await read(handlersFor(older as never), agent);
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});
