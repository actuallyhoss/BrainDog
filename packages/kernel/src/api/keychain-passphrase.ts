/**
 * The keychain password, the kernel's half: `changeKeychainWrapping` and `unlockKeychain`, over `keychain.ts` (`12 §6` "The
 * optional second factor").
 *
 * THE KERNEL NEVER HOLDS THE PASSPHRASE OR A KEY. Each method is handed a host's step, a function that does the
 * crypto where the root key is (`packages/host/src/passphrase.ts`), and hands that step the record key's wrapping. What
 * comes back is wrapped bytes and a salt, or whether a passphrase opened the key. The passphrase stays in the host's
 * closure and the unwrapped key never leaves it.
 *
 * WHO MAY ASK IS THE RECORD'S QUESTION, NOT THIS FILE'S. The record's methods (`packages/record/src/methods/
 * keychain-passphrase.ts`) put the keychain gate in front of both, so by the time anything here runs the caller is an owner
 * in a browser, proved within fifteen minutes.
 *
 * A WRONG PASSPHRASE IS COUNTED BEFORE IT IS COMPARED (`passphraseStrike`), `PASSPHRASE_TRIES` to a window and then a
 * wait of `PASSPHRASE_WAIT_MS` (`keychain.ts`), as sign-in counts. Putting a passphrase on compares nothing, so it is not counted; taking one off and opening the
 * keychain with one each compare it.
 *
 * PUTTING ONE ON HANDS THE STEP EVERY VALUE THE RECORD KEY SEALED (`sealedUnderRecord`), because the step makes a new key
 * and seals them all again under it (`rewrapRecordKey` says why). The values are sealed bytes, as `openGrant` hands them
 * out, and what comes back is sealed bytes too.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import type { KernelParts } from '../parts.ts';
import {
  passphraseCleared,
  passphraseRefund,
  passphraseStrike,
  recordWrapping,
  rewrapRecordKey,
  sealedUnderRecord,
  type RecordWrapping,
  type SealedUnderRecord,
  type WrappingChange,
} from '../keychain.ts';
import { recordIdentity } from '../provision.ts';

/** Whether the record key is behind a passphrase, once a change or an unlock has answered. */
export type KeychainPassphrase = { on: boolean };

/**
 * A host's re-wrap of the record key: a new key under the passphrase it was given, with `sealed` sealed again under it,
 * or the same key back under a root key once the passphrase opens it, when `sealed` is empty.
 */
export type PassphraseRewrap = (held: RecordWrapping, sealed: readonly SealedUnderRecord[]) => Promise<Result<WrappingChange>>;

/**
 * A host's try of the passphrase it was given against the record key: `true` when it opened the key, `false` when it
 * did not, and `null` when the request carried no passphrase at all, which is not a wrong one and is not counted.
 */
export type PassphraseUnlock = (held: RecordWrapping) => Promise<boolean | null>;

