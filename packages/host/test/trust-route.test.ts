/**
 * `trust`, each agent's standing on the ladder (ENG-A12): routed as a READ+ read that writes nothing, handed to the
 * record method of the same name, and answered `NOT_IN_THIS_BUILD` by a record built before it had one, never a 500.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): READ+, so the route table's READ+ rows grow by
 * exactly this one and nothing that writes grows at all.
 *
 * WHO MAY READ IT IS THE RECORD'S TO SAY, NOT THE HOST'S. The method's first statement is its guard, so the host hands
 * the owner's and a member's call over alike and answers a refusal as the record worded it. The last test asks the
 * real record, and skips with a sentence on a tree whose record has no `trust` yet.
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
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

/* The shape the record's `trust` answers: an agent by its name, and each kind of change with the rung it stands on. */
const STANDING = {
  agents: [
    {
      agent: 'Claude Code',
      kinds: [
        { kind: 'changing a task', rung: 'tell', since: '2026-10-01T09:00:00.000Z', lifted: false, dropped: null },
        { kind: 'adding a payment', rung: 'ask', since: '2026-10-05T09:00:00.000Z', lifted: false, dropped: { at: '2026-10-05T09:00:00.000Z', why: null } },
      ],
    },
  ],
};

const read = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, init?: RequestInit) => {
  const res = await serveApi(new Request('https://x/api/trust', init), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 13, 12)) });
  return { sql, api };
};

/** The record with a `trust` that answers `said` and keeps what it was called with. */
const withTrust = (api: object, said: unknown, heard: unknown[] = []) =>
  handlersFor(
    Object.assign(Object.create(api), {
      trust: async (args: unknown, ctx: CallContext) => (heard.push([{ ...(args as object) }, ctx.principal.id]), said),
    }) as never,
  );

test('TRUST IS ONE READ+ READ, routed once from routes/, taking nothing, with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'trust');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['trust', 'READ+', false]]);
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'trust').length, 1, 'served from routes/, not written twice');
  assert.deepEqual(rows[0]!.takes, {});
  const what = rows[0]!.what;
  assert.match(what, /changes nothing/u, 'the sentence says it changes nothing');
  assert.match(what, /Ask, Do and tell or Do quietly/u, 'the sentence names the three rungs as a person reads them');
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP: trust adds one READ+ route and nothing that writes', () => {
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'trust'));
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 1);
  for (const group of ['DATA', 'KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('THE OWNER, A MEMBER AND A TOKEN ARE EACH HANDED TO THE RECORD METHOD OF ITS NAME, and answered what it said', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = withTrust(api, ok(STANDING), heard);
  for (const ctx of [owner, member, agent]) {
    const out = await read(handlers, ctx);
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { ok: true, value: STANDING });
  }
  assert.deepEqual(heard, [[{}, 'p_1'], [{}, 'p_2'], [{}, 'tok_1']], 'no argument, and the caller as the host knew them');
  sql.close();
});

test('A REFUSAL IS THE RECORD’S, passed on in its own words and never a 500', async () => {
  const { sql, api } = await fresh();
  const refusal = { code: 'FORBIDDEN', fix: 'You may not read Agents on this record, so nothing was read.' };
  const out = await read(withTrust(api, { ok: false, refusal }), member);
  assert.equal(out.body.ok, false);
  assert.deepEqual(out.body.refusal, refusal);
  assert.notEqual(out.status, 500);
  assert.notEqual(out.status, 200);
  sql.close();
});

test('A RECORD WITHOUT TRUST ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { trust: undefined });
  const out = await read(handlersFor(older as never), owner);
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});

test('THROUGH THE REAL RECORD: the owner is served, and a caller held away from Agents is refused in one sentence', async (t) => {
  const { sql, api } = await fresh();
  if (typeof (api as { trust?: unknown }).trust !== 'function') {
    sql.close();
    return t.skip('this tree’s record has no trust method yet, so only the host’s half is tested');
  }
  const served = await read(handlersFor(api), owner);
  assert.equal(served.status, 200);
  assert.ok(Array.isArray((served.body.value as { agents?: unknown }).agents), 'the answer holds its agents');
  const narrow: CallContext = { ...agent, registers: ['tasks'] };
  const out = await read(handlersFor(api), narrow);
  assert.equal(out.body.ok, false);
  assert.equal(out.body.refusal?.code, 'FORBIDDEN');
  assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  sql.close();
});
