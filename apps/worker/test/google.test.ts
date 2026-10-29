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
  const s = await started(first.d, '/work');
  const { d, asked, sent } = door({ claims: { nonce: s.nonce } });
  const res = await back(d, `code=abc&state=${s.state}`, s.cookie);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `${ORIGIN}/work`);
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
  assert.equal(unknown.to.pathname, '/signin');
  assert.equal(unknown.to.searchParams.get('google'), 'unknown');
  assert.equal(unknown.asked.length, 1);
});

test('A HOSTED DOMAIN IS TAKEN, and `next` never leaves the app', async () => {
  const first = door();
  const s = await started(first.d, 'https://evil.example/app/');
  const { d, asked } = door({ claims: { nonce: s.nonce, email: 'ada@example.com', hd: 'example.com' } });
  const res = await back(d, `code=abc&state=${s.state}`, s.cookie);
  assert.equal(res.headers.get('location'), `${ORIGIN}/`);
  assert.equal((asked[0] as { email?: string }).email, 'ada@example.com');
  const outside = await started(first.d, '/auth/provision');
  const landed = await back(door({ claims: { nonce: outside.nonce } }).d, `code=abc&state=${outside.state}`, outside.cookie);
  assert.equal(landed.headers.get('location'), `${ORIGIN}/`);
  /* A `next` FROM BEFORE THE APP MOVED TO THE ROOT lands on the page it names now, and never on the old address. */
  const old = await started(first.d, '/app/work');
  const moved = await back(door({ claims: { nonce: old.nonce } }).d, `code=abc&state=${old.state}`, old.cookie);
  assert.equal(moved.headers.get('location'), `${ORIGIN}/work`);
});

test('A NEW ADDRESS THROUGH GOOGLE MAKES NOBODY, against a real Directory: sign-up is the only door that makes a person', async () => {
  /* WHATEVER `SIGNUP` SAYS: Google is answered by `signIn()`, which never reads it, so closed and by invitation are this
     case too. Sign-up's switch, its code and its strikes are on `/auth/signup/start` alone. */
  const { createDirectory } = await import('@braindog/record/directory');
  const { openSqlite } = await import('../../../packages/kernel/test/sqlite.ts');
  const sql = openSqlite();
  const directory = createDirectory(sql, { now: () => NOW }, { mac: new Uint8Array(32).fill(5), magic: true });
  const people = () => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_person')?.n;
  const first = door();
  const s = await started(first.d);
  const { d } = door({ claims: { nonce: s.nonce, email: 'stranger@gmail.com' } });
  const real: GoogleDoor = { ...d, ask: (call) => directory.auth(call) as Promise<AuthResult> };
  const res = await back(real, `code=abc&state=${s.state}`, s.cookie);
  assert.equal(new URL(res.headers.get('location') ?? '').searchParams.get('google'), 'unknown');
  assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith('__Host-bd_s=')), 'a session was set');
  assert.equal(people(), 0, 'Google made a person');
});

/* THE MAC APP'S FLAVOUR: the callback hands a sealed code to braindog:// and sets no cookie; the window swaps it. */
import { createHash } from 'node:crypto';

const SECRET = 'k'.repeat(40);
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

async function desktopStart(d: GoogleDoor) {
  const res = await serveGoogle(new Request(`${ORIGIN}/auth/google/start?desktop=1&challenge=${CHALLENGE}`), '/auth/google/start', d);
  const to = new URL(res.headers.get('location') ?? '');
  return { res, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', state: to.searchParams.get('state') ?? '', nonce: to.searchParams.get('nonce') ?? '' };
}

const swap = (d: GoogleDoor, body: unknown, origin = ORIGIN) =>
  serveGoogle(
    new Request(`${ORIGIN}/auth/google/desktop`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }),
    '/auth/google/desktop',
    d,
  );

async function handedCode() {
  const { d: first } = door();
  first.secret = SECRET;
  const s = await desktopStart(first);
  const { d, asked } = door({ claims: { nonce: s.nonce } });
  d.secret = SECRET;
  const res = await back(d, `code=abc&state=${s.state}`, s.cookie);
  return { res, asked, d, code: new URL(res.headers.get('location') ?? 'x:').searchParams.get('code') ?? '' };
}

test('THE DESKTOP CALLBACK SENDS A CODE TO THE APP AND SPENDS NOTHING', async () => {
  const { res, asked } = await handedCode();
  assert.match(res.headers.get('location') ?? '', /^braindog:\/\/auth\?code=[^.]+\.[^.]+\.\d+\.[^.]+$/);
  assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith('__Host-bd_s=')), 'a session cookie was set in the browser');
  assert.ok(!(res.headers.get('location') ?? '').includes(SID), 'a session token is in the address');
  assert.deepEqual(asked.map((c) => c.flow), ['magic.start'], 'the link was spent in the browser');
});

test('THE WINDOW SWAPS THE CODE FOR THE COOKIE, with the verifier that made the challenge', async () => {
  const { d, code, asked } = await handedCode();
  const ok = await swap(d, { code, verifier: VERIFIER });
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.getSetCookie().some((c) => c.startsWith(`__Host-bd_s=${SID}; `)));
  assert.deepEqual(asked.at(-1), { flow: 'magic.redeem', linkToken: LINK, ip: '203.0.113.9' });
});

test('NO PART OF A CODE IS THE LINK, which is a sign-in on its own without the verifier', async () => {
  const { code, res } = await handedCode();
  const location = res.headers.get('location') ?? '';
  assert.ok(!location.includes(LINK), 'the link token travels readable in the address');
  for (const part of code.split('.')) assert.notEqual(part, LINK, 'a segment of the code is the link token');
});

test('A CODE IS REFUSED with another verifier, another origin, a forged seal or after two minutes', async () => {
  const { d, code } = await handedCode();
  const refused = async (res: Response) => {
    assert.notEqual(res.status, 200);
    assert.equal(res.headers.getSetCookie().length, 0);
  };
  await refused(await swap(d, { code, verifier: 'w'.repeat(43) }));
  await refused(await swap(d, { code, verifier: VERIFIER }, 'https://evil.example'));
  const [link, , exp] = code.split('.');
  await refused(await swap(d, { code: `${link}.${createHash('sha256').update('w'.repeat(43)).digest('base64url')}.${exp}.${code.split('.')[3]}`, verifier: 'w'.repeat(43) }));
  d.now = () => NOW + 121_000;
  await refused(await swap(d, { code, verifier: VERIFIER }));
});

test('THE DESKTOP START NEEDS A CHALLENGE and a secret to seal with', async () => {
  const { d } = door();
  d.secret = SECRET;
  const bad = await serveGoogle(new Request(`${ORIGIN}/auth/google/start?desktop=1&challenge=short`), '/auth/google/start', d);
  assert.equal(new URL(bad.headers.get('location') ?? '').searchParams.get('google'), 'failed');
  d.secret = '';
  const none = await serveGoogle(new Request(`${ORIGIN}/auth/google/start?desktop=1&challenge=${CHALLENGE}`), '/auth/google/start', d);
  assert.equal(new URL(none.headers.get('location') ?? '').searchParams.get('google'), 'failed');
});
