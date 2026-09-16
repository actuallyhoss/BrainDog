/**
 * WebAuthn verification: what an authenticator writes, read back, and every way it can be wrong.
 *
 * TWO KINDS OF INPUT. The committed vectors (`fixtures/webauthn/vectors.json`) were signed once by the software
 * authenticator beside them and are read, never regenerated, so a change to the verifier is measured against
 * bytes it did not produce. The negatives are signed live with the same committed keys, one part wrong at a
 * time, and each asserts the `Why` it fails with: a negative that failed for a different reason than the one it
 * names would pass while proving nothing.
 *
 * `dup` IS THE ONE `Why` NOT HERE. A credential id the Directory already holds is the Directory's to see, and
 * `identity.test.ts` asserts it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { assertion, b64url, cbor, clientData, derToRaw, registration, unb64url, type Alg, type PublicJwk, type Verdict } from '../src/webauthn.ts';
import {
  FLAG,
  assert as sign,
  authData,
  clientJSON,
  coseOf,
  encode,
  rawToDer,
  register,
  testKeys,
  type CborIn,
  type TestKey,
} from './fixtures/webauthn/authenticator.ts';

type RegVector = { challenge: string; id: string; response: { clientDataJSON: string; attestationObject: string } };
type AssertVector = {
  challenge: string;
  signCount: number;
  id: string;
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle: string | null };
};
type Pair = { registration: RegVector; packed: RegVector; assertion: AssertVector };
type Vectors = { origin: string; rpId: string; person: string; es256: Pair; rs256: Pair };

const V = JSON.parse(readFileSync(new URL('./fixtures/webauthn/vectors.json', import.meta.url), 'utf8')) as Vectors;
const KEYS = testKeys()!;
const EXPECT = { origin: V.origin, rpId: V.rpId };
/** Any canonical challenge will do for a live negative: the verifier compares it, the Directory is what issues it. */
const CHALLENGE = b64url(new TextEncoder().encode('a challenge for the negatives, 32b'));

const bytes = (s: string): Uint8Array => {
  const out = unb64url(s);
  assert.ok(out, `${s.slice(0, 12)} is not canonical base64url`);
  return out;
};
const reg = (v: RegVector) => ({ clientDataJSON: bytes(v.response.clientDataJSON), attestationObject: bytes(v.response.attestationObject) });
const asr = (v: AssertVector) => ({
  clientDataJSON: bytes(v.response.clientDataJSON),
  authenticatorData: bytes(v.response.authenticatorData),
  signature: bytes(v.response.signature),
  userHandle: v.response.userHandle === null ? null : bytes(v.response.userHandle),
});
const why = (v: Verdict<unknown>): string => (v.ok ? 'ok' : v.why);

/** The public key a registration yields, which is what an assertion is checked against. */
async function publicOf(key: TestKey): Promise<{ jwk: PublicJwk; alg: Alg }> {
  const made = await register(key, { rpId: V.rpId, origin: V.origin, challenge: CHALLENGE });
  const v = await registration(made, { ...EXPECT, challenge: CHALLENGE });
  assert.ok(v.ok, `the test key did not register: ${why(v)}`);
  return { jwk: v.value.jwk, alg: v.value.alg };
}

type RegOptions = Parameters<typeof register>[1];
type AssertOptions = Parameters<typeof sign>[1];

/** A live registration with one part changed, and the `Why` it fails with. */
async function registerWhy(change: Partial<RegOptions>, expect: { challenge?: string } = {}, key: TestKey = KEYS.es256): Promise<string> {
  const made = await register(key, { rpId: V.rpId, origin: V.origin, challenge: CHALLENGE, ...change });
  return why(await registration(made, { ...EXPECT, challenge: CHALLENGE, ...expect }));
}

/** A live assertion with one part changed, against a stored count, and the `Why` it fails with. */
async function assertWhy(
  change: Partial<AssertOptions>,
  expect: { challenge?: string; signCount?: number; person?: string; jwk?: PublicJwk } = {},
  key: TestKey = KEYS.es256,
  mangle: (a: Awaited<ReturnType<typeof sign>>) => Awaited<ReturnType<typeof sign>> = (a) => a,
): Promise<string> {
  const pub = await publicOf(key);
  const signed = mangle(await sign(key, { rpId: V.rpId, origin: V.origin, challenge: CHALLENGE, signCount: 5, person: V.person, ...change }));
  return why(await assertion(signed, { ...EXPECT, challenge: CHALLENGE, jwk: pub.jwk, alg: pub.alg, signCount: 0, person: V.person, ...expect }));
}

