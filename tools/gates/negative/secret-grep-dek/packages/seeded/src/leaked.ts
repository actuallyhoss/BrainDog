/**
 * The second seeded violation: the same leak, under the name the key hierarchy actually uses.
 *
 * `52 §6`'s example is `console.log(plaintext)`, and no file in this repository has ever held a
 * variable called that. `apps/selfhost/src/keys.ts` holds the root key, two data keys and an
 * Ed25519 private half, and calls them `plain`, `dek`, `kek`, `root` and `pkcs8` — so the gate was
 * green over the one file where a leak would matter most, and its own header said otherwise.
 */
export function open(id: string, dek: Uint8Array): void {
  console.error('unwrap failed', { id, dek });
}
