/**
 * A retired key never answers for a live one of the same label. The move from the old register left a retired row beside each
 * sealed key, older and with no value, and the lookup took the oldest: a key the list called sealed "held no sealed value",
 * and a deposit by that label would have gone into the retired row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installAgentsPack, installSeed } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);

const made = <T extends object = { id: string }>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('a deposit by label goes to the live key, not the older retired row beside it', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  made(await installSeed(api.kernel));
  made(await installAgentsPack(api.kernel));

  sql.exec("INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id) VALUES ('record', ?, ?, 'kek', 'kek_2f')", b(90), b(80));

  const old = made(await api.create({ register: 'credentials', fields: { label: 'gh', opens: 'GitHub', kind: 'api_token', state: 'retired' } }, owner));
  const live = made(await api.create({ register: 'credentials', fields: { label: 'gh', opens: 'GitHub', kind: 'api_token', state: 'live' } }, owner));

  const seal = async () => ({ ok: true as const, value: { ciphertext: b(4), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' } });
  const out = made<{ credential: string }>(await api.depositGrant({ label: 'gh' }, owner, {}, seal as never));

  assert.equal(out.credential, api.kernel.nameOf(live.id));
  const first = api.kernel.get(old.id);
  assert.equal(first?.fields.state, 'retired');
  assert.equal(Object.keys(first?.fields ?? {}).some((k) => /grant|secret|sealed/.test(k)), false);
});
