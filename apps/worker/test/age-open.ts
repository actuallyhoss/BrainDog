/**
 * An age v1 decryptor for the tests, written from https://age-encryption.org/v1 and nothing else.
 *
 * WHY THIS AND NOT THE REFERENCE. Neither reference was on this machine when the sealer was written:
 * `age` was not on PATH and neither `age-encryption` nor `pyrage` was installed, and the rule was to
 * check rather than install. So the proof of the sealer is a second reading of the spec, and it is
 * only worth anything if it shares no code with the first. It shares none: every primitive here is
 * `node:crypto`'s (OpenSSL's X25519, HKDF, HMAC and ChaCha20-Poly1305), where `src/seal.ts` uses
 * WebCrypto for the first three and its own ChaCha20-Poly1305. A mistake in the sealer's cipher
 * therefore shows up as a tag OpenSSL refuses, which is the failure that matters.
 *
 * WHAT IS LEFT UNPROVEN, SAID PLAINLY: this reader and the sealer were both written by one hand
 * from one spec, so a misreading of the spec itself (the order of the HKDF salt, say) could appear
 * in both and cancel. The README recipient in `seal.test.ts` is the one input taken from outside. The
 * restore drill (`53 §5.5`) with the real `age` CLI is what closes the rest.
 */

import { createDecipheriv, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, type KeyObject } from 'node:crypto';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= gen[i] ?? 0;
  }
  return chk >>> 0;
}

/** bech32 (BIP 173, not bech32m), which is what an `age1` recipient is. */
export function bech32(hrp: string, bytes: Uint8Array): string {
  const data: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      data.push((acc >>> bits) & 31);
    }
  }
  if (bits > 0) data.push((acc << (5 - bits)) & 31);
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const mod = polymod([...expanded, ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const check = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...check].map((d) => CHARSET[d]).join('')}`;
}

/** An identity for one test: the private key for `node:crypto` and the `age1` string a deployment would name. */
export function identity(): { priv: KeyObject; pub: Uint8Array; recipient: string } {
  const pair = generateKeyPairSync('x25519');
  const x = pair.publicKey.export({ format: 'jwk' }).x ?? '';
  const pub = new Uint8Array(Buffer.from(x, 'base64url'));
  return { priv: pair.privateKey, pub, recipient: bech32('age', pub) };
}

const unb64 = (s: string): Buffer => {
  /* THE SPEC FORBIDS PADDING AND SO DOES THIS READER, so a sealer that padded is caught here. */
  if (s.includes('=')) throw new Error(`padded base64 in an age header: ${s}`);
  return Buffer.from(s, 'base64');
};

const hkdf = (ikm: Uint8Array, salt: Uint8Array, info: string): Buffer =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, 32));

function open(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array): Buffer {
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
}

/** Decrypts an age v1 file to one X25519 identity, or throws naming the step that refused it. */
export function ageOpen(file: Uint8Array, id: { priv: KeyObject; pub: Uint8Array }): Buffer {
  const text = Buffer.from(file).toString('latin1');
  const end = text.indexOf('\n---');
  if (end < 0) throw new Error('no header terminator');
  const macLineEnd = text.indexOf('\n', end + 1);
  const header = text.slice(0, end + 4);
  const lines = header.split('\n');
  if (lines[0] !== 'age-encryption.org/v1') throw new Error(`wrong version line: ${lines[0] ?? ''}`);

  let fileKey: Buffer | null = null;
  for (let i = 1; i < lines.length - 1; i++) {
    const args = (lines[i] ?? '').split(' ');
    if (args[0] !== '->') continue;
    const body: string[] = [];
    /* A STANZA BODY ENDS AT ITS FIRST LINE SHORTER THAN 64 COLUMNS, which may be empty. */
    for (let j = i + 1; j < lines.length - 1; j++) {
      body.push(lines[j] ?? '');
      i = j;
      if ((lines[j] ?? '').length < 64) break;
    }
    if (args[1] !== 'X25519' || args.length !== 3) continue;
    const share = unb64(args[2] ?? '');
    if (share.length !== 32) throw new Error('X25519 share is not 32 bytes');
    const peer = { key: { kty: 'OKP', crv: 'X25519', x: share.toString('base64url') }, format: 'jwk' as const };
    const shared = diffieHellman({ privateKey: id.priv, publicKey: createPublicKey(peer) });
    const wrap = hkdf(shared, Buffer.concat([share, id.pub]), 'age-encryption.org/v1/X25519');
    fileKey = open(wrap, new Uint8Array(12), unb64(body.join('')));
  }
  if (!fileKey) throw new Error('no X25519 stanza this identity opens');
  if (fileKey.length !== 16) throw new Error('file key is not 16 bytes');

  const mac = createHmac('sha256', hkdf(fileKey, new Uint8Array(0), 'header')).update(Buffer.from(header, 'latin1')).digest();
  const said = text.slice(end + 4, macLineEnd);
  if (!said.startsWith(' ') || !unb64(said.slice(1)).equals(mac)) throw new Error('header MAC does not verify');

  const rest = Buffer.from(file).subarray(macLineEnd + 1);
  const nonce = rest.subarray(0, 16);
  const key = hkdf(fileKey, nonce, 'payload');
  const payload = rest.subarray(16);
  const CHUNK = 64 * 1024 + 16;
  const out: Buffer[] = [];
  let counter = 0;
  for (let at = 0; ; at += CHUNK, counter++) {
    const chunk = payload.subarray(at, at + CHUNK);
    const last = at + CHUNK >= payload.length;
    const n = Buffer.alloc(12);
    n.writeUIntBE(counter, 5, 6);
    if (last) n[11] = 1;
    const plain = open(key, n, chunk);
    if (last && plain.length === 0 && counter > 0) throw new Error('an empty final chunk after a full one');
    out.push(plain);
    if (last) break;
  }
  return Buffer.concat(out);
}
