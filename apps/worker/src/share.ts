/**
 * The Worker's share key: the key a link to one page is signed and checked with (`@braindog/host`'s `share.ts`).
 *
 * DERIVED FROM THE ROOT KEY'S CURRENT HALF, `env.KEK`, with the info `braindog/share`, and never used as the root itself.
 * The secret holds one key, or the new key and then the old one while a rotation is under way (`keys.ts`); links are
 * signed and checked under the first, so a rotation closes every link made before it, and the owner shares the page
 * again. That is the lever a new root key should pull, and it asks nothing of the nightly re-wrap.
 *
 * THE SECRET'S TEXT IS THE MATERIAL, NOT ITS DECODED BYTES. HKDF takes any input key material, and the text carries every
 * bit of the key's entropy in the one spelling the operator put, so this file needs no second copy of `keys.ts`'s
 * decoder. A value `keys.ts` would refuse still signs links here; it opens no record's keys, which is where that
 * refusal is said.
 *
 * NOTHING HERE LOGS OR THROWS A SENTENCE, and the one value it reads goes nowhere but the derivation.
 */

import { deriveShareKey } from '@braindog/host';

import { isBound, type KekBinding } from './keys.ts';

/** The share key, or `null` when `KEK` is not bound, which is a Worker that makes no links and opens none. */
export async function shareKeyOf(bound: KekBinding | undefined): Promise<Uint8Array | null> {
  if (!isBound(bound)) return null;
  const held = typeof bound === 'string' ? bound : await bound.get();
  const current = held.trim().split(/\s+/)[0] ?? '';
  if (current === '') return null;
  return deriveShareKey(new TextEncoder().encode(current));
}

/** What `sharesOf` answers: whether this Worker makes read-only links, and the owner's sentence when it does not. */
export type Shareable = { can: boolean; why?: string };

/** The one sentence an owner reads on a Worker that makes no links, whichever of the two reasons it is. */
export const SHARES_OFF = 'Read-only links are switched off on this BrainDog.';

/**
 * Whether this Worker makes read-only links: yes only when `KEK` is bound, which the share key is derived from, and the
 * variable `SHARE_LINKS` is exactly `on`.
 *
 * OFF UNLESS SAID (on in alpha and production since 1 Nov). An unset, empty or misspelt `SHARE_LINKS` is no, so a
 * deploy that forgets the variable makes no link, and the app offers no button that would fail. The answer says
 * whether the key is bound and never reads it, so nothing here touches the secret's value.
 */
export function sharesOf(env: { KEK?: KekBinding | undefined; SHARE_LINKS?: string | undefined }): Shareable {
  return isBound(env.KEK) && env.SHARE_LINKS === 'on' ? { can: true } : { can: false, why: SHARES_OFF };
}
