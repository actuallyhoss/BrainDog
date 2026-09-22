/**
 * The cloud copy's sealer: age v1 (https://age-encryption.org/v1) to one X25519 recipient. `53 §5.4`, `12 §8`.
 *
 * WHY AGE AND NOT A KEY OF OUR OWN. The identity that opens a copy is kept outside Cloudflare, in the
 * operator's password manager, and the restore drill (`53 §5.5`) opens it with the stock `age` CLI.
 * So the one property this file has to have is that `age -d -i identity.txt` opens what it writes.
 * A format of our own would need a reader of our own, on the one day the record is gone.
 *
 * WHY THE CIPHER IS WRITTEN OUT HERE. X25519, HKDF-SHA256 and HMAC-SHA256 are WebCrypto in both
 * workerd and Node 24, and they are used from there. ChaCha20-Poly1305 is not in WebCrypto at all,
 * and this Worker runs without `nodejs_compat` (`wrangler.jsonc`: `node:sqlite` is a stub under it),
 * so `node:crypto`'s is not reachable either. The lockfile carries no `@noble/ciphers` or any other
 * ChaCha20 package, and adding one would mean touching the workspace manifest and lockfile, which
 * belong to a different change. RFC 8439 is short and fully pinned by test vectors, and
 * `test/seal.test.ts` checks this one against OpenSSL's at every length that has an edge.
 *
 * THE COST, MEASURED: sealing 40 MiB, the snapshot ceiling, took 1.8 s on Node 24 on the machine
 * this was written on, and OpenSSL opened the same file in 95 ms. Poly1305 here is 13-bit limbs in
 * doubles, because the 26-bit limbs of poly1305-donna need a 64-bit product and a double holds 53
 * bits, and that is most of the gap. It is per record, inside a cron invocation's CPU limit, and it
 * is the number to re-measure before anybody raises the ceiling.
 */

/** An opaque WebCrypto key. Named structurally because this module is checked under both Node's and workerd's types. */
type Key = object;

/**
 * The five SubtleCrypto calls this file makes, and not one more.
 *
 * STRUCTURAL FOR THE SAME REASON `Blobs` IS in `snapshots.ts`: the Worker's program is checked with
 * `@cloudflare/workers-types` and the tests' with `@types/node`, and the two disagree on these
 * signatures in ways that do not matter here. workerd's types even spell the X25519 peer `$public`,
 * which is a quirk of their generator; the runtime reads `public`, as the spec says.
 */
type Subtle = {
  generateKey(alg: { name: string }, extractable: boolean, usages: string[]): Promise<unknown>;
  importKey(format: 'raw', data: Uint8Array, alg: string | { name: string; hash?: string }, extractable: boolean, usages: string[]): Promise<Key>;
  exportKey(format: 'raw', key: Key): Promise<ArrayBuffer>;
  deriveBits(alg: object, key: Key, length: number): Promise<ArrayBuffer>;
  sign(alg: string, key: Key, data: Uint8Array): Promise<ArrayBuffer>;
};

const subtle = (): Subtle => crypto.subtle as unknown as Subtle;

/* ════════ ChaCha20-Poly1305, RFC 8439, with no associated data (age never uses any) ════════ */

const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n));

/** One 64-byte ChaCha20 block for `counter`, written into `out`. */
function chachaBlock(key: Uint32Array, nonce: Uint32Array, counter: number, out: Uint8Array): void {
  const s = new Uint32Array(16);
  s[0] = 0x61707865;
  s[1] = 0x3320646e;
  s[2] = 0x79622d32;
  s[3] = 0x6b206574;
  s.set(key, 4);
  s[12] = counter;
  s.set(nonce, 13);
  const x = new Uint32Array(s);
  const qr = (a: number, b: number, c: number, d: number): void => {
    /* THE `?? 0` IS FOR THE TYPECHECKER ONLY: every index here is a constant below 16. */
    x[a] = (x[a] ?? 0) + (x[b] ?? 0);
    x[d] = rotl((x[d] ?? 0) ^ (x[a] ?? 0), 16);
    x[c] = (x[c] ?? 0) + (x[d] ?? 0);
    x[b] = rotl((x[b] ?? 0) ^ (x[c] ?? 0), 12);
    x[a] = (x[a] ?? 0) + (x[b] ?? 0);
    x[d] = rotl((x[d] ?? 0) ^ (x[a] ?? 0), 8);
    x[c] = (x[c] ?? 0) + (x[d] ?? 0);
    x[b] = rotl((x[b] ?? 0) ^ (x[c] ?? 0), 7);
  };
  for (let i = 0; i < 10; i++) {
    qr(0, 4, 8, 12);
    qr(1, 5, 9, 13);
    qr(2, 6, 10, 14);
    qr(3, 7, 11, 15);
    qr(0, 5, 10, 15);
    qr(1, 6, 11, 12);
    qr(2, 7, 8, 13);
    qr(3, 4, 9, 14);
  }
  const view = new DataView(out.buffer, out.byteOffset, 64);
  for (let i = 0; i < 16; i++) view.setUint32(i * 4, ((x[i] ?? 0) + (s[i] ?? 0)) >>> 0, true);
}