/* ── the committed vectors ────────────────────────────────────────────── */

test('THE COMMITTED VECTORS VERIFY: a registration and an assertion, ES256 and RS256', async () => {
  for (const [name, alg, stored] of [['es256', -7, 3], ['rs256', -257, 0]] as const) {
    const pair = V[name];
    const made = await registration(reg(pair.registration), { ...EXPECT, challenge: pair.registration.challenge });
    assert.ok(made.ok, `${name} registration: ${why(made)}`);
    assert.equal(made.value.id, pair.registration.id, 'the attested credential id is not the one the browser reported');
    assert.equal(made.value.alg, alg);
    assert.equal(made.value.signCount, 0);
    assert.equal(made.value.backedUp, false);

    const signed = await assertion(asr(pair.assertion), {
      ...EXPECT,
      challenge: pair.assertion.challenge,
      jwk: made.value.jwk,
      alg: made.value.alg,
      signCount: stored,
      person: V.person,
    });
    assert.ok(signed.ok, `${name} assertion: ${why(signed)}`);
    /* ES256 counts (7 over a stored 3) and RS256 reports zero over zero: both halves of the rule. */
    assert.equal(signed.value.signCount, pair.assertion.signCount);
  }
});

test('AND A PACKED STATEMENT THAT IS GARBAGE IS REGISTERED, because the statement is never read', async () => {
  /* 49 §9: the session is the attestation. A verifier that read `attStmt` would refuse this and would also be
     carrying the certificate parsing the plan decided not to carry. */
  for (const name of ['es256', 'rs256'] as const) {
    const v = await registration(reg(V[name].packed), { ...EXPECT, challenge: V[name].packed.challenge });
    assert.equal(why(v), 'ok', name);
  }
});

test('AN ASSERTION VERIFIES IN UNDER 3 MS, ES256 and RS256 (49 §7)', async (t) => {
  for (const name of ['es256', 'rs256'] as const) {
    const pair = V[name];
    const made = await registration(reg(pair.registration), { ...EXPECT, challenge: pair.registration.challenge });
    assert.ok(made.ok);
    const input = asr(pair.assertion);
    const run = () =>
      assertion(input, { ...EXPECT, challenge: pair.assertion.challenge, jwk: made.value.jwk, alg: made.value.alg, signCount: 0, person: V.person });
    for (let i = 0; i < 10; i++) assert.ok((await run()).ok);
    /* THE QUICKEST OF FIVE BATCHES, NOT ONE MEAN. One mean of 200 failed at 9 ms on a machine busy with the rest of the
       workspace's tests and passed alone; a verifier that is really slow is slow in every batch, so the best batch
       still catches it and a busy neighbour does not. */
    const rounds = 40;
    let each = Infinity;
    for (let batch = 0; batch < 5; batch++) {
      const started = performance.now();
      for (let i = 0; i < rounds; i++) await run();
      each = Math.min(each, (performance.now() - started) / rounds);
    }
    t.diagnostic(`${name}: ${each.toFixed(3)} ms per assertion, the quickest of five batches of ${rounds}`);
    assert.ok(each < 3, `${name} took ${each.toFixed(3)} ms per assertion`);
  }
});

/* ── registration, one part wrong at a time ───────────────────────────── */

test('registration refuses a malformed response as shape', async () => {
  assert.equal(await registerWhy({ client: { challenge: 42 } }), 'shape', 'a challenge that is not a string');
  assert.equal(await registerWhy({ client: { origin: undefined } }), 'shape', 'no origin');
  assert.equal(
    await registerWhy({ attestation: () => encode(new Map<string, CborIn>([['fmt', 'none'], ['attStmt', new Map()]])) }),
    'shape',
    'no authData',
  );
  assert.equal(
    await registerWhy({ attestation: () => encode(new Map<string, CborIn>([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(20)]])) }),
    'shape',
    'authData shorter than its fixed header',
  );
  assert.equal(
    await registerWhy({
      attestation: (d) => encode(new Map<string, CborIn>([['fmt', 'none'], ['attStmt', new Map()], ['authData', d.subarray(0, 60)]])),
    }),
    'shape',
    'a credential id longer than what follows it',
  );
  assert.equal(await registerWhy({ attestation: () => encode([1, 2, 3]) }), 'shape', 'an attestation object that is not a map');
  const bad = await registration(
    { clientDataJSON: new TextEncoder().encode('{"type":'), attestationObject: new Uint8Array() },
    { ...EXPECT, challenge: CHALLENGE },
  );
  assert.equal(why(bad), 'shape', 'client data that is not JSON');
});

