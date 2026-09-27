/**
 * The id a person can quote when something failed, and nothing else.
 *
 * `50 §2.5` names this file as the seam between the app and the record and gives it four exports:
 * `call`, `write`, `opId` and `rid`. The seam was built somewhere else. Every screen reads and writes
 * the record through `@braindog/client`, from a reader or writer module of its own (`lib/data/record.ts`,
 * `lib/record/*-live.ts`, `lib/record/*-write.ts`), because the client carries the route table as a
 * value and this file is reachable from the root error page. So only `rid` is here: a `call()` that
 * nothing calls would be the exact shape of thing this codebase keeps finding and deleting.
 */

/**
 * The id a person can quote when something failed.
 *
 * `50 §2.5`: ten base32 characters from `crypto.getRandomValues`, minted by the CLIENT and sent as
 * `X-Request-Id` on every call; `33 §4` has both hosts echo and log it. `50 §13 D11` calls it "the
 * copyable id of the `error` state".
 *
 * IT WAS ONE STRING LITERAL AT EIGHT CALL SITES. `rid="r7k2m9qd4x"`, hard-coded, identical on every
 * screen that could fail — so two different failures quoted the same id, and quoting it to somebody
 * who could look it up would have found nothing at all. An id that does not identify anything is
 * worse than none: it is the one thing on an error screen that has to mean something.
 *
 * CROCKFORD'S ALPHABET, which is the reason to use base32 rather than hex or base64url: no `I`, `L`,
 * `O` or `U`, so there is no pair a person can transcribe wrong off a screen and into an email. That
 * is the entire job of this string.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function rid(): string {
  const bytes = new Uint8Array(10);
  /* NO `Math.random()` FALLBACK. Two failures a second apart must not collide, and `getRandomValues`
     is in every browser this app supports; a fallback here would be a silently weaker id in exactly
     the environment nobody tests. Where there is no crypto there is no request either. */
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}
