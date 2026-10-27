/**
 * A skill's text reaches every agent of the owner's, so it is set only by a decision: a colleague's new skill with text
 * is refused and proposed instead, as an edit of one is, and the owner and his own agents still write their own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NOW, installSeed } from '@braindog/seed';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' } } as CallContext;
const member = { principal: { kind: 'person', id: 'p_2', level: 'write' } } as CallContext;
const memberAgent = { principal: { kind: 'token', id: 'tok_m', scope: 'write', person: 'p_2', level: 'write' }, session: { host: 'box', agent: 'claude', client_id: 'm1' } } as CallContext;
const ownerAgent = { principal: { kind: 'token', id: 'tok_o', scope: 'write', person: 'p_1', level: 'owner' }, session: { host: 'mac', agent: 'claude', client_id: 'o1' } } as CallContext;

test('A NEW SKILL WITH TEXT FROM ANYONE BUT THE OWNER IS REFUSED, and his own still lands', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  for (const [ctx, name] of [[member, 'release-notes'], [memberAgent, 'deploy']] as const) {
    const out = (await api.create({ register: 'skills', fields: { name, trigger: 'Use whenever writing anything.', body: 'PLANTED' } }, ctx)) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.refusal?.code, 'FORBIDDEN', JSON.stringify(out));
    assert.equal(out.refusal?.at, 'body');
  }
  for (const [ctx, name] of [[owner, 'mine'], [ownerAgent, 'my-agents']] as const) {
    const out = (await api.create({ register: 'skills', fields: { name, trigger: 'When asked.', body: 'Steps.' } }, ctx)) as { ok: boolean };
    assert.ok(out.ok, JSON.stringify(out));
  }
  sql.close();
});