test('registration refuses CBOR it will not read as cbor', async () => {
  /* 49 §9's row: an indefinite-length map. `bf` opens one, `ff` closes it. */
  const fmt = [0x63, ...new TextEncoder().encode('fmt'), 0x64, ...new TextEncoder().encode('none')];
  assert.equal(await registerWhy({ attestation: () => new Uint8Array([0xbf, ...fmt, 0xff]) }), 'cbor', 'an indefinite-length map');
  assert.equal(
    await registerWhy({ attestation: (d) => new Uint8Array([...encode(new Map<string, CborIn>([['fmt', 'none'], ['attStmt', new Map()], ['authData', d]])), 0]) }),
    'cbor',
    'a byte after the attestation object',
  );
  assert.equal(await registerWhy({ tail: new Uint8Array([0]) }), 'cbor', 'a byte after the COSE key with no ED flag');
  assert.equal(
    await registerWhy({ flags: FLAG.UP | FLAG.AT | FLAG.ED, tail: encode([1]) }),
    'cbor',
    'extensions that are not a map',
  );
  assert.equal(await registerWhy({ flags: FLAG.UP | FLAG.AT | FLAG.ED, tail: encode(new Map([['credProps', true]])) }), 'ok', 'real extensions');
});

test('registration refuses the wrong ceremony, challenge and origin, in that order', async () => {
  assert.equal(await registerWhy({ client: { type: 'webauthn.get' } }), 'type');
  assert.equal(await registerWhy({}, { challenge: b64url(new Uint8Array(32)) }), 'challenge');
  /* The origin is compared as the string the browser wrote: no normalising, no suffix match. */
  for (const origin of ['https://evil.example', 'https://studio.example/', 'http://studio.example', 'https://a.studio.example', 'https://studio.example:443'])
    assert.equal(await registerWhy({ origin }), 'origin', origin);
  /* A type that is wrong outranks an origin that is wrong: the checks run in one order. */
  assert.equal(await registerWhy({ origin: 'https://evil.example', client: { type: 'webauthn.get' } }), 'type');
});

test('AND NEVER FROM INSIDE A FRAME ON ANOTHER SITE', async () => {
  assert.equal(await registerWhy({ client: { crossOrigin: true } }), 'origin');
  assert.equal(await registerWhy({ client: { crossOrigin: 'yes', topOrigin: 'https://evil.example' } }), 'origin');
  assert.equal(await registerWhy({ client: { crossOrigin: undefined } }), 'ok', 'an absent crossOrigin is not a frame');
});

test('registration refuses a passkey made for another relying party as rpid', async () => {
  assert.equal(await registerWhy({ rpId: 'evil.example' }), 'rpid');
  assert.equal(await registerWhy({ rpId: 'example' }), 'rpid', 'the parent domain is not this relying party');
});

test('registration needs user presence and attested credential data, and consistent backup bits', async () => {
  assert.equal(await registerWhy({ flags: FLAG.AT }), 'flags', 'no user presence');
  assert.equal(await registerWhy({ flags: FLAG.UP }), 'flags', 'no attested credential data');
  assert.equal(await registerWhy({ flags: FLAG.UP | FLAG.AT | FLAG.BS }), 'flags', 'backed up but not backup-eligible');
  const synced = await register(KEYS.es256, { rpId: V.rpId, origin: V.origin, challenge: CHALLENGE, flags: FLAG.UP | FLAG.AT | FLAG.BE | FLAG.BS });
  const v = await registration(synced, { ...EXPECT, challenge: CHALLENGE });
  assert.ok(v.ok && v.value.backedUp, 'a synced passkey is not reported as backed up');
});

