/**
 * `faults`, `retryFault` and `withdraw` (AGT-C06, AGT-C07): routed in the groups `docs/30-BLUEPRINT.md` §5 gives them,
 * handed to the record methods of the same names, and answered `NOT_IN_THIS_BUILD` by a record built before them,
 * never a 500.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS: `faults` READ+ and writing nothing, so an owner's agent may read it;
 * `retryFault` ADMIN, so only the owner in a browser queues a dead job again; `withdraw` DATA, the other half of
 * `propose`, so the agent that asked may take it back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' }, session: { client_id: 'c1', agent: 'claude' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const FAULTS = { faults: [{ cause: 'outbox#infer.resolve', said: 'BrainDog could not check for people who are here twice. It tries again tonight.', count: 8, since: '2026-10-01T03:00:00Z', last: '2026-10-09T03:00:00Z' }] };

const call = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, name: string, body?: unknown) => {
  const init = body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) };
  const res = await serveApi(new Request(`https://x/api/${name}`, init), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 9, 12)) });
  return { sql, api };
};

const by = (rows: readonly { group: string }[]) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});

test('THREE ROWS, EACH ROUTED ONCE FROM routes/, in the group §5 gives it, each with a plain sentence', () => {
  const want = [['faults', 'READ+', false], ['retryFault', 'ADMIN', true], ['withdraw', 'DATA', true]];
  for (const [name, group, writes] of want) {
    const rows = ROUTES.filter((r) => r.name === name);
    assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [[name, group, writes]]);
    assert.equal(EXTRA_ROUTES.filter((r) => r.name === name).length, 1, `${String(name)} is served from routes/, not written twice`);
    assert.doesNotMatch(rows[0]!.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|#/u, 'the sentence names things as a person does');
  }
  assert.deepEqual(ROUTES.find((r) => r.name === 'faults')!.takes, {});
  assert.match(ROUTES.find((r) => r.name === 'faults')!.what, /changes nothing/u);
});

test('THE ROUTES COUNT BY GROUP: one READ+, one ADMIN and one DATA, and nothing else grows', () => {
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => !['faults', 'retryFault', 'withdraw'].includes(r.name)));
  for (const group of ['READ+', 'ADMIN', 'DATA']) assert.equal(all[group], (without[group] ?? 0) + 1, `${group} grew by one`);
  for (const group of ['VAULT', 'JOBS']) assert.equal(all[group], without[group], `${group} grew`);
});

test('EACH REACHES THE RECORD METHOD OF ITS NAME, faults as a GET and the two writes as a POST with the body as sent', async () => {
  const { sql, api } = await fresh();
  const heard: [string, unknown][] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      faults: async (args: unknown) => (heard.push(['faults', { ...(args as object) }]), ok(FAULTS)),
      retryFault: async (args: unknown) => (heard.push(['retryFault', args]), ok({ cause: 'outbox#infer.resolve', queued: 1 })),
      withdraw: async (args: unknown) => (heard.push(['withdraw', args]), ok({ id: 'SG90', state: 'withdrawn' })),
    }),
  );
  assert.deepEqual((await call(handlers, agent, 'faults')).body, { ok: true, value: FAULTS });
  assert.equal((await call(handlers, owner, 'retryFault', { cause: 'outbox#infer.resolve' })).status, 200);
  assert.deepEqual((await call(handlers, agent, 'withdraw', { id: 'SG90' })).body, { ok: true, value: { id: 'SG90', state: 'withdrawn' } });
  assert.deepEqual(heard, [['faults', {}], ['retryFault', { cause: 'outbox#infer.resolve' }], ['withdraw', { id: 'SG90' }]]);
  assert.equal((await call(handlers, owner, 'retryFault')).status, 405, 'a write is not a GET');
  sql.close();
});

test('THROUGH THE REAL RECORD: a member may not read faults, and a token may not retry one', async () => {
  const { sql, api } = await fresh();
  const handlers = handlersFor(api);
  const read = await call(handlers, member, 'faults');
  assert.equal(read.body.refusal?.code, 'FORBIDDEN');
  const retry = await call(handlers, agent, 'retryFault', { cause: 'outbox#infer.resolve' });
  assert.equal(retry.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  for (const r of [read, retry]) assert.doesNotMatch(r.body.refusal?.fix ?? '', /—/u);
  sql.close();
});

test('A RECORD WITHOUT THEM ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { faults: undefined, retryFault: undefined, withdraw: undefined });
  const handlers = handlersFor(older as never);
  for (const out of [await call(handlers, agent, 'faults'), await call(handlers, owner, 'retryFault', { cause: 'outbox#x' }), await call(handlers, agent, 'withdraw', { id: 'SG1' })]) {
    assert.equal(out.status, 501);
    assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  }
  sql.close();
});
