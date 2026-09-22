/**
 * The cloud copy's sealer again, age v1 to one X25519 recipient, but as a stream one chunk long.
 *
 * WHY A SECOND SEALER AND NOT THE FIRST ONE CALLED DIFFERENTLY. `sealTo` in `seal.ts` returns one
 * buffer, the whole sealed file, and `take` used to hold that beside the plaintext for both puts:
 * measured by `test/snapshots-stream.test.ts` at the 40 MiB ceiling, 80 MiB live while the bucket
 * read, 40 of it above the plaintext. This writes the same bytes as a `ReadableStream` that seals
 * one 64 KiB chunk per pull, and the same test measures 2 MiB above the plaintext once it does.
 *
 * WHY THE HEADER IS WRITTEN OUT A SECOND TIME HERE. `seal.ts` exports neither its per-chunk writer
 * (`sealInto`) nor its header, and this change did not own that file. The payload uses the exported
 * `chacha20poly1305`, which is the same cipher `seal.test.ts` holds against OpenSSL, one chunk at a
 * time. The header below is `sealTo`'s, line for line, and `age-open.ts`, which shares no code with
 * either, opens both. The right end state is one header in `seal.ts` and this file gone into it.
 */

import { chacha20poly1305 } from './seal.ts';

/** A sealed file not yet written: how long it will be, and the stream that writes it. */
export type Sealed = { length: number; stream: ReadableStream<Uint8Array> };

/** An opaque WebCrypto key, named structurally for the reason `seal.ts` gives. */
type Key = object;

/** The five SubtleCrypto calls the header makes, structural for the reason `seal.ts` gives. */
type Subtle = {
  generateKey(alg: { name: string }, extractable: boolean, usages: string[]): Promise<unknown>;
  importKey(format: 'raw', data: Uint8Array, alg: string | { name: string; hash?: string }, extractable: boolean, usages: string[]): Promise<Key>;
  exportKey(format: 'raw', key: Key): Promise<ArrayBuffer>;
  deriveBits(alg: object, key: Key, length: number): Promise<ArrayBuffer>;
  sign(alg: string, key: Key, data: Uint8Array): Promise<ArrayBuffer>;
};

const subtle = (): Subtle => crypto.subtle as unknown as Subtle;

/** Unpadded standard base64, which is the only base64 the age header allows. */
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/=+$/u, '');

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, key, 256);
  return new Uint8Array(bits);
}

/** age's payload chunk: 64 KiB of plaintext, each sealed under its own counter nonce. */
const CHUNK = 64 * 1024;

/**
 * A streaming sealer to one X25519 recipient. The recipient must already have passed `recipientOf`.
 *
 * EVERY CALL IS A FRESH FILE KEY AND A FRESH EPHEMERAL SHARE, as in `sealTo`. The stream reads `file`
 * as it is pulled and never copies it, so the caller must not change `file` until the stream ends.
 */
export function sealStreamTo(recipient: Uint8Array): (file: Uint8Array) => Promise<Sealed> {
  return async (file) => {
    const fileKey = crypto.getRandomValues(new Uint8Array(16));

    const pair = (await subtle().generateKey({ name: 'X25519' }, true, ['deriveBits'])) as { publicKey: Key; privateKey: Key };
    const share = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
    const them = await subtle().importKey('raw', recipient, { name: 'X25519' }, true, []);
    const shared = new Uint8Array(await subtle().deriveBits({ name: 'X25519', public: them }, pair.privateKey, 256));
    /* THE SAME BACKSTOP AS `sealTo`'s: an all-zero secret is a low-order recipient, and the spec says refuse. */
    if (shared.every((b) => b === 0)) throw new Error('AGE_RECIPIENT is a low-order X25519 point, and nothing sealed to it would be secret.');
    const salt = new Uint8Array(share.length + recipient.length);
    salt.set(share);
    salt.set(recipient, share.length);
    const wrapKey = await hkdf(shared, salt, 'age-encryption.org/v1/X25519');
    const body = chacha20poly1305(wrapKey, new Uint8Array(12), fileKey);

    const header = `age-encryption.org/v1\n-> X25519 ${b64(share)}\n${b64(body)}\n---`;
    const macKey = await subtle().importKey('raw', await hkdf(fileKey, new Uint8Array(0), 'header'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await subtle().sign('HMAC', macKey, new TextEncoder().encode(header)));

    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const payloadKey = await hkdf(fileKey, nonce, 'payload');
    const head = new TextEncoder().encode(`${header} ${b64(mac)}\n`);
    const count = Math.max(1, Math.ceil(file.length / CHUNK));
    const length = head.length + nonce.length + file.length + 16 * count;

    /* THE HEADER AND THE PAYLOAD NONCE ARE THE FIRST PULL, then one sealed chunk per pull. The final
       flag and the empty-file and exact-multiple rules are `sealTo`'s, and the edge lengths are
       each opened in `test/snapshots-stream.test.ts`. */
    let i = -1;
    const stream = new ReadableStream<Uint8Array>({
      pull(out) {
        if (i === -1) {
          const first = new Uint8Array(head.length + nonce.length);
          first.set(head);
          first.set(nonce, head.length);
          out.enqueue(first);
        } else if (i < count) {
          const n = new Uint8Array(12);
          new DataView(n.buffer).setUint32(7, i, false);
          if (i === count - 1) n[11] = 1;
          out.enqueue(chacha20poly1305(payloadKey, n, file.subarray(i * CHUNK, (i + 1) * CHUNK)));
        } else {
          out.close();
        }
        i++;
      },
    });
    return { length, stream };
  };
}