test('registration takes ES256 on P-256 and RS256 of 2048 bits, and nothing else, as alg', async () => {
  const es = coseOf(KEYS.es256);
  const x = es.get(-2) as Uint8Array;
  const y = es.get(-3) as Uint8Array;
  assert.equal(await registerWhy({ cose: new Map<number, CborIn>([[1, 1], [3, -8], [-1, 6], [-2, x]]) }), 'alg', 'Ed25519');
  assert.equal(await registerWhy({ cose: new Map<number, CborIn>([[1, 2], [3, -7], [-1, 2], [-2, x], [-3, y]]) }), 'alg', 'ES256 on P-384');
  assert.equal(await registerWhy({ cose: new Map<number, CborIn>([[1, 2], [3, -35], [-1, 1], [-2, x], [-3, y]]) }), 'alg', 'ES384 named on P-256');
  assert.equal(await registerWhy({ cose: new Map<number, CborIn>([[1, 3], [3, -7], [-1, 1], [-2, x], [-3, y]]) }), 'alg', 'an EC key labelled RSA');
  const rs = coseOf(KEYS.rs256);
  const n = rs.get(-1) as Uint8Array;
  assert.equal(await registerWhy({ cose: new Map<number, CborIn>([[1, 3], [3, -257], [-1, n.subarray(0, 128)], [-2, rs.get(-2)!]]) }, {}, KEYS.rs256), 'alg', 'RSA-1024');
  /* A point that is not on the curve: the shape is right and WebCrypto refuses the key. */
  const off = new Uint8Array(32).fill(1);
  assert.equal(await registerWhy({ cose: new Map<number, CborIn>([[1, 2], [3, -7], [-1, 1], [-2, off], [-3, off]]) }), 'alg', 'a point off the curve');
  assert.equal(await registerWhy({}, {}, KEYS.rs256), 'ok', 'RS256 itself');
});

/* ── assertion, one part wrong at a time ──────────────────────────────── */

test('an assertion is refused for the wrong ceremony, challenge, origin and relying party', async () => {
  assert.equal(await assertWhy({}), 'ok', 'the control');
  assert.equal(await assertWhy({ client: { type: 'webauthn.create' } }), 'type');
  assert.equal(await assertWhy({}, { challenge: b64url(new Uint8Array(32)) }), 'challenge');
  assert.equal(await assertWhy({ origin: 'https://evil.example' }), 'origin');
  assert.equal(await assertWhy({ client: { crossOrigin: true } }), 'origin');
  assert.equal(await assertWhy({ rpId: 'evil.example' }), 'rpid');
  assert.equal(await assertWhy({ flags: FLAG.UV }), 'flags', 'verified but not present');
  assert.equal(
    await assertWhy({}, {}, KEYS.es256, (a) => ({ ...a, authenticatorData: a.authenticatorData.subarray(0, 30) })),
    'shape',
    'authenticator data shorter than its header',
  );
});

test('an assertion is refused unless the signature is over exactly what was sent, as sig', async () => {
  const flip = (b: Uint8Array, offset: number, mask = 1) => {
    const out = new Uint8Array(b);
    out[offset] = out[offset]! ^ mask;
    return out;
  };
  for (const key of [KEYS.es256, KEYS.rs256]) {
    const name = key.alg === -7 ? 'ES256' : 'RS256';
    assert.equal(await assertWhy({}, {}, key, (a) => ({ ...a, signature: flip(a.signature, a.signature.length - 1) })), 'sig', `${name}: a flipped bit`);
    /* The UV bit changed after signing: the flags still pass, the signature no longer covers them. */
    assert.equal(await assertWhy({}, {}, key, (a) => ({ ...a, authenticatorData: flip(a.authenticatorData, 32, FLAG.UV) })), 'sig', `${name}: authData moved`);
    assert.equal(
      await assertWhy({}, {}, key, (a) => ({ ...a, clientDataJSON: clientJSON({ type: 'webauthn.get', challenge: CHALLENGE, origin: V.origin }) })),
      'sig',
      `${name}: client data rewritten`,
    );
  }
  assert.equal(await assertWhy({}, {}, KEYS.es256, (a) => ({ ...a, signature: new Uint8Array([0x30, 0x02, 0x02, 0x00]) })), 'sig', 'DER that is not a signature');
  /* An RS256 signature presented against the stored ES256 key: not even DER. */
  const other = await sign(KEYS.rs256, { rpId: V.rpId, origin: V.origin, challenge: CHALLENGE, signCount: 5, person: V.person });
  assert.equal(await assertWhy({}, {}, KEYS.es256, (a) => ({ ...a, signature: other.signature })), 'sig', 'another key’s signature');
});

