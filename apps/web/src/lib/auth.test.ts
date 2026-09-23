/**
 * The browser half of sign-in, against a stubbed `fetch` and a stubbed `navigator.credentials`.
 *
 * WHAT MATTERS IS WHERE A CREDENTIAL GOES AND THAT NOTHING THROWS. Each test records every request, so
 * a key that leaked into a URL or a header, or a second request after a cancelled sheet, is a failure
 * here rather than a finding in a review.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  exchangeKey,
  methods,
  passkeyRegister,
  passkeys,
  passkeySignIn,
  redeemLink,
  removePasskey,
  requestLink,
  signOut,
  support,
  takeLink,
  type Io,
} from './auth.ts';

type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const ok = (value: unknown) => json(200, { ok: true, value });
const no = (status: number, fix: string) => json(status, { ok: false, refusal: { code: 'UNAUTHORIZED', fix } });

/** A `fetch` that answers by path, and records what it was asked. */
function host(routes: Record<string, () => Response | Promise<Response>>, credentials?: Io['credentials']) {
  const seen: Seen[] = [];
  const io: Io = {
    fetch: async (url, init) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers ?? {}).entries()),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const answer = routes[url];
      return answer ? answer() : new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'content-type': 'text/html' } });
    },
    credentials,
  };
  return { io, seen };
}

const WHO = { person: 'p_01', email: 'ada@example.com', record: 'studio', provedAt: 1_757_000_000_000 };
const METHODS = { passkey: true, magic: false, key: true, open: false, demo: false, me: null, firstRun: false };

/** Bytes as the authenticator hands them back. */
const buf = (...b: number[]) => new Uint8Array(b).buffer;

/** A `navigator.credentials` that answers one thing, and keeps what it was given. */
function authenticator(answer: () => unknown) {
  const given: { create: unknown[]; get: unknown[] } = { create: [], get: [] };
  const credentials = {
    create: async (o: unknown) => (given.create.push(o), answer()),
    get: async (o: unknown) => (given.get.push(o), answer()),
  } as unknown as Io['credentials'];
  return { credentials, given };
}

const named = (name: string) => Object.assign(new Error(name), { name });

/* ── methods ─────────────────────────────────────────────────────────────── */

test('methods reads the host and keeps only the fields the screen uses', async () => {
  const { io } = host({ '/auth/methods': () => ok({ ...METHODS, why: 'not-configured', extra: 1, me: WHO }) });
  const out = await methods(io);
  assert.deepEqual(out, { ok: true, value: { ...METHODS, why: 'not-configured', me: WHO } });

  /* `why` is a code the screen turns into its own sentence, so a word it does not know is dropped. */
  const odd = await methods(host({ '/auth/methods': () => ok({ ...METHODS, why: 'Sign-in is off.' }) }).io);
  assert.ok(odd.ok && !('why' in odd.value));
});

test('A HOST THAT DOES NOT KNOW /auth IS NO HOST, NOT A REFUSAL: the SPA fallback and a 404 both', async () => {
  assert.deepEqual(await methods(host({}).io), { ok: false, kind: 'no-host' });
  assert.deepEqual(await methods(host({ '/auth/methods': () => new Response('nope', { status: 404 }) }).io), { ok: false, kind: 'no-host' });
  assert.deepEqual(await methods(host({ '/auth/methods': () => ok({ passkey: 'yes' }) }).io), { ok: false, kind: 'no-host' });
});

test('a socket that fails is unreachable, and so is a proxy whose host is down', async () => {
  const dead: Io = { fetch: () => Promise.reject(new TypeError('Failed to fetch')) };
  assert.deepEqual(await methods(dead), { ok: false, kind: 'unreachable' });
  assert.deepEqual(await methods(host({ '/auth/methods': () => new Response('', { status: 502 }) }).io), { ok: false, kind: 'unreachable' });
});

/* ── passkeys ────────────────────────────────────────────────────────────── */

