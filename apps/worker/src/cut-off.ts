/**
 * `TOKENS_VALID_FROM`, the operator's fleet-wide cut-off (`12 §8`, `53 §5.11` (c) step 3): an ISO instant before which
 * every agent token, device grant and operation grant this Worker's records issued is refused `UNAUTHORIZED`.
 *
 * READ IN THE RECORD'S OBJECT AND HANDED TO THE KERNEL PER CALL (`TokenDeps.validFrom`), because it is a secret of this
 * deployment and not a fact of any record: nothing is written, so setting an earlier instant gives back every token a
 * wrong one ended, which is how a mistake is corrected.
 *
 * ITS OWN FILE, AND FREE OF `cloudflare:`, for the reason `health.ts` is: `index.ts` cannot be loaded by `node --test`.
 */

import { cutOffReadable } from '@braindog/kernel';

import { op } from './oplog.ts';

/** Why every bearer is being refused, for the operator reading `wrangler tail`. Never shown to a caller. */
export const CUT_OFF_UNREADABLE =
  'TOKENS_VALID_FROM is not an ISO instant with its zone, such as 2026-09-25T12:00:00Z, so every bearer is refused until it is corrected.';

/* ONCE PER ISOLATE. An unreadable value refuses every bearer, so every request would otherwise log the same line; one
   line says it, and the 401s that follow are its consequence rather than news. */
let told = false;

/**
 * The cut-off this Worker was given, as the kernel takes it, or `undefined` when it has none.
 *
 * `env` IS TAKEN AS AN OBJECT AND READ BY NAME, so a caller passes the binding set whole and a build whose `Env` does not
 * yet declare the secret compiles the same. A binding that is not text is no cut-off, as an unset one is.
 */
export function validFromOf(env: object): string | undefined {
  const set: unknown = (env as { TOKENS_VALID_FROM?: unknown }).TOKENS_VALID_FROM;
  if (typeof set !== 'string') return undefined;
  if (!told && !cutOffReadable(set)) {
    told = true;
    op({ op: 'cut-off', ok: false, why: 'unreadable', fix: CUT_OFF_UNREADABLE }, 'error');
  }
  return set;
}
