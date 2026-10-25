/**
 * `keyUses` (KEYCHAIN): which tools need which key, from the tools rows whose `needs` name `credentials#n`, so the
 * Keychain's "Used by" can say a tool without the web naming the tools list. Names only, and never for a token.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installAgentsPack, installSeed } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } };

const made = (r: unknown): { id: string } => {
  const x = r as { ok: boolean; value: { id: string }; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('a tool that needs a key is listed under that key, and a tool that needs none is not', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  made(await installSeed(api.kernel));
  made(await installAgentsPack(api.kernel));

  const key = made(await api.create({ register: 'credentials', fields: { label: 'Stripe live', opens: 'the shop', kind: 'api_token' } }, owner));
  const spoken = api.kernel.nameOf(key.id);
  const lantern = made(await api.create({ register: 'tools', fields: { name: 'lantern', kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', 'lantern'], needs: [`LANTERN_KEY=${spoken}`], state: 'active' } }, owner));
  made(await api.create({ register: 'tools', fields: { name: 'plain', kind: 'cli', command: 'plain', needs: ['NOT_A_KEY'], state: 'active' } }, owner));

  const out = (await api.keyUses(undefined, owner)) as { ok: boolean; value: { credential: string; tool: string; title: string }[] };
  assert.ok(out.ok);
  assert.deepEqual(out.value.filter((u) => u.credential === spoken), [{ credential: spoken, tool: api.kernel.nameOf(lantern.id), title: 'lantern' }]);

  const refused = (await api.keyUses(undefined, token)) as { ok: boolean };
  assert.equal(refused.ok, false, 'an agent key read which tool holds which key');
});