test('A PASSKEY SIGN-IN turns base64url into bytes for the browser and bytes back into base64url for the host', async () => {
  const { credentials, given } = authenticator(() => ({
    id: 'cred-1',
    response: { clientDataJSON: buf(1, 2, 3), authenticatorData: buf(255, 254), signature: buf(0), userHandle: buf(112, 95, 48, 49) },
  }));
  const { io, seen } = host(
    {
      '/auth/passkey/assert/options': () => ok({ challenge: 'AQID', rpId: 'localhost', timeout: 300000, userVerification: 'preferred', allowCredentials: [] }),
      '/auth/passkey/assert': () => ok(WHO),
    },
    credentials,
  );
  const out = await passkeySignIn(io);
  assert.deepEqual(out, { ok: true, value: WHO });

  const asked = given.get[0] as { publicKey: { challenge: Uint8Array; rpId: string; allowCredentials: unknown[] } };
  assert.deepEqual([...asked.publicKey.challenge], [1, 2, 3]);
  assert.equal(asked.publicKey.rpId, 'localhost');
  assert.deepEqual(asked.publicKey.allowCredentials, [], 'an empty list is what lets a discoverable passkey answer');

  assert.deepEqual(seen.map((r) => `${r.method} ${r.url}`), ['POST /auth/passkey/assert/options', 'POST /auth/passkey/assert']);
  assert.deepEqual(seen[1]?.body, {
    credential: { id: 'cred-1', response: { clientDataJSON: 'AQID', authenticatorData: '__4', signature: 'AA', userHandle: 'cF8wMQ' } },
  });
  assert.equal(seen[1]?.headers['content-type'], 'application/json');
});

test('A CLOSED SHEET IS CANCELLED, not a failure, and nothing is sent after it', async () => {
  for (const answer of [() => Promise.reject(named('NotAllowedError')), () => Promise.reject(named('AbortError')), () => null]) {
    const { credentials } = authenticator(answer);
    const { io, seen } = host({ '/auth/passkey/assert/options': () => ok({ challenge: 'AQID' }) }, credentials);
    assert.deepEqual(await passkeySignIn(io), { ok: false, kind: 'cancelled' });
    assert.equal(seen.length, 1, 'an assertion was posted after the sheet was closed');
  }
});

test('no WebAuthn is unsupported, and the options are never asked for', async () => {
  const { io, seen } = host({ '/auth/passkey/assert/options': () => ok({ challenge: 'AQID' }) });
  assert.deepEqual(await passkeySignIn(io), { ok: false, kind: 'unsupported' });
  assert.equal(seen.length, 1);
});

test('a refused assertion carries the host sentence; a lockout carries its seconds, from the body or the header', async () => {
  const { credentials } = authenticator(() => ({
    id: 'c',
    response: { clientDataJSON: buf(1), authenticatorData: buf(1), signature: buf(1), userHandle: null },
  }));
  const refused = host({ '/auth/passkey/assert/options': () => ok({ challenge: 'AQ' }), '/auth/passkey/assert': () => no(401, 'That did not sign you in.') }, credentials);
  assert.deepEqual(await passkeySignIn(refused.io), { ok: false, kind: 'refused', fix: 'That did not sign you in.' });

  const body = host({ '/auth/passkey/assert/options': () => json(429, { retryAfter: 840 }) }, credentials);
  assert.deepEqual(await passkeySignIn(body.io), { ok: false, kind: 'locked', retryAfter: 840 });
  const header = host({ '/auth/passkey/assert/options': () => new Response('', { status: 429, headers: { 'retry-after': '61' } }) }, credentials);
  assert.deepEqual(await passkeySignIn(header.io), { ok: false, kind: 'locked', retryAfter: 61 });
  const bare = host({ '/auth/passkey/assert/options': () => new Response('', { status: 429 }) }, credentials);
  assert.deepEqual(await passkeySignIn(bare.io), { ok: false, kind: 'locked', retryAfter: 900 });

  const shut = host({ '/auth/passkey/assert/options': () => new Response('', { status: 503 }) }, credentials);
  assert.deepEqual(await passkeySignIn(shut.io), { ok: false, kind: 'closed' });
});

