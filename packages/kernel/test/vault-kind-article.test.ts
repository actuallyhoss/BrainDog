/**
 * A rotation that names another kind is refused in a sentence a person reads: `loop/research-batch-fifty-five-audit.md`
 * named the slip at `vault.ts`'s rotation refusal, which wrote `is a ${kind}` and so said "is a api_token".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type GrantRow } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);
const GRANT = { label: 'stripe', opens: 'api.stripe.com', ciphertext: b(10), nonce: b(20), kdf: 'hkdf', wrapped_by: 'kek' as const, kek_id: 'kek_2f' };

test('THE ROTATION REFUSAL GIVES EACH KIND ITS ARTICLE: an api_token, an ssh_key, a password', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 8, 23, 12)));
  const made = k.bindGrant({ ...GRANT, kind: 'api_token' }, 'p_1');
  assert.ok(made.ok);
  const id = (made.value as GrantRow).id;
  const said = (kind: 'password' | 'ssh_key') => {
    const r = k.bindGrant({ ...GRANT, id, kind }, 'p_1') as { ok: boolean; refusal?: { code: string; fix: string } };
    assert.equal(r.refusal?.code, 'IMMUTABLE_FIELD');
    return r.refusal!.fix;
  };
  assert.equal(said('password'), `${id} is an api_token. A password is a different grant, not a rotation of this one.`);
  assert.equal(said('ssh_key'), `${id} is an api_token. An ssh_key is a different grant, not a rotation of this one.`);
  sql.close();
});
