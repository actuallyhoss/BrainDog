/**
 * Whose signature a build of this command must carry: the keys `braindog update` and the install scripts believe.
 *
 * WHY A SIGNATURE WHEN THERE IS A SUM. The sum is published beside the file it describes, so it catches a download cut short
 * or altered on the way, and nothing about somebody who can change what brain.dog serves: they change both, and every
 * `braindog update` then runs their code. A signature made at release, with a key that is not where the site is, is what
 * that person cannot make. An Ed25519 signature, because Node verifies one with no dependency and the key is one short line.
 *
 * THE PIN IS EMPTY UNTIL THE KEY IS MADE (`node tools/ship/cli-key.mjs`, which writes the line below, the same pin in
 * `apps/site/static/cli/install.sh` and `install.ps1`, and the published list in `apps/cli/README.md`). EMPTY MEANS THE SUM ALONE, as
 * every build before this one, so nothing stops working on the day this lands. Once a build is pinned it refuses anything unsigned
 * for good, and a command from before the pin still reads the `.sha256` that is published beside the signature, updates over it,
 * and is pinned from then on.
 *
 * THE PRIVATE HALF IS IN ONE MAC'S LOGIN KEYCHAIN AND NOWHERE ELSE, not in the record's Keychain, which the Worker can open: the point
 * of this is to hold when Cloudflare does not.
 *
 * A LIST, so that a second key, on a second Mac, can stand beside the first. A command believes every key its own build pinned, so
 * a key reaches the machines out there on the first release after it is pinned, and from then on either Mac can sign for them.
 * `apps/cli/README.md` says what a lost key costs. Each is the key's 32 public bytes in base64url, the `x` of its JWK.
 *
 * WHAT IS SIGNED, `releaseMessage`: the bundle's SHA-256, the build it says it is and when it was released, under a name of their
 * own, so a signature made for this cannot be read as one made for anything else. THE TIME IS SIGNED SO AN OLDER SIGNED BUILD CANNOT
 * BE SERVED AGAIN as an update: a build's own name holds only its day, and a day can hold several releases. The time is its commit's,
 * in seconds, and a bundle knows its own (`__RELEASED__`, `scripts/bundle.mjs`). `update` refuses anything older than it is running
 * unless it is asked with `--older`, which is how a rollback reaches a machine that wants it.
 *
 * NODE'S OWN CRYPTO ONLY: `tools/ship/cli-sign.mjs` imports this file as it is, and the install scripts spell the same check.
 */

import { verify } from 'node:crypto';

export const RELEASE_KEYS: readonly string[] = [];

/** The generic password item the signing key is kept as, in the login keychain of the Mac that releases. */
export const RELEASE_LABEL = 'braindog-cli-release';

/** The bytes a release's signature is made over. `install.sh` and `install.ps1` spell the same lines. */
export const releaseMessage = (sha256: string, build: string, released: number): Buffer => Buffer.from(`braindog-cli release\n${sha256}\n${build}\n${released}\n`, 'utf8');

/** `braindog.mjs.sig` as it is written: the release's time on one line, and the signature (base64url) on the next. `null` if it is not that. */
export function readSignature(text: string): { released: number; signature: string } | null {
  const [time, signature, ...more] = text.trim().split(/\s+/u);
  if (time === undefined || signature === undefined || more.length > 0 || !/^\d{1,15}$/u.test(time)) return null;
  return { released: Number(time), signature };
}

/** Whether `signature` is one of `keys` over this sum, this build and this time. */
export function signedBy(keys: readonly string[], sha256: string, build: string, released: number, signature: string): boolean {
  const said = Buffer.from(signature.trim(), 'base64url');
  if (said.length !== 64) return false;
  const message = releaseMessage(sha256, build, released);
  return keys.some((x) => {
    try {
      return verify(null, message, { key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' }, said);
    } catch {
      return false;
    }
  });
}