test('ADDING A PASSKEY hands the browser bytes for the challenge, the person and every key to exclude', async () => {
  const { credentials, given } = authenticator(() => ({ id: 'new', response: { clientDataJSON: buf(1), attestationObject: buf(2, 3) } }));
  const { io, seen } = host(
    {
      '/auth/passkey/register/options': () =>
        ok({
          challenge: 'AQID',
          rp: { id: 'localhost', name: 'BrainDog' },
          user: { id: 'cF8wMQ', name: 'ada@example.com', displayName: 'Ada' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          timeout: 300000,
          attestation: 'none',
          authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
          excludeCredentials: [{ type: 'public-key', id: '__4' }],
        }),
      '/auth/passkey/register': () => ok({ id: 'new', label: null, alg: -7, backedUp: true, createdAt: 5, lastUsed: null }),
    },
    credentials,
  );
  assert.deepEqual(await passkeyRegister(io), { ok: true, value: { id: 'new', label: null, backedUp: true, createdAt: 5, lastUsed: null } });

  const o = (given.create[0] as { publicKey: { challenge: Uint8Array; user: { id: Uint8Array; name: string }; excludeCredentials: { id: Uint8Array }[]; rp: { id: string } } }).publicKey;
  assert.deepEqual([...o.challenge], [1, 2, 3]);
  assert.deepEqual([...o.user.id], [112, 95, 48, 49]);
  assert.equal(o.user.name, 'ada@example.com');
  assert.deepEqual([...(o.excludeCredentials[0]?.id ?? [])], [255, 254]);
  assert.equal(o.rp.id, 'localhost');
  assert.deepEqual(seen[1]?.body, { credential: { id: 'new', response: { clientDataJSON: 'AQ', attestationObject: 'AgM' } } });
});

test('a device that already holds one is `exists`, and a malformed challenge is a refusal rather than a throw', async () => {
  const held = authenticator(() => Promise.reject(named('InvalidStateError')));
  const a = host({ '/auth/passkey/register/options': () => ok({ challenge: 'AQ', rp: { id: 'x', name: 'BrainDog' }, user: { id: 'AQ', name: 'a', displayName: 'a' }, pubKeyCredParams: [] }) }, held.credentials);
  assert.deepEqual(await passkeyRegister(a.io), { ok: false, kind: 'exists' });

  const any = authenticator(() => ({}));
  const b = host({ '/auth/passkey/register/options': () => ok({ challenge: 42 }) }, any.credentials);
  assert.deepEqual(await passkeyRegister(b.io), { ok: false, kind: 'refused', fix: null });
  assert.equal(any.given.create.length, 0, 'the browser was asked with options that could not be read');
});

/* ── the server key, links, and signing out ──────────────────────────────── */

test('THE SERVER KEY GOES IN ONE POST BODY, trimmed, and nowhere else', async () => {
  const key = 'k3Zq7Nl9xBvR2sTfW8yUcAe4Hj1MpDoQzL5aXgVn0iY';
  const { io, seen } = host({ '/auth/token': () => ok(WHO) });
  assert.deepEqual(await exchangeKey(`  ${key}\n`, io), { ok: true, value: WHO });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.method, 'POST');
  assert.deepEqual(seen[0]?.body, { serverKey: key });
  assert.ok(!seen[0]?.url.includes(key), 'the key is in the URL');
  assert.ok(!Object.values(seen[0]?.headers ?? {}).some((v) => v.includes(key)), 'the key is in a header');
});

test('an empty key is refused without a request', async () => {
  const { io, seen } = host({});
  assert.deepEqual(await exchangeKey('   ', io), { ok: false, kind: 'refused', fix: null });
  assert.equal(seen.length, 0);
});

