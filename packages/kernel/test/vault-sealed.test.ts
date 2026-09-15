/**
 * `sealed_for`: bytes sealed for one grant id and version, and a bind that holds them to it.
 *
 * A key door seals before it binds, because the additional data names the grant id and the version, and the host
 * holds the key store the record does not. Between the two, another deposit can take that id or that version. What
 * is held here is that such a bind is a conflict rather than a grant whose bytes would never open again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type GrantRow } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE';

const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);

const KEY = {
  label: 'Kiln deploy',
  opens: 'kiln.example',
  kind: 'api_token' as const,
  ciphertext: b(10),
  nonce: b(20),
  kdf: 'hkdf-sha256',
  wrapped_by: 'kek' as const,
  kek_id: 'kek_2f',
  bytes: 64,
  hint: 'a 64-character value',
};

async function vault() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  const made = k.createRecord({
    id: ID,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', name: 'Sam' },
    keys: { record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' } },
  });
  assert.ok(made.ok);
  return { k, sql };
}

const granted = (r: unknown): GrantRow => {
  const x = r as { ok: boolean; value: GrantRow; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, JSON.stringify(x));
  return x.value;
};

const conflicted = (r: unknown) => {
  const x = r as { ok: boolean; conflict?: unknown; refusal?: unknown };
  assert.equal(x.ok, false, 'the bind went through');
  assert.ok(x.conflict !== undefined, `expected a conflict, got ${JSON.stringify(x)}`);
};

test('A FRESH GRANT TAKES THE ID ITS BYTES WERE SEALED FOR, at version one, and the AAD names both', async () => {
  const { k, sql } = await vault();
  const made = granted(k.bindGrant({ ...KEY, sealed_for: { id: GRANT, version: 1 } }, 'S1'));
  assert.equal(made.id, GRANT);
  assert.equal(made.version, 1);
  const opened = k.openGrant({ id: GRANT, kek_id: 'kek_2f' }, 'S1');
  assert.ok(opened.ok);
  assert.equal(opened.value.aad, [ID, GRANT, '1'].join(String.fromCharCode(0x1f)));
  sql.close();
});

test('AN ID ANOTHER DEPOSIT TOOK FIRST IS A CONFLICT, and nothing is written over it', async () => {
  const { k, sql } = await vault();
  granted(k.bindGrant({ ...KEY, sealed_for: { id: GRANT, version: 1 } }, 'S1'));
  conflicted(k.bindGrant({ ...KEY, ciphertext: b(30), sealed_for: { id: GRANT, version: 1 } }, 'S2'));
  assert.equal(k.grants().length, 1);
  sql.close();
});

test('A ROTATION SEALED FOR THE NEXT VERSION BINDS; ONE SEALED FOR A VERSION ALREADY PASSED IS A CONFLICT', async () => {
  const { k, sql } = await vault();
  granted(k.bindGrant({ ...KEY, sealed_for: { id: GRANT, version: 1 } }, 'S1'));
  const two = granted(k.bindGrant({ ...KEY, id: GRANT, ciphertext: b(40), sealed_for: { id: GRANT, version: 2 } }, 'S1'));
  assert.equal(two.version, 2);

  /* Sealed for version two while another rotation made it: its bytes would open as nothing. */
  conflicted(k.bindGrant({ ...KEY, id: GRANT, ciphertext: b(50), sealed_for: { id: GRANT, version: 2 } }, 'S2'));
  /* Sealed for a fresh grant while the row already names one. */
  conflicted(k.bindGrant({ ...KEY, id: GRANT, ciphertext: b(60), sealed_for: { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5HAF', version: 1 } }, 'S2'));
  assert.equal(k.grants()[0]?.version, 2);
  sql.close();
});

test('A SEALED_FOR THAT COULD NAME NO GRANT IS REFUSED', async () => {
  const { k, sql } = await vault();
  for (const sealed_for of [{ id: 'stripe', version: 1 }, { id: GRANT, version: 0 }, { id: GRANT, version: 1.5 }]) {
    const out = k.bindGrant({ ...KEY, sealed_for }, 'S1') as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.ok, false);
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(out.refusal?.at, 'sealed_for');
  }
  assert.equal(k.grants().length, 0);
  sql.close();
});
