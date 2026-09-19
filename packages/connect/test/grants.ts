/**
 * A key store and a wrapped DEK, for the tests that need a real sealed grant.
 *
 * NOT A `.test.ts` AND SO NOT A TEST. The runner's glob is `test/*.test.ts`; this file is imported
 * by two of them. It is here rather than copied into each because a second copy of the wrapping
 * would be a second opinion about the AAD, and the whole point of `47 §4.6` is that there is one.
 */

import type { Key, KeyStore } from '@braindog/ports';

import { b64url, type WrappedDek } from '../src/index.ts';

const utf8 = new TextEncoder();

export const kekOf = async (): Promise<Key> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

export const storeOf = (held: Record<string, Key>): KeyStore => ({
  current: () => {
    const [kekId, key] = Object.entries(held)[0] ?? [];
    if (kekId === undefined || key === undefined) throw new Error('an empty key store');
    return Promise.resolve({ kekId, key });
  },
  byId: (id) => Promise.resolve(held[id] ?? null),
});

/** The `connector` DEK of one record, wrapped the way `apps/selfhost`'s `wrap` writes it. */
export const wrapDek = async (kek: Key, kekId: string, recordId: string): Promise<WrappedDek> => {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: utf8.encode(`${recordId}\u001f` + 'connector') },
    kek,
    crypto.getRandomValues(new Uint8Array(32)),
  );
  return { wrapped: b64url(new Uint8Array(wrapped)), nonce: b64url(nonce), kek_id: kekId };
};