const words = (bytes: Uint8Array): Uint32Array => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  return Uint32Array.from({ length: bytes.length / 4 }, (_, i) => view.getUint32(i * 4, true));
};

/** Thirteen bits of `buf` starting at bit `at`, little-endian. `buf` has two bytes of slack past the last read. */
const bits13 = (buf: Uint8Array, at: number): number => {
  const i = at >>> 3;
  return (((buf[i] ?? 0) | ((buf[i + 1] ?? 0) << 8) | ((buf[i + 2] ?? 0) << 16)) >>> (at & 7)) & 0x1fff;
};

/**
 * One Poly1305 block of 16 bytes from `buf` folded into the accumulator `h`, in place. `buf` is 19
 * bytes: the block, then the byte that marks its end, then the two of slack `bits13` reads past.
 *
 * TEN LIMBS OF THIRTEEN BITS, so the widest intermediate is ten products of a 14-bit limb and a
 * 16-bit one, about 2^34, and every sum is exact in a double. Reduction folds the high half back
 * with the factor 5, because 2^130 is 5 modulo 2^130 - 5.
 */
function absorb(h: number[], r: number[], r5: number[], buf: Uint8Array, d: number[]): void {
  for (let k = 0; k < 10; k++) h[k] = (h[k] ?? 0) + bits13(buf, 13 * k);
  for (let i = 0; i < 10; i++) {
    let sum = 0;
    for (let j = 0; j < 10; j++) sum += (h[j] ?? 0) * (j <= i ? (r[i - j] ?? 0) : (r5[i - j + 10] ?? 0));
    d[i] = sum;
  }
  let c = 0;
  for (let i = 0; i < 10; i++) {
    const v = (d[i] ?? 0) + c;
    c = Math.floor(v / 8192);
    d[i] = v - c * 8192;
  }
  d[0] = (d[0] ?? 0) + c * 5;
  c = Math.floor((d[0] ?? 0) / 8192);
  d[0] = (d[0] ?? 0) - c * 8192;
  d[1] = (d[1] ?? 0) + c;
  for (let k = 0; k < 10; k++) h[k] = d[k] ?? 0;
}

/**
 * The RFC 8439 AEAD tag over ciphertext `ct` with no associated data, under a one-time 32-byte key.
 *
 * THE PADDING AND THE LENGTH BLOCK ARE FED IN, NOT BUILT. The first version copied the ciphertext
 * into a fresh zero-padded buffer with the lengths on the end and ran Poly1305 over that, which is a
 * second copy of every chunk. Here the last partial block is zero-filled in the 19-byte scratch
 * buffer, which is what the padding is, and the length block is one more block through the same
 * buffer. Every block counts as full, so the end marker is always byte 16. The last step is BigInt,
 * once per tag, where clarity costs nothing.
 */
function tagOf(key: Uint8Array, ct: Uint8Array): Uint8Array {
  const rb = new Uint8Array(19);
  rb.set(key.subarray(0, 16));
  for (const i of [3, 7, 11, 15]) rb[i] = (rb[i] ?? 0) & 15;
  for (const i of [4, 8, 12]) rb[i] = (rb[i] ?? 0) & 252;
  const r = Array.from({ length: 10 }, (_, k) => bits13(rb, 13 * k));
  const r5 = r.map((v) => v * 5);
  const h = new Array<number>(10).fill(0);
  const d = new Array<number>(10).fill(0);
  const buf = new Uint8Array(19);
  for (let at = 0; at < ct.length; at += 16) {
    buf.fill(0);
    buf.set(ct.subarray(at, Math.min(at + 16, ct.length)));
    buf[16] = 1;
    absorb(h, r, r5, buf, d);
  }
  /* THE LENGTH BLOCK: eight bytes of associated-data length, which is zero, then eight of ciphertext length. */
  buf.fill(0);
  new DataView(buf.buffer).setUint32(8, ct.length, true);
  buf[16] = 1;
  absorb(h, r, r5, buf, d);

  let acc = 0n;
  for (let k = 9; k >= 0; k--) acc = (acc << 13n) + BigInt(h[k] ?? 0);
  let s = 0n;
  for (let i = 31; i >= 16; i--) s = (s << 8n) + BigInt(key[i] ?? 0);
  let tag = ((acc % ((1n << 130n) - 5n)) + s) & ((1n << 128n) - 1n);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++, tag >>= 8n) out[i] = Number(tag & 0xffn);
  return out;
}

