/**
 * Whose signature a build of this command must carry: the keys `braindog update` and the install scripts believe.
 *
 * WHY A SIGNATURE WHEN THERE IS A SUM. The sum is published beside the file it describes, so it catches a download cut short
 * or altered on the way, and nothing about somebody who can change what brain.dog serves: they change both, and every
 * `braindog update` then runs their code. A signature made at release, with a key that is not where the site is, is what
 * that person cannot make. An Ed25519 signature, because Node verifies one with no dependency and the key is one short line.
 *
 * THE PIN IS EMPTY UNTIL THE OWNER MAKES THE KEY (`node tools/ship/cli-key.mjs`, which writes the line below and the same
 * pin in `apps/site/static/cli/install.sh` and `install.ps1`). EMPTY MEANS THE SUM ALONE, as every build before this one, so
 * nothing stops working on the day this lands. Once a build is pinned it refuses anything unsigned for good, and a command
 * from before the pin still reads the `.sha256` that is published beside the signature, updates over it, and is pinned from then on.
 *
 * A LIST, so a new key can be pinned beside the old one for the release that moves between them. Each is the key's 32 public
 * bytes in base64url, the `x` of its JWK.
 *
 * WHAT IS SIGNED, `releaseMessage`: the bundle's SHA-256 and the build it says it is, under a name of their own, so a signature
 * made for this cannot be read as one made for anything else. It does not stop an older signed build being served again;
 * `update` moves to whatever build is out, because that is how a rollback reaches every machine.
 *
 * NODE'S OWN CRYPTO ONLY: `tools/ship/cli-sign.mjs` imports this file as it is, and the install scripts spell the same check.
 */

import { verify } from 'node:crypto';

export const RELEASE_KEYS: readonly string[] = [];

/** The label the signing key is kept under in the record's Keychain. */
export const RELEASE_LABEL = 'braindog-cli-signing-key';

/** The bytes a release's signature is made over. `install.sh` and `install.ps1` spell the same line. */
export const releaseMessage = (sha256: string, build: string): Buffer => Buffer.from(`braindog-cli release\n${sha256}\n${build}\n`, 'utf8');

/** Whether `signature`, as `braindog.mjs.sig` holds it (base64url), is one of `keys` over this sum and this build. */
export function signedBy(keys: readonly string[], sha256: string, build: string, signature: string): boolean {
  const said = Buffer.from(signature.trim(), 'base64url');
  if (said.length !== 64) return false;
  const message = releaseMessage(sha256, build);
  return keys.some((x) => {
    try {
      return verify(null, message, { key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' }, said);
    } catch {
      return false;
    }
  });
}