export function extension(parts: KernelParts) {
  const { sql } = parts;

  /** The keychain is locked for `wait` seconds: the refusal, with the seconds a host sends as `Retry-After`. */
  const locked = <T>(wait: number): Result<T> =>
    no<T>('RATE_LIMITED', 'Too many wrong passphrases. Wait a while, then try again.', { at: 'passphrase', retry_after: wait });

  return {
    /**
     * Put the record key behind a passphrase (`to: 'passphrase'`), or take it back to the root key (`to: 'kek'`).
     *
     * ONE CHANGE AT A TIME, AND A CHANGE TO THE SAME STATE IS REFUSED rather than answered as done: a second passphrase
     * set over the first would be a re-wrap the owner could only undo with a passphrase they have just replaced. To
     * change it, it is taken off with the old one and put on with the new one.
     */
    async changeKeychainWrapping(to: 'passphrase' | 'kek', rewrap: PassphraseRewrap, actor: string): Promise<Result<KeychainPassphrase>> {
      const held = recordWrapping(sql);
      if (held === null)
        /* NOT ON THIS BRAINDOG, said as that: a record with no key of its own has nothing a
           passphrase could be put on, and "keys here have no stored value" stood under a keychain whose keys had values. */
        return no('NOT_IN_THIS_BUILD', 'Locking keys with a passphrase isn’t on this BrainDog yet.', { at: 'passphrase' });
      if (to === 'passphrase' && held.wrapped_by === 'passphrase')
        return no('ALREADY_KNOWN', 'This keychain already has a passphrase. Take it off with that passphrase, then set the new one.', { at: 'passphrase' });
      if (to === 'kek' && held.wrapped_by === 'kek')
        return no('ALREADY_KNOWN', 'This keychain has no passphrase to take off.', { at: 'passphrase' });

      /* TAKING IT OFF COMPARES THE PASSPHRASE, SO IT IS COUNTED; putting one on compares nothing. */
      const compares = to === 'kek';
      if (compares) {
        const wait = passphraseStrike(sql, parts.clock.now());
        if (wait !== null) return locked(wait);
      }
      /* READ WITH THE WRAPPING AND BEFORE THE AWAIT, so the step is handed one moment of the keychain. */
      const sealed = to === 'passphrase' ? sealedUnderRecord(sql, recordIdentity(sql)?.id ?? null) : [];
      let out: Result<WrappingChange>;
      try {
        out = await rewrap(held, sealed);
      } catch (e) {
        if (compares) passphraseRefund(sql);
        throw e;
      }
      if (!out.ok) {
        /* ONLY A WRONG PASSPHRASE KEEPS ITS STRIKE. A passphrase too short, or a host whose root key does not open the
           record, compared nothing the owner typed. */
        if (compares && !('refusal' in out && out.refusal.code === 'WRONG_KEY')) passphraseRefund(sql);
        return out;
      }
      if (compares) passphraseCleared(sql);
      if (out.value.to !== to)
        return no('VALUE_MALFORMED', 'The host re-wrapped this BrainDog’s key the other way from the one asked, so nothing was changed.', { at: 'passphrase' });
      const done = rewrapRecordKey(sql, { mint: parts.mint, nowMs: parts.clock.now(), actor }, out.value, held.nonce, parts.transaction, sealed);
      return done.ok ? ok({ on: done.value.wrapped_by === 'passphrase' }) : done;
    },

    /**
     * Whether the record key opens for this request: at once when it is on the root key, and through the host's `unlock`
     * when it is behind a passphrase. `person` is whether a person asks: an agent's keychain grant carries no passphrase,
     * so behind one it opens nothing, and it is told so without a strike.
     *
     * NOTHING IS WRITTEN BUT THE COUNT. The key the host opened stays in the host for the one request that asked, and
     * the reading it goes on to make is `openGrant`'s own `grant.read`.
     */
    async unlockKeychain(unlock: PassphraseUnlock, person: boolean): Promise<Result<KeychainPassphrase>> {
      const held = recordWrapping(sql);
      if (held === null || held.wrapped_by === 'kek') return ok({ on: false });
      if (!person)
        return no('WRONG_KEY', 'This keychain is behind a passphrase, which only its owner types, in the app. A keychain grant opens nothing in it.', {
          at: 'passphrase',
        });
      const wait = passphraseStrike(sql, parts.clock.now());
      if (wait !== null) return locked(wait);
      let opened: boolean | null;
      try {
        opened = await unlock(held);
      } catch (e) {
        passphraseRefund(sql);
        throw e;
      }
      if (opened === null) {
        passphraseRefund(sql);
        return no('REQUIRED_MISSING', 'This keychain is behind a passphrase. Type it to open or put a key.', { at: 'passphrase' });
      }
      if (!opened) return no('WRONG_KEY', 'That is not this keychain’s passphrase.', { at: 'passphrase' });
      passphraseCleared(sql);
      return ok({ on: true });
    },
  };
}
