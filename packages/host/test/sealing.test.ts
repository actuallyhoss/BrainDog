import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { grantAad, grantKey, openSealed, seal } from '../src/sealing.ts';

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const un64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
const V = JSON.parse(readFileSync(new URL('./vault-vectors.json', import.meta.url), 'utf8')) as {
  dek: string; nonce: string;
  cases: { grant: string; record: string; version: string; value: string; aad: string; ciphertext: string }[];
};

/**
 * THE VECTORS WERE SEALED BY THE CODE IN THE TWO APPS, BEFORE EITHER WAS TOUCHED. A credential deposited
 * last month has to open next month, in whichever host, so the only acceptable outcome of moving these
 * steps is the same bytes. Equal output is asserted, not a successful round trip: a round trip passes just
 * as well under a key hierarchy that changed on both sides at once.
 */
for (const c of V.cases) {
  test(`D9 vector ${c.grant}: the shared steps reproduce the apps' bytes exactly`, async () => {
    const key = await grantKey(un64u(V.dek), c.grant);
    assert.equal(grantAad(c.record, c.grant, c.version), c.aad);
    const out = await seal(key, un64u(V.nonce), c.aad, new TextEncoder().encode(c.value));
    assert.equal(b64u(out), c.ciphertext);
  });

  test(`D9 vector ${c.grant}: the shared steps open what the apps sealed`, async () => {
    const key = await grantKey(un64u(V.dek), c.grant);
    const got = await openSealed(key, un64u(V.nonce), c.aad, un64u(c.ciphertext));
    assert.notEqual(got, null);
    assert.equal(new TextDecoder().decode(got!), c.value);
  });
}

test('a wrong grant, a wrong AAD, a wrong nonce and a flipped bit each open nothing', async () => {
  const c = V.cases[0]!;
  const good = await grantKey(un64u(V.dek), c.grant);
  const other = await grantKey(un64u(V.dek), 'g_9999');
  const ct = un64u(c.ciphertext);
  assert.equal(await openSealed(other, un64u(V.nonce), c.aad, ct), null);
  assert.equal(await openSealed(good, un64u(V.nonce), grantAad(c.record, c.grant, '99'), ct), null);
  assert.equal(await openSealed(good, new Uint8Array(12), c.aad, ct), null);
  const bent = Uint8Array.from(ct);
  bent[0] = (bent[0] ?? 0) ^ 1;
  assert.equal(await openSealed(good, un64u(V.nonce), c.aad, bent), null);
});

test('the AAD binds the record, so one record cannot open another\'s', async () => {
  const c = V.cases[0]!;
  const key = await grantKey(un64u(V.dek), c.grant);
  const elsewhere = grantAad('rec_99', c.grant, c.version);
  assert.equal(await openSealed(key, un64u(V.nonce), elsewhere, un64u(c.ciphertext)), null);
});
