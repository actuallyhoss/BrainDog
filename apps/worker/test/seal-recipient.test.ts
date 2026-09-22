/**
 * A low-order X25519 recipient, refused where the recipient is read and not where a record is sealed.
 *
 * WHAT WENT WRONG, MEASURED BY THE BATCH-SIXTEEN AUDIT (finding 8). The all-zero point
 * `age1qqqq...5cu47z` passed `recipientOf`, so `r2Snapshots` was built with it, and every `take()`
 * then threw. On Node it did not even throw the sealer's own sentence: WebCrypto's `deriveBits`
 * refuses an all-zero shared secret first, with "The operation failed for an operation-specific
 * reason", which names neither the variable nor the fix. So the nightly walk said a sentence nobody
 * could act on, once per record, where a placeholder recipient is said once, by name, before any
 * record is walked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { recipientOf } from '../src/seal.ts';
import { r2Snapshots } from '../src/snapshots.ts';
import { bech32, identity } from './age-open.ts';

const P = (1n << 255n) - 19n;

const le32 = (n: bigint): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & 0xffn));
const fromHex = (h: string): bigint => BigInt(`0x${h}`);

/**
 * Every 32-byte string X25519 reads as a point of order 1, 2, 4 or 8.
 *
 * THE FIVE u-COORDINATES are 0, 1 and p - 1 and the two of order 8 (big-endian hex below). X25519
 * reduces u modulo p and ignores bit 255, so p and p + 1 are the same points as 0 and 1, and each of
 * the seven has a twin with the top bit set. Fourteen encodings, and the test below does not take
 * the list on trust: each one is shown to make Node's WebCrypto refuse the exchange.
 */
function lowOrder(): Uint8Array[] {
  const base = [0n, 1n, P - 1n, fromHex('57119fd0dd4e22d8868e1c58c45c44045bef839c55b1d0b1248c50a3bc959c5f'), fromHex('00b8495f16056286fdb1329ceb8d09da6ac49ff1fae35616aeb8413b7c7aebe0')];
  const out: Uint8Array[] = [];
  for (const u of base)
    for (const v of u + P < 1n << 255n ? [u, u + P] : [u]) for (const w of [v, v + (1n << 255n)]) out.push(le32(w));
  return out;
}

/** Whether Node's WebCrypto will agree a secret with `pub`, which is the question `sealTo` would ask of it per record. */
async function nodeAccepts(pub: Uint8Array): Promise<boolean> {
  const mine = (await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits'])) as unknown as { privateKey: Parameters<typeof crypto.subtle.deriveBits>[1] };
  const them = await crypto.subtle.importKey('raw', pub, { name: 'X25519' }, false, []);
  try {
    await crypto.subtle.deriveBits({ name: 'X25519', public: them }, mine.privateKey, 256);
    return true;
  } catch {
    return false;
  }
}

test('THE ALL-ZERO POINT THE AUDIT USED IS REFUSED BY recipientOf, IN THE WORDS seal.ts ALREADY HAD FOR IT', () => {
  const said = recipientOf('age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5cu47z');
  assert.equal(typeof said, 'string', 'the all-zero point was accepted as a recipient');
  assert.match(String(said), /^AGE_RECIPIENT is a low-order X25519 point, and nothing sealed to it would be secret\./u);
  assert.match(String(said), /AGE_RECIPIENT empty/u);
});

test('EVERY LOW-ORDER ENCODING IS REFUSED, AND EACH IS ONE NODE WEBCRYPTO WOULD HAVE THROWN ON', async () => {
  const all = lowOrder();
  assert.equal(all.length, 14);
  for (const pub of all) {
    const hex = Buffer.from(pub).toString('hex');
    assert.equal(await nodeAccepts(pub), false, `${hex} is not low order after all, so the list is wrong`);
    assert.match(String(recipientOf(bech32('age', pub))), /low-order/u, `${hex} passed recipientOf`);
  }
});

test('A REAL RECIPIENT, OR ANY 32 BYTES WEBCRYPTO WILL USE, IS STILL ACCEPTED', async () => {
  // THE REFUSAL MUST BE EXACTLY WEBCRYPTO'S AND NO WIDER. A check that also refused some real keys
  // would stop the copy for an operator whose recipient is fine, so random strings, which are
  // points on the curve or on its twist about equally often, have to agree with Node both ways.
  const id = identity();
  assert.deepEqual(recipientOf(id.recipient), id.pub);
  const flipped = Uint8Array.from(id.pub);
  flipped[31] = (flipped[31] ?? 0) ^ 0x80;
  assert.ok(recipientOf(bech32('age', flipped)) instanceof Uint8Array, 'bit 255 is ignored by X25519 and must be here too');
  for (let i = 0; i < 64; i++) {
    const pub = new Uint8Array(randomBytes(32));
    const node = await nodeAccepts(pub);
    assert.equal(recipientOf(bech32('age', pub)) instanceof Uint8Array, node, Buffer.from(pub).toString('hex'));
  }
});

test('THE NIGHTLY COPY SAYS IT ONCE, WHEN THE COPIER IS BUILT, AND WRITES NOTHING', () => {
  // `{}` for the bucket is safe because a refusal at construction never reaches it; before this
  // change the construction succeeded and the probe's sealer threw WebCrypto's sentence per record.
  assert.throws(
    () => r2Snapshots({} as never, { recipient: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5cu47z' }),
    /^Error: The nightly copy did not run: AGE_RECIPIENT is a low-order X25519 point/u,
  );
});