/**
 * ChaCha20-Poly1305 seal of `plain` written straight into `out` at `at`: the ciphertext, then the
 * 16-byte tag. `out` must have `plain.length + 16` bytes free there.
 *
 * INTO THE CALLER'S BUFFER AND NOT A NEW ONE, because `sealTo`'s buffer is the whole file. Sealing
 * each chunk into a fresh buffer and copying it across measured 34 MiB above the output at the
 * ceiling (`test/seal-memory.test.ts`), all of it chunks the collector had not reached yet.
 */
function sealInto(key: Uint8Array, nonce: Uint8Array, plain: Uint8Array, out: Uint8Array, at: number): void {
  const k = words(key);
  const n = words(nonce);
  const block = new Uint8Array(64);
  chachaBlock(k, n, 0, block);
  const polyKey = block.slice(0, 32);
  for (let from = 0, counter = 1; from < plain.length; from += 64, counter++) {
    chachaBlock(k, n, counter, block);
    const end = Math.min(64, plain.length - from);
    for (let i = 0; i < end; i++) out[at + from + i] = (plain[from + i] ?? 0) ^ (block[i] ?? 0);
  }
  out.set(tagOf(polyKey, out.subarray(at, at + plain.length)), at + plain.length);
}

/** ChaCha20-Poly1305 seal: ciphertext then the 16-byte tag. Exported for the test that holds it against OpenSSL. */
export function chacha20poly1305(key: Uint8Array, nonce: Uint8Array, plain: Uint8Array): Uint8Array {
  const out = new Uint8Array(plain.length + 16);
  sealInto(key, nonce, plain, out, 0);
  return out;
}

/* ════════ The recipient ════════ */

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

/** What to do about a recipient that will not do, said once. The value itself is never echoed: see `recipientOf`. */
const FIX = 'Paste the age1 recipient of the identity kept outside Cloudflare (12 §8), or set AGE_RECIPIENT empty to take unsealed copies.';

/**
 * The 32-byte X25519 key an `age1...` string names, or the sentence saying why it does not name one.
 *
 * A SENTENCE AND NOT A THROW, so the caller decides whether a bad recipient stops a whole nightly
 * walk (it does, in `snapshots.ts`) or is shown to somebody typing one.
 *
 * AND THE VALUE IS NEVER QUOTED BACK. The likeliest wrong thing to find in `AGE_RECIPIENT` is the
 * other half of the pair, `AGE-SECRET-KEY-1...`, pasted from the same password-manager entry, and a
 * refusal that repeated it would print the private key into the Worker's tail.
 */
export function recipientOf(value: string): Uint8Array | string {
  const raw = value.trim();
  if (raw.includes('<') || raw.includes('>'))
    return `AGE_RECIPIENT is still the placeholder wrangler.jsonc ships with, so no copy can be sealed. ${FIX}`;
  if (/^age-secret-key-/iu.test(raw))
    return `AGE_RECIPIENT holds an age identity, which is the private half and must never be a Worker var: treat it as leaked, make a new pair, and put only its age1 recipient here. ${FIX}`;
  const s = raw === raw.toUpperCase() ? raw.toLowerCase() : raw;
  const sep = s.lastIndexOf('1');
  if (s.slice(0, sep) !== 'age') return `AGE_RECIPIENT is not an age X25519 recipient: it does not begin age1. ${FIX}`;
  const data: number[] = [];
  for (const c of s.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return `AGE_RECIPIENT is not an age X25519 recipient: it has a character bech32 does not use. ${FIX}`;
    data.push(v);
  }
  const hrp = [...'age'].map((c) => c.charCodeAt(0));
  if (data.length < 6 || polymod([...hrp.map((c) => c >> 5), 0, ...hrp.map((c) => c & 31), ...data]) !== 1)
    return `AGE_RECIPIENT is not an age X25519 recipient: its checksum does not match, which is what a mistyped or truncated key looks like. ${FIX}`;
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const v of data.slice(0, -6)) {
    acc = ((acc << 5) | v) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || (acc & ((1 << bits) - 1)) !== 0 || bytes.length !== 32)
    return `AGE_RECIPIENT is not an age X25519 recipient: it decodes to ${String(bytes.length)} bytes and an X25519 key is 32. ${FIX}`;
  const key = new Uint8Array(bytes);
  if (lowOrder(key)) return `${LOW_ORDER} ${FIX}`;
  return key;
}