test('a link is asked for by email and spent by its own name, magic or claim', async () => {
  const { io, seen } = host({ '/auth/magic/start': () => ok({}), '/auth/magic/redeem': () => ok(WHO) });
  assert.deepEqual(await requestLink(' ada@example.com ', null, io), { ok: true, value: null });
  assert.deepEqual(await redeemLink({ kind: 'magic', token: 'tok-1' }, io), { ok: true, value: WHO });
  assert.deepEqual(await redeemLink({ kind: 'claim', token: 'tok-2' }, io), { ok: true, value: WHO });
  assert.deepEqual(seen.map((r) => r.body), [{ email: 'ada@example.com' }, { linkToken: 'tok-1' }, { claimToken: 'tok-2' }]);
});

test('signing out, listing and removing passkeys', async () => {
  const { io, seen } = host({
    '/auth/logout': () => ok({}),
    '/auth/passkeys': () => ok([{ id: 'a', label: 'Laptop', backedUp: false, createdAt: 1, lastUsed: 2 }, { nope: true }]),
    '/auth/passkey/remove': () => ok({}),
  });
  assert.deepEqual(await signOut(io), { ok: true, value: null });
  assert.deepEqual(await passkeys(io), { ok: true, value: [{ id: 'a', label: 'Laptop', backedUp: false, createdAt: 1, lastUsed: 2 }] });
  assert.deepEqual(await removePasskey('a', io), { ok: true, value: null });
  assert.deepEqual(seen.map((r) => `${r.method} ${r.url}`), ['POST /auth/logout', 'GET /auth/passkeys', 'POST /auth/passkey/remove']);
  assert.deepEqual(seen[2]?.body, { id: 'a' });
});

/* ── the address, and the promises ───────────────────────────────────────── */

test('A LINK IN THE ADDRESS IS READ ONCE, and cleared before anything else can run', () => {
  const order: string[] = [];
  const link = takeLink('#magic=abc_DEF-123', () => order.push('cleared'));
  order.push('returned');
  assert.deepEqual(link, { kind: 'magic', token: 'abc_DEF-123' });
  assert.deepEqual(order, ['cleared', 'returned']);

  assert.deepEqual(takeLink('#claim=xyz', () => {}), { kind: 'claim', token: 'xyz' });
  let cleared = 0;
  assert.equal(takeLink('#main', () => cleared++), null);
  assert.equal(takeLink('', () => cleared++), null);
  assert.equal(cleared, 0, 'an ordinary fragment was taken off the address');
  assert.equal(takeLink('#magic=', () => cleared++), null, 'an empty token is not a link');
  assert.equal(cleared, 1, 'an empty link still leaves the address');
});

test('support asks for WebAuthn and a secure context, and both', () => {
  assert.deepEqual(support({}), { webauthn: false, secure: false });
  assert.deepEqual(support({ isSecureContext: true, PublicKeyCredential: function () {}, navigator: { credentials: {} } }), { webauthn: true, secure: true });
  assert.deepEqual(support({ isSecureContext: true, PublicKeyCredential: function () {}, navigator: {} }), { webauthn: false, secure: true });
});

test('NOTHING THROWS AND NOTHING LOGS, whatever comes back', async () => {
  const said: unknown[] = [];
  const kept = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const k of Object.keys(kept) as (keyof typeof kept)[]) console[k] = (...a: unknown[]) => void said.push(a);
  try {
    const broken: Io = { fetch: async () => ({ status: 200, ok: true, json: () => { throw new Error('boom'); } }) as unknown as Response };
    const weird = authenticator(() => Promise.reject('not even an error'));
    const mixed = host({ '/auth/passkey/assert/options': () => ok({ challenge: 'AQ' }) }, weird.credentials);
    const outs = await Promise.all([
      methods(broken),
      passkeySignIn(broken),
      passkeyRegister(broken),
      exchangeKey('k', broken),
      requestLink('a@b.c', null, broken),
      redeemLink({ kind: 'magic', token: 't' }, broken),
      signOut(broken),
      passkeys(broken),
      removePasskey('x', broken),
      passkeySignIn(mixed.io),
    ]);
    for (const out of outs) assert.equal(out.ok, false);
  } finally {
    Object.assign(console, kept);
  }
  assert.deepEqual(said, [], 'something was written to the console');
});