test('an assertion against a stored key WebCrypto will not import is refused as alg', async () => {
  assert.equal(await assertWhy({}, { jwk: { kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'AAAA' } }), 'alg');
});

test('THE SIGN COUNT: if either count is non-zero the new one must be greater', async () => {
  assert.equal(await assertWhy({ signCount: 5 }, { signCount: 5 }), 'count', 'the same count again');
  assert.equal(await assertWhy({ signCount: 4 }, { signCount: 5 }), 'count', 'a count that went backwards');
  assert.equal(await assertWhy({ signCount: 0 }, { signCount: 5 }), 'count', 'a counter that stopped counting');
  assert.equal(await assertWhy({ signCount: 6 }, { signCount: 5 }), 'ok');
  assert.equal(await assertWhy({ signCount: 0 }, { signCount: 0 }), 'ok', 'a synced passkey reports zero for ever');
  assert.equal(await assertWhy({ signCount: 1 }, { signCount: 0 }), 'ok', 'the first count');
  assert.equal(await assertWhy({ signCount: 0xffffffff }, { signCount: 0xfffffffe }), 'ok', 'the top of the 32-bit range');
});

test('A USER HANDLE, WHEN THERE IS ONE, IS THE PERSON THE PASSKEY WAS MADE FOR', async () => {
  assert.equal(await assertWhy({ person: 'p_somebody_else' }), 'handle');
  assert.equal(await assertWhy({ person: null }), 'ok', 'no handle is not a mismatch');
  assert.equal(await assertWhy({}, {}, KEYS.es256, (a) => ({ ...a, userHandle: new Uint8Array() })), 'ok', 'an empty handle is not a mismatch');
});

/* ── the parts ────────────────────────────────────────────────────────── */

