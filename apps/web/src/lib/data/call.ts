/**
 * The seam between this app and the record.
 *
 * `50 §2.5` names this file and gives it four exports — `call`, `write`, `opId` and `rid`. Only the
 * last one is here, and that is deliberate: the app is still a mock over a seeded record, so a
 * `call()` that nothing calls would be the exact shape of thing this codebase keeps finding and
 * deleting. What is here is what is USED. The rest arrives with the host it would talk to.
 *
 * `50 §1` settles the import question the repository currently answers two ways: the web app's
 * runtime imports are `svelte`, `braindog-render`, `@braindog/where` and `@braindog/declare`, and
 * "never `ports`, `kernel`, `record`, `mcp`, `slash`, or another app". The seam is a FILE INSIDE THE
 * APP, not a package — so `packages/client`, which exists in this tree and is imported by nothing,
 * is an unspecified addition and not the thing that belongs here.
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
