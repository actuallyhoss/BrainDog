/**
 * Sign in with Google: the start, and every way the callback ends.
 *
 * THE PROPERTY THAT MATTERS IS WHO IS NOT LET IN. A callback without the cookie the start wrote, a token made for
 * another client, an address Google does not answer for and an address nobody here has all end on the sign-in page,
 * and none of them is handed a session.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthCall, AuthResult } from '@braindog/ports';

import { googleOn, serveGoogle, type GoogleDoor } from '../src/google.ts';

const ORIGIN = 'https://brain.dog';
const NOW = Date.UTC(2026, 9, 1, 12);
const CLIENT = 'client-1.apps.googleusercontent.com';
const LINK = 'L'.repeat(43);
const SID = 'S'.repeat(43);

const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (claims: object): string => `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;

type Over = { claims?: Record<string, unknown>; known?: boolean; tokenStatus?: number };

function door(o: Over = {}) {
  const asked: AuthCall[] = [];
  const sent: URLSearchParams[] = [];
  const d: GoogleDoor = {
    origin: ORIGIN,
    mode: 'secure',
    clientId: CLIENT,
    clientSecret: 'shh',
    ip: '203.0.113.9',
    now: () => NOW,
    ask: async (call): Promise<AuthResult> => {
      asked.push(call);
      if (call.flow === 'magic.start')
        return o.known === false ? { status: 200, body: {} } : { status: 200, body: {}, mail: { to: 'ada@gmail.com', linkToken: LINK } };
      return { status: 200, body: {}, session: { sid: SID } };
    },
    fetch: (async (_url: unknown, init?: { body?: unknown }) => {
      const form = init?.body as URLSearchParams;
      sent.push(form);
      /* THE NONCE COMES BACK AS GOOGLE WOULD SEND IT: the one the start put in the address, which the test read. */
      const claims = { iss: 'https://accounts.google.com', aud: CLIENT, exp: NOW / 1000 + 600, email: 'ada@gmail.com', email_verified: true, ...o.claims };
      return new Response(JSON.stringify({ id_token: idToken(claims) }), { status: o.tokenStatus ?? 200 });
    }) as unknown as typeof fetch,
  };
  return { d, asked, sent };
}

/** Run the start, and hand back what a browser would bring to the callback. */
async function started(d: GoogleDoor, next?: string) {
  const res = await serveGoogle(new Request(`${ORIGIN}/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`), '/auth/google/start', d);
  const to = new URL(res.headers.get('location') ?? '');
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  return { res, to, cookie, state: to.searchParams.get('state') ?? '', nonce: to.searchParams.get('nonce') ?? '' };
}

const back = (d: GoogleDoor, query: string, cookie: string) =>
  serveGoogle(new Request(`${ORIGIN}/auth/google/callback?${query}`, { headers: { cookie } }), '/auth/google/callback', d);

test('ON ONLY WITH BOTH HALVES of a client', () => {
  assert.equal(googleOn({}), false);
  assert.equal(googleOn({ GOOGLE_CLIENT_ID: CLIENT }), false);
  assert.equal(googleOn({ GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: ' ' }), false);
  assert.equal(googleOn({ GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'shh' }), true);
});

test('THE START SENDS THE BROWSER TO GOOGLE and keeps the state in a cookie no script can read', async () => {
  const { d } = door();
  const { res, to, cookie } = await started(d);
  assert.equal(res.status, 302);
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('client_id'), CLIENT);
  assert.equal(to.searchParams.get('redirect_uri'), `${ORIGIN}/auth/google/callback`);
  assert.equal(to.searchParams.get('scope'), 'openid email');
  assert.equal(to.searchParams.get('code_challenge_method'), 'S256');
  assert.match(cookie, /^__Host-bd_g=/);
  assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('AN ADDRESS SOMEBODY HAS IS SIGNED IN, through a link minted and spent on the spot', async () => {
  const first = door();
  const s = await started(first.d, '/app/work');
  const { d, asked, sent } = door({ claims: { nonce: s.nonce } });
  const res = await back(d, `code=abc&state=${s.state}`, s.cookie);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `${ORIGIN}/app/work`);
  const cookies = res.headers.getSetCookie();
  assert.ok(cookies.some((c) => c.startsWith('__Host-bd_g=; ') && c.includes('Max-Age=0')), 'the state cookie is cleared');
  assert.ok(cookies.some((c) => c.startsWith(`__Host-bd_s=${SID}; `)), 'the session cookie is set');
  assert.deepEqual(asked, [
    { flow: 'magic.start', email: 'ada@gmail.com', ip: '203.0.113.9' },
    { flow: 'magic.redeem', linkToken: LINK, ip: '203.0.113.9' },
  ]);
  assert.equal(sent[0]?.get('client_secret'), 'shh');
  assert.ok((sent[0]?.get('code_verifier') ?? '').length >= 43);
});