/** The sentence for a recipient no secret can be agreed with. Said by `recipientOf`, and by `sealTo` as the backstop. */
const LOW_ORDER = 'AGE_RECIPIENT is a low-order X25519 point, and nothing sealed to it would be secret.';

/**
 * Whether X25519 with `u` gives the all-zero secret for every private key, which is what the spec
 * tells a sender to refuse.
 *
 * HERE AND NOT ONLY IN `sealTo`, BECAUSE THERE IT WAS SAID ONCE PER RECORD AND NEVER IN ITS OWN
 * WORDS. The batch-sixteen audit (finding 8) built the nightly copier with the all-zero point and
 * every `take()` threw; on Node, WebCrypto's `deriveBits` refused the all-zero secret itself, with
 * "The operation failed for an operation-specific reason", before `sealTo`'s sentence was reached.
 * `recipientOf` is synchronous and runs where the copier is built, so the check cannot ask WebCrypto.
 *
 * THREE DOUBLINGS AND NOT A LIST OF BAD KEYS. A clamped private key is 8 times a number smaller than
 * either large prime subgroup order, of the curve or of its twist, so the secret is zero exactly
 * when 8u is the point at infinity, which is Z = 0 after three x-only doublings. That covers every
 * encoding at once, the non-canonical ones at and above p and the ones with bit 255 set included,
 * and `test/seal-recipient.test.ts` holds it against Node's WebCrypto on all fourteen and on random keys.
 */
function lowOrder(key: Uint8Array): boolean {
  const p = (1n << 255n) - 19n;
  let u = 0n;
  for (let i = 31; i >= 0; i--) u = (u << 8n) + BigInt(key[i] ?? 0);
  /* RFC 7748 §5: the receiver masks bit 255 and reads the rest modulo p. */
  u = (u & ((1n << 255n) - 1n)) % p;
  let x = u;
  let z = 1n;
  for (let i = 0; i < 3; i++) {
    const xx = (x * x) % p;
    const zz = (z * z) % p;
    const xz = (x * z) % p;
    [x, z] = [(xx - zz) ** 2n % p, (4n * xz * ((xx + 486662n * xz + zz) % p)) % p];
  }
  return z === 0n;
}

/* ════════ The file ════════ */

/** Unpadded standard base64, which is the only base64 the age header allows. */
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/=+$/u, '');

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, key, 256);
  return new Uint8Array(bits);
}

/** age's payload chunk: 64 KiB of plaintext, each sealed under its own counter nonce. */
const CHUNK = 64 * 1024;

/** A sealed file not yet written: how long it will be, and the stream that writes it. */
export type Sealed = { length: number; stream: ReadableStream<Uint8Array> };

/**
 * The sealer to one X25519 recipient, as a stream that seals one 64 KiB chunk per pull. The
 * recipient must already have passed `recipientOf`. This is the one implementation of age here:
 * the Worker streams it to R2 through `snapshots.ts`, and `sealTo` below reads it into a buffer.
 *
 * EVERY CALL IS A FRESH FILE KEY AND A FRESH EPHEMERAL SHARE, as the spec requires: two nights of
 * one record share nothing a reader of the bucket could line up. The stream reads `file` as it is
 * pulled and never copies it, so the caller must not change `file` until the stream ends.
 *
 * WHY A STREAM AND NOT ONE BUFFER. `take` used to hold the sealed file beside the plaintext for
 * both puts: measured by `test/snapshots-stream.test.ts` at the 40 MiB ceiling, 80 MiB live while
 * the bucket read, 40 of it above the plaintext. Pulled a chunk at a time it measured 2 MiB above.
 *
 * WHY THERE IS ONLY ONE. For one commit (`629e8861`) this stream lived in `seal-stream.ts` as a
 * line-for-line copy of the header and payload rules here, and the Worker called the copy while
 * `seal.test.ts` and `seal-memory.test.ts` tested the original. Breaking the copy's final-chunk
 * flag left both of those files green; only the streaming test saw it.
 */
