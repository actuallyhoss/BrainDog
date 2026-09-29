/**
 * The Worker's half of a token's reach: `bearerOf` puts the reach `verifyToken` read from the token's own row on the token
 * principal, and the record's inbox gate then admits that token and no other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type TokenReach } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { bearerOf, type BearerDeps, type Held } from '../src/session.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 25, 9);

async function worker() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const deps: BearerDeps = {
    knows: async (record) => record === REC,
    verify: async (_record, bearer, surface) => {
      const out = await api.kernel.verifyToken(bearer, surface);
      return out.ok ? out.value : null;
    },
    access: async (_record, person) => (api.kernel.access(person) as Held | null),
  };
  const mint = async (reach?: TokenReach[]) => {
    const out = await api.kernel.createToken('p_1', { scope: 'read', label: 'agent', ...(reach ? { reach } : {}) });
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.bearer;
  };
  const ask = async (bearer: string) => {
    const seen = await bearerOf(new Request('https://app.brain.dog/api/inbox', { method: 'POST', headers: { authorization: `Bearer ${bearer}` } }), 'api', deps);
    assert.ok('ctx' in seen, JSON.stringify(seen));
    return { seen, answer: await api.inbox(undefined, seen.ctx) };
  };
  return { api, deps, mint, ask };
}

test('A TOKEN THE OWNER MINTED WITH THE INBOX REACH READS THE INBOX THROUGH THE WORKER', async () => {
  const w = await worker();
  const { seen, answer } = await w.ask(await w.mint(['inbox']));
  const { id: _id, ...principal } = (seen as { ctx: { principal: { id: string } } }).ctx.principal;
  assert.deepEqual(principal, { kind: 'token', scope: 'read', person: 'p_1', level: 'owner', reach: ['inbox'] });
  assert.ok(answer.ok, JSON.stringify(answer));
});

test('AND ONE WITHOUT IT IS REFUSED, with a principal that carries no reach at all', async () => {
  const w = await worker();
  const { seen, answer } = await w.ask(await w.mint());
  assert.equal('reach' in (seen as { ctx: { principal: object } }).ctx.principal, false);
  assert.equal(answer.ok, false);
  assert.equal((answer as { refusal: { code: string } }).refusal.code, 'FORBIDDEN');
});

test('A REACH THAT CROSSES THE RPC AS TEXT IS NOT A LIST, and opens nothing', async () => {
  const w = await worker();
  const bearer = await w.mint(['inbox']);
  const deps: BearerDeps = { ...w.deps, verify: async (r, b, s) => ({ ...(await w.deps.verify(r, b, s))!, reach: 'no-inbox' as never }) };
  const seen = await bearerOf(new Request('https://app.brain.dog/api/inbox', { method: 'POST', headers: { authorization: `Bearer ${bearer}` } }), 'api', deps);
  assert.equal('reach' in (seen as { ctx: { principal: object } }).ctx.principal, false);
});