test('NOBODY IS LET IN ON A CALLBACK THE START DID NOT MAKE', async () => {
  const first = door();
  const s = await started(first.d);
  const ends = async (o: Over, query: string, cookie: string) => {
    const { d, asked } = door(o);
    const res = await back(d, query, cookie);
    assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith('__Host-bd_s=')), 'a session was set');
    return { to: new URL(res.headers.get('location') ?? ''), asked };
  };
  const good = { claims: { nonce: s.nonce } };

  /* No cookie, and another start's state. */
  assert.equal((await ends(good, `code=abc&state=${s.state}`, '')).to.searchParams.get('google'), 'failed');
  assert.equal((await ends(good, 'code=abc&state=other', s.cookie)).to.searchParams.get('google'), 'failed');
  /* Google said no, or the person closed its page. */
  assert.equal((await ends(good, `error=access_denied&state=${s.state}`, s.cookie)).to.searchParams.get('google'), 'cancelled');
  /* The token endpoint refused the code. */
  assert.equal((await ends({ ...good, tokenStatus: 400 }, `code=abc&state=${s.state}`, s.cookie)).to.searchParams.get('google'), 'failed');
  /* A token for another client, a stale one, and one from another start. */
  for (const claims of [{ aud: 'someone-else' }, { exp: NOW / 1000 - 1 }, { nonce: 'other' }, { iss: 'https://evil.example' }]) {
    const out = await ends({ claims: { nonce: s.nonce, ...claims } }, `code=abc&state=${s.state}`, s.cookie);
    assert.equal(out.to.searchParams.get('google'), 'failed');
    assert.deepEqual(out.asked, [], 'the Directory was asked');
  }
  /* An address Google does not answer for: unverified, or on a domain it does not host. */
  for (const claims of [{ email_verified: false }, { email: 'ada@example.com' }]) {
    const out = await ends({ claims: { nonce: s.nonce, ...claims } }, `code=abc&state=${s.state}`, s.cookie);
    assert.equal(out.to.searchParams.get('google'), 'unverified');
    assert.deepEqual(out.asked, []);
  }
  /* An address nobody here has. */
  const unknown = await ends({ ...good, known: false }, `code=abc&state=${s.state}`, s.cookie);
  assert.equal(unknown.to.pathname, '/app/signin');
  assert.equal(unknown.to.searchParams.get('google'), 'unknown');
  assert.equal(unknown.asked.length, 1);
});

test('A HOSTED DOMAIN IS TAKEN, and `next` never leaves the app', async () => {
  const first = door();
  const s = await started(first.d, 'https://evil.example/app/');
  const { d, asked } = door({ claims: { nonce: s.nonce, email: 'ada@example.com', hd: 'example.com' } });
  const res = await back(d, `code=abc&state=${s.state}`, s.cookie);
  assert.equal(res.headers.get('location'), `${ORIGIN}/app/`);
  assert.equal((asked[0] as { email?: string }).email, 'ada@example.com');
  const outside = await started(first.d, '/auth/provision');
  const landed = await back(door({ claims: { nonce: outside.nonce } }).d, `code=abc&state=${outside.state}`, outside.cookie);
  assert.equal(landed.headers.get('location'), `${ORIGIN}/app/`);
});
