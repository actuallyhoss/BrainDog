/**
 * Whether a record may be provisioned on a deployment that has no key store, `12 §6`, ADR-062.
 *
 * A RECORD IS GIVEN ITS KEYS ONCE AND THE MOMENT IS THE CREATE. `packages/kernel/src/provision.ts`
 * writes `vault_key` with `ON CONFLICT (purpose) DO NOTHING`, because a second create carrying
 * fresh keys would overwrite the record DEK and make every `grant.ciphertext` already sealed under
 * the old one permanently unopenable. That rule is right, and this file is the price of it: a
 * record created while `env.KEK` is unbound gets no rows at all, and there is no later call that
 * puts them there. It reads, writes and signs people in; it can never seal a grant, run a
 * connector, hold a model key or sign an export. The only repair is to throw the record away and
 * provision again, and `52 §13` has no undo for a Directory name, which is never given out twice.
 *
 * SO THE DEFAULT IS A REFUSAL, AND THE SHAPE WAS CHOSEN OVER TWO OTHERS. The alternatives were to
 * warn and continue, and to put an opt-in field on the `/auth/provision` body:
 *
 *   - A WARNING IS NOT A GUARD on this path. The operator's answer is a JSON body read by whatever
 *     script called it, the Worker's own log is a `wrangler tail` nobody is watching at 2am, and
 *     the fact only bites weeks later at the first sealed grant. A warning on a mistake that cannot
 *     be undone is a warning read after the deadline.
 *   - AN OPT-IN ON THE REQUEST puts the dangerous choice one typo away on every single call, and
 *     the caller typing it is usually a script rather than the person who bound the secrets. The
 *     deployment is where `KEK` itself is decided, by the one person who knows whether this host is
 *     a test host, and it is decided once. That is where the exception belongs. (It is also the
 *     only half that could be built without editing `packages/host/src/auth.ts`, whose
 *     `operator.provision` args are `{ slug, email, name }` and which another agent holds today.)
 *
 * IT FAILS CLOSED ON ANYTHING BUT `yes`. `true`, `1` and an empty string are all a deployment that
 * has not said it means this, and the cost of guessing wrong in the permissive direction is the
 * unrecoverable record the whole file exists to prevent.
 */

import type { Refusal } from '@braindog/ports';

import type { KeyStore } from './keys.ts';

/** What `PROVISION_WITHOUT_KEYS` has to say, in the sentence the refusal quotes back. */
export const KEYLESS_ON_PURPOSE = 'yes';

/**
 * `null` when this provisioning may go ahead, and the refusal when it may not.
 *
 * IT TAKES THE STORE AND NOT `env.KEK`. `keyStoreOf` answers `null` for an unbound binding AND for
 * one bound to whitespace (`test/keys.test.ts` holds both), and it THROWS for 32 bytes that are not
 * 32 bytes, so by the time there is a store or a `null` in hand, the three cases have already been
 * told apart. Asking `isBound(env.KEK)` here would read the secret a second time to learn something
 * the first read already decided.
 */
export function keylessRefusal(store: KeyStore | null, said: string | undefined): Refusal | null {
  if (store) return null;
  if ((said ?? '').trim().toLowerCase() === KEYLESS_ON_PURPOSE) return null;
  return {
    code: 'NOT_IN_THIS_BUILD',
    fix: `This deployment has no key store bound, so a record provisioned now would be keyless for as long as it exists: it could never seal a grant, run a connector, hold a model key or sign an export, and binding KEK afterwards does not give it keys. Bind KEK first, with wrangler secret put KEK --env <environment>, and provision after that. To make a keyless record on purpose, on a host that seals nothing, set the var PROVISION_WITHOUT_KEYS to ${KEYLESS_ON_PURPOSE}.`,
    at: 'KEK',
  };
}