export function sealStreamTo(recipient: Uint8Array): (file: Uint8Array) => Promise<Sealed> {
  return async (file) => {
    const { first, count, length, chunk } = await begin(recipient, file);

    /* THE HEADER AND THE PAYLOAD NONCE ARE THE FIRST PULL, then one sealed chunk per pull. */
    let i = -1;
    const stream = new ReadableStream<Uint8Array>({
      pull(out) {
        if (i === -1) {
          out.enqueue(first);
        } else if (i < count) {
          const plain = i === count - 1 ? file.length - i * CHUNK : CHUNK;
          const sealed = new Uint8Array(plain + 16);
          chunk(i, sealed, 0);
          out.enqueue(sealed);
        } else {
          out.close();
        }
        i++;
      },
    });
    return { length, stream };
  };
}

/**
 * Everything about one sealed file but its payload bytes: the header and payload nonce that open it,
 * its chunk count and length, and `chunk`, which seals chunk `i` into `out` at `at`. The one place
 * the header, the HKDF salts, the low-order refusal and the STREAM nonce rules are written.
 */
async function begin(
  recipient: Uint8Array,
  file: Uint8Array,
): Promise<{ first: Uint8Array; count: number; length: number; chunk: (i: number, out: Uint8Array, at: number) => void }> {
  const fileKey = crypto.getRandomValues(new Uint8Array(16));

  /* THE X25519 STANZA. The wrap key's salt is the ephemeral share then the recipient, in that order. */
  const pair = (await subtle().generateKey({ name: 'X25519' }, true, ['deriveBits'])) as { publicKey: Key; privateKey: Key };
  const share = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  const them = await subtle().importKey('raw', recipient, { name: 'X25519' }, true, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'X25519', public: them }, pair.privateKey, 256));
  /* AN ALL-ZERO SECRET MEANS A LOW-ORDER RECIPIENT, and the spec says to refuse it rather than wrap
     to it. `recipientOf` refuses one before a sealer exists, so this is for a caller that hands
     raw bytes in, and for a runtime whose WebCrypto returns the zeros instead of throwing. */
  if (shared.every((b) => b === 0)) throw new Error(LOW_ORDER);
  const wrapKey = await hkdf(shared, concat(share, recipient), 'age-encryption.org/v1/X25519');
  const body = chacha20poly1305(wrapKey, new Uint8Array(12), fileKey);

  /* THE HEADER AND ITS MAC. The MAC covers everything up to and including `---`, and not the space
     after it. The body is 32 bytes, 43 base64 characters, so it is one line under 64 and the
     stanza needs no empty closing line. */
  const header = `age-encryption.org/v1\n-> X25519 ${b64(share)}\n${b64(body)}\n---`;
  const macKey = await subtle().importKey('raw', await hkdf(fileKey, new Uint8Array(0), 'header'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await subtle().sign('HMAC', macKey, new TextEncoder().encode(header)));

  /* THE PAYLOAD. A 16-byte nonce salts the payload key, then STREAM: counter in the first eleven
     bytes of the nonce, and the last byte set on the final chunk only. An empty file is one empty
     final chunk; a file that is an exact multiple of 64 KiB ends on a full chunk that carries the
     flag, never on an empty one after it, which age refuses. */
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payloadKey = await hkdf(fileKey, nonce, 'payload');
  const first = concat(new TextEncoder().encode(`${header} ${b64(mac)}\n`), nonce);
  const count = Math.max(1, Math.ceil(file.length / CHUNK));
  const length = first.length + file.length + 16 * count;
  const chunk = (i: number, out: Uint8Array, at: number): void => {
    const n = new Uint8Array(12);
    new DataView(n.buffer).setUint32(7, i, false);
    if (i === count - 1) n[11] = 1;
    sealInto(payloadKey, n, file.subarray(i * CHUNK, (i + 1) * CHUNK), out, at);
  };
  return { first, count, length, chunk };
}

/**
 * The same sealer read into one buffer, for a caller that wants the whole file: the tests, which
 * open what it returns with `age-open.ts`, and anything without a bucket that takes a stream.
 *
 * THE SAME `begin` AS THE STREAM AND NOT A SECOND WRITER, so every test of this function is a test
 * of the header and nonce rules the Worker puts. The buffer is allocated once at its final length and
 * each chunk is sealed straight into its place, so the peak is the output plus a few MiB
 * (`test/seal-memory.test.ts`).
 */
export function sealTo(recipient: Uint8Array): (file: Uint8Array) => Promise<Uint8Array> {
  return async (file) => {
    const { first, count, length, chunk } = await begin(recipient, file);
    const out = new Uint8Array(length);
    out.set(first, 0);
    for (let i = 0, at = first.length; i < count; i++) {
      chunk(i, out, at);
      at += Math.min(CHUNK, file.length - i * CHUNK) + 16;
    }
    return out;
  };
}