test('cbor reads the six major types WebAuthn uses and refuses the rest', () => {
  const ok = (b: number[]) => cbor(new Uint8Array(b));
  const refused = (b: number[], what: string) => assert.equal(why(ok(b)), 'cbor', what);

  assert.deepEqual(ok([0x18, 0xff]), { ok: true, value: 255 });
  assert.deepEqual(ok([0x38, 0x18]), { ok: true, value: -25 });
  assert.deepEqual(ok([0xf4]), { ok: true, value: false });
  assert.deepEqual(ok([0xf6]), { ok: true, value: null });
  const map = ok([0xa2, 0x01, 0x02, 0x61, 0x61, 0x42, 0x01, 0x02]);
  assert.ok(map.ok && map.value instanceof Map && map.value.get(1) === 2);

  /* Four containers deep is an attestation object; five is not WebAuthn. */
  assert.equal(why(ok([0x81, 0x81, 0x81, 0x81, 0x00])), 'ok', 'four deep');
  refused([0x81, 0x81, 0x81, 0x81, 0x81, 0x00], 'five deep');
  /* 2^53 - 1 is the largest integer read exactly; 2^53 is refused. */
  assert.deepEqual(ok([0x1b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), { ok: true, value: Number.MAX_SAFE_INTEGER });
  refused([0x1b, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], '2^53');
  refused([0x5f, 0x41, 0x00, 0xff], 'indefinite-length bytes');
  refused([0x9f, 0x00, 0xff], 'an indefinite-length array');
  refused([0xbf, 0x00, 0x00, 0xff], 'an indefinite-length map');
  refused([0xc0, 0x00], 'a tag');
  refused([0xf9, 0x3c, 0x00], 'a half float');
  refused([0xfb, 0, 0, 0, 0, 0, 0, 0, 0], 'a double');
  refused([0xf8, 0x20], 'a one-byte simple value');
  refused([0x1c], 'a reserved additional information');
  refused([0xa2, 0x01, 0x00, 0x01, 0x00], 'a key given twice');
  refused([0xa1, 0x41, 0x00, 0x00], 'a key that is bytes');
  refused([0x62, 0xc3, 0x28], 'text that is not UTF-8');
  refused([0x45, 0x01, 0x02], 'bytes longer than what is left');
  refused([0x9b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], 'an array longer than what is left');
  refused([0x00, 0x00], 'a byte left over');
  refused([], 'nothing at all');
});

test('derToRaw takes 33-byte and short integers and pads them to 32', () => {
  const r = new Uint8Array(32).fill(0x11);
  r[0] = 0x80;
  const s = new Uint8Array(32).fill(0x22);
  const der33 = new Uint8Array([0x30, 0x45, 0x02, 0x21, 0x00, ...r, 0x02, 0x20, ...s]);
  assert.deepEqual(derToRaw(der33), new Uint8Array([...r, ...s]), 'a 33-byte r with its sign zero');

  const short = derToRaw(new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]));
  const want = new Uint8Array(64);
  want[31] = 1;
  want[63] = 2;
  assert.deepEqual(short, want, 'one-byte integers are left-padded');

  assert.equal(derToRaw(new Uint8Array([0x30, 0x45, 0x02, 0x21, 0x01, ...r, 0x02, 0x20, ...s])), null, '33 bytes with no sign zero');
  assert.equal(derToRaw(new Uint8Array([0x30, 0x46, 0x02, 0x22, 0x00, 0x00, ...r, 0x02, 0x20, ...s])), null, '34 bytes');
  assert.equal(derToRaw(new Uint8Array([0x31, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02])), null, 'not a SEQUENCE');
  assert.equal(derToRaw(new Uint8Array([0x30, 0x06, 0x03, 0x01, 0x01, 0x02, 0x01, 0x02])), null, 'not an INTEGER');
  assert.equal(derToRaw(new Uint8Array([0x30, 0x07, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x00])), null, 'a byte after s');
  assert.equal(derToRaw(new Uint8Array([0x30, 0x06, 0x02, 0x00, 0x02, 0x02, 0x01, 0x02])), null, 'an empty INTEGER');
  assert.equal(derToRaw(new Uint8Array([0x30, 0x81, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02])), null, 'a long-form length');

  /* And every raw signature survives the round trip through minimal DER, which exercises both paths above. */
  for (let i = 0; i < 300; i++) {
    const raw = crypto.getRandomValues(new Uint8Array(64));
    if (i % 3 === 0) raw.fill(0, 0, 2);
    assert.deepEqual(derToRaw(rawToDer(raw)), raw);
  }
});

test('base64url is read only in its canonical spelling, because an id is a key', () => {
  for (let n = 0; n < 40; n++) {
    const b = crypto.getRandomValues(new Uint8Array(n));
    assert.deepEqual(unb64url(b64url(b)), b);
  }
  assert.equal(unb64url('AA=='), null, 'padding');
  assert.equal(unb64url('a+b/'), null, 'the other alphabet');
  assert.equal(unb64url('AB'), null, 'bits set past the last byte');
  assert.equal(unb64url('AAAAA'), null, 'a length no encoding produces');
  assert.deepEqual(unb64url(''), new Uint8Array());
});

test('clientData answers the challenge the browser carried, for the Directory to look up', () => {
  const json = clientJSON({ type: 'webauthn.get', challenge: CHALLENGE, origin: V.origin });
  assert.deepEqual(clientData(json, { type: 'webauthn.get', origin: V.origin }), { ok: true, value: { challenge: CHALLENGE } });
  assert.equal(why(clientData(new Uint8Array([0xff]), { type: 'webauthn.get', origin: V.origin })), 'shape', 'not UTF-8');
  assert.equal(why(clientData(clientJSON({}), { type: 'webauthn.get', origin: V.origin })), 'shape', 'no fields');
  assert.equal(why(clientData(new TextEncoder().encode('[]'), { type: 'webauthn.get', origin: V.origin })), 'shape', 'an array');
});

test('authenticator data is laid out as the authenticator writes it', async () => {
  /* A guard on the guard: the software authenticator's layout is what every test above relies on. */
  const data = await authData({ rpId: V.rpId, flags: FLAG.UP, signCount: 0x01020304 });
  assert.equal(data.length, 37);
  assert.deepEqual([...data.subarray(33)], [1, 2, 3, 4]);
});
