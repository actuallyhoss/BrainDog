/**
 * The Worker's `keyOpener` (`../src/actions.ts`), and the one argument `apps/selfhost/test/spark-byok-guard.test.ts`
 * measures on the other host: the id that reaches `kernel.openGrant`, which is the id `packages/kernel/src/vault.ts`
 * signs the `grant.read` event with.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT A CASE IN `actions.test.ts`. That file's own `BOUND` case drives the real
 * unwrap-derive-decrypt chain and never looks at what `openGrant` was called with; this file's premise is the
 * opposite one, so it earns its own name rather than a fourth assertion bolted onto a case about something else.
 *
 * THE PREMISE, SAID ONCE: `kernel.openGrant(args, actor)` is what writes `grant.read`, with `actor` as the row's
 * `actor` column (`packages/kernel/src/index.ts` `openGrant: (args, actor) => openGrant(sql, vaultDeps(actor), args,
 * transaction)`, and `vault.ts`'s `openGrant` itself, `event(sql, deps, 'grant.read', args.id, row.kind)` off
 * `deps.actor`). So a fake `kernel.openGrant` that records the `actor` it was called with is a faithful stand-in for
 * the write it is not asked to perform here: whatever it saw is what a real one would have signed the row with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { keyOpener } from '../src/actions.ts';
import { keyStoreOf, recordKeys, unwrap, type KeyStore, type WrappedKey } from '../src/keys.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const hex = (n: number): string => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString('hex');

/** A sealed grant as `openGrant` answers it, sealed the way `47 §4.6` says, by this test and not by the code under it. */
async function sealedFor(store: KeyStore, recordKey: WrappedKey, value: string) {
  const dek = await unwrap(store, REC, 'record', recordKey);
  assert.ok(dek);
  const base = await crypto.subtle.importKey('raw', dek, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8('g_1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = `${REC}:g_1:1`;
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(aad) }, key, utf8(value)));
  return { id: 'g_1', key: { wrapped: recordKey.wrapped, nonce: recordKey.nonce, kek_id: recordKey.kek_id }, nonce, aad, ciphertext };
}

test('THE WORKER keyOpener SIGNS grant.read WITH THE ACTOR IT IS GIVEN, and with system only when it is given none', async () => {
  const kek = hex(32);
  const store = (await keyStoreOf(kek)) ?? assert.fail('no store');
  const keys = await recordKeys(store, REC);
  const value = `bd_fake_worker_actor_${hex(16)}`;
  const sealed = await sealedFor(store, keys.record, value);

  /* THE STAND-IN FOR `packages/kernel`'s `openGrant`: it never writes a row, so it is what `grant.read`'s actor
     WOULD have been, one call at a time. */
  const signedBy: string[] = [];
  const api = {
    kernel: {
      identity: () => ({ id: REC }),
      openGrant: (_args: { id: string; kek_id?: string }, actor: string) => (signedBy.push(actor), ok(sealed)),
    },
  } as never;

  /* THE SCHEDULED PATH FIRST, which names nobody: `keyOpener`'s own default is `system`, the same as the alarm
     that calls it with no third argument at all. */
  const scheduled = await (keyOpener(api, kek) ?? assert.fail('bound, and no opener'))({ id: 'g_1', label: 'OpenAI' });
  /* AND THE ASKER'S ID, PASSED THROUGH: `sparkByokFor`'s `wire` now hands `wireOf` the asker's id and `wireOf` hands
     it straight to this opener, so the row a real `openGrant` writes for her ask is signed with it and not `system`. */
  const asker = 'p_01JZ8QK3F7R2M9V4XN6TCB5HAF';
  const asked = await (keyOpener(api, kek, asker) ?? assert.fail('bound, and no opener'))({ id: 'g_1', label: 'OpenAI' });

  assert.ok(scheduled === value && asked === value, 'the opener did not open the key it was handed');
  assert.deepEqual(signedBy, ['system', asker], 'openGrant was not called with the actor each opener was given');
});
