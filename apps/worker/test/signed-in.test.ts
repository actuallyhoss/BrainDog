/**
 * The readable `bd_in` cookie beside the session (`src/signed-in.ts`): set when the session is set,
 * taught the record's address by `GET /app`, cleared when the session is, and nothing else touched.
 *
 * THE ANSWERS ARE THE HOST'S OWN COOKIES, from `sessionCookie` and `clearCookie`, so a change to how the session is
 * written is a change these tests see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearCookie, sessionCookie } from '@braindog/host/auth';

import { SIGNED_IN, cookieDomain, withSignedIn } from '../src/signed-in.ts';

const SID = 'sid_7b1f0c2e9a4d4e1b8c3a5f6d2e0b9a71';
const ORIGIN = 'https://brain.dog';

const ask = (path: string, cookie?: string, method = 'GET'): Request =>
  new Request(`${ORIGIN}${path}`, { method, headers: cookie === undefined ? {} : { cookie } });

const answer = (status: number, headers: [string, string][]): Response => {
  const h = new Headers();
  for (const [k, v] of headers) h.append(k, v);
  return new Response(status === 302 ? null : '{}', { status, headers: h });
};

const inOf = (r: Response): string[] => r.headers.getSetCookie().filter((c) => c.startsWith(`${SIGNED_IN}=`));

test('the name is bd_in', () => {
  assert.equal(SIGNED_IN, 'bd_in');
});

test('a session set with a redirect into a record writes that address, with every attribute exact', () => {
  const out = withSignedIn(answer(302, [['location', '/app/maya-okafor/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify'));
  assert.deepEqual(inOf(out), ['bd_in=maya-okafor; Path=/; Max-Age=2592000; Secure; SameSite=Lax']);
  assert.equal(out.headers.getSetCookie().length, 2, 'the session cookie stays beside it');
  assert.equal(out.headers.get('location'), '/app/maya-okafor/');
  assert.equal(out.status, 302);
});

test('an absolute redirect into a record is read the same way', () => {
  const out = withSignedIn(answer(303, [['location', 'https://brain.dog/app/tidepool/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/google/callback'));
  assert.deepEqual(inOf(out), ['bd_in=tidepool; Path=/; Max-Age=2592000; Secure; SameSite=Lax']);
});

test('a session set with no redirect keeps the address the request already holds, else 1', () => {
  const rotated = () => answer(200, [['set-cookie', sessionCookie(SID, 'secure')]]);
  assert.deepEqual(inOf(withSignedIn(rotated(), ask('/app/tidepool/api/boot', `__Host-bd_s=${SID}; bd_in=tidepool`))), ['bd_in=tidepool; Path=/; Max-Age=2592000; Secure; SameSite=Lax']);
  assert.deepEqual(inOf(withSignedIn(rotated(), ask('/auth/passkey/finish'))), ['bd_in=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax']);
  /* A redirect to the start page is no record, so the held address or 1 is what is written. */
  const start = answer(302, [['location', '/app/start'], ['set-cookie', sessionCookie(SID, 'secure')]]);
  assert.deepEqual(inOf(withSignedIn(start, ask('/auth/verify'))), ['bd_in=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax']);
});

test('an address is only lower-case letters, digits and dashes, up to 64; anything else is 1', () => {
  const bad = ['Maya', 'a%20b', 'a.b', 'x'.repeat(65), 'a_b'];
  for (const held of bad) {
    const out = withSignedIn(answer(200, [['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify', `bd_in=${held}`));
    assert.deepEqual(inOf(out), ['bd_in=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax'], held);
  }
  const shouting = withSignedIn(answer(302, [['location', '/app/MAYA/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify'));
  assert.deepEqual(inOf(shouting), ['bd_in=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax']);
  const longest = 'a'.repeat(64);
  const fits = withSignedIn(answer(302, [['location', `/app/${longest}/`], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify'));
  assert.deepEqual(inOf(fits), [`bd_in=${longest}; Path=/; Max-Age=2592000; Secure; SameSite=Lax`]);
});

test('GET /app with a session and no rotation teaches the cookie the address, even through frozen headers', () => {
  /* `Response.redirect` answers with immutable headers, as a fetched or asset answer does. */
  const frozen = Response.redirect(`${ORIGIN}/app/ferment-co/`, 302);
  assert.throws(() => frozen.headers.append('x-test', '1'));
  const out = withSignedIn(frozen, ask('/app', `__Host-bd_s=${SID}`));
  assert.deepEqual(inOf(out), ['bd_in=ferment-co; Path=/; Max-Age=2592000; Secure; SameSite=Lax']);
  assert.equal(out.headers.get('location'), `${ORIGIN}/app/ferment-co/`);
  assert.deepEqual(inOf(withSignedIn(answer(302, [['location', '/app/northbound/']]), ask('/app/', `__Host-bd_s=${SID}`))), [
    'bd_in=northbound; Path=/; Max-Age=2592000; Secure; SameSite=Lax',
  ]);
});

test('GET /app without a session, another method or another path adds nothing', () => {
  const into = () => answer(302, [['location', '/app/pocketlab/']]);
  for (const [request, why] of [
    [ask('/app'), 'no session'],
    [ask('/app', `__Host-bd_s=${SID}`, 'POST'), 'a POST'],
    [ask('/app/settings', `__Host-bd_s=${SID}`), 'another path'],
  ] as const) {
    const given = into();
    assert.equal(withSignedIn(given, request), given, why);
  }
});

test('a cleared session clears bd_in, as sign-out and account close answer', () => {
  const out = withSignedIn(answer(200, [['set-cookie', clearCookie('secure')]]), ask('/auth/logout', `__Host-bd_s=${SID}; bd_in=tidepool`, 'POST'));
  assert.deepEqual(inOf(out), ['bd_in=; Path=/; Max-Age=0; Secure; SameSite=Lax']);
  /* A dead cookie answered by `GET /app` with the shell and the cookie cleared is the same rule. */
  const shell = withSignedIn(answer(200, [['content-type', 'text/html'], ['set-cookie', clearCookie('secure')]]), ask('/app', `__Host-bd_s=dead`));
  assert.deepEqual(inOf(shell), ['bd_in=; Path=/; Max-Age=0; Secure; SameSite=Lax']);
});

test('local mode writes and clears without Secure', () => {
  const set = withSignedIn(answer(302, [['location', '/app/maya/'], ['set-cookie', sessionCookie(SID, 'local')]]), ask('/auth/verify'));
  assert.deepEqual(inOf(set), ['bd_in=maya; Path=/; Max-Age=2592000; SameSite=Lax']);
  const gone = withSignedIn(answer(200, [['set-cookie', clearCookie('local')]]), ask('/auth/logout'));
  assert.deepEqual(inOf(gone), ['bd_in=; Path=/; Max-Age=0; SameSite=Lax']);
  const learnt = withSignedIn(answer(302, [['location', '/app/maya/']]), new Request('http://localhost:8787/app', { headers: { cookie: `bd_s=${SID}` } }));
  assert.deepEqual(inOf(learnt), ['bd_in=maya; Path=/; Max-Age=2592000; SameSite=Lax']);
});

test('it is never HttpOnly and never holds the session id or an email', () => {
  const answers = [
    withSignedIn(answer(302, [['location', '/app/maya/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify')),
    withSignedIn(answer(200, [['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify', `bd_in=${SID}`)),
    withSignedIn(answer(200, [['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify', 'bd_in=maya@tidepool.test')),
  ];
  for (const out of answers) {
    const [cookie] = inOf(out);
    assert.ok(cookie !== undefined);
    assert.doesNotMatch(cookie, /HttpOnly/i);
    const value = cookie.slice('bd_in='.length).split(';')[0];
    assert.notEqual(value, SID);
    assert.ok(!cookie.includes(SID), cookie);
    assert.ok(!cookie.includes('@'), cookie);
  }
});

test('anything else is the answer itself, untouched', () => {
  const plain = answer(200, [['content-type', 'application/json']]);
  assert.equal(withSignedIn(plain, ask('/api/boot', `__Host-bd_s=${SID}`)), plain);
  const other = answer(200, [['set-cookie', 'bd_theme=dark; Path=/']]);
  assert.equal(withSignedIn(other, ask('/app/maya/')), other);
  const elsewhere = answer(302, [['location', '/app/maya/']]);
  assert.equal(withSignedIn(elsewhere, ask('/auth/verify')), elsewhere, 'a redirect with no session move and not GET /app');
});

test('a 101 and an answer holding a WebSocket pass through, whatever they carry', () => {
  /* Node will not construct a 101, so it is the shape workerd hands the entry. */
  const upgrade = { status: 101, headers: new Headers([['set-cookie', sessionCookie(SID, 'secure')]]), webSocket: {} } as unknown as Response;
  assert.equal(withSignedIn(upgrade, ask('/mcp', `__Host-bd_s=${SID}`)), upgrade);
  const socket = answer(200, [['set-cookie', clearCookie('secure')]]);
  Object.defineProperty(socket, 'webSocket', { value: {} });
  assert.equal(withSignedIn(socket, ask('/mcp')), socket);
});

/* THE APP ON A SUBDOMAIN OF THE SITE'S NAME: the cookie is written for the parent, so `brain.dog` reads what
   `app.brain.dog` set, and cleared for the same parent, or the browser keeps it. */
test('on a subdomain of the parent the cookie carries the parent Domain, set and cleared alike', () => {
  assert.equal(cookieDomain('app.brain.dog', 'brain.dog'), 'brain.dog');
  assert.equal(cookieDomain('app.alpha.brain.dog', 'alpha.brain.dog'), 'alpha.brain.dog');
  assert.equal(cookieDomain('brain.dog', 'brain.dog'), null, 'the host itself keeps a host-only cookie');
  assert.equal(cookieDomain('app.brain.dog', undefined), null);
  assert.equal(cookieDomain('app.brain.dog', ''), null);
  assert.equal(cookieDomain('evilbrain.dog', 'brain.dog'), null);
  assert.equal(cookieDomain('localhost', 'localhost'), null);

  const set = withSignedIn(answer(302, [['location', '/app/maya-okafor/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify'), 'brain.dog');
  assert.deepEqual(inOf(set), ['bd_in=maya-okafor; Path=/; Domain=brain.dog; Max-Age=2592000; Secure; SameSite=Lax']);
  const gone = withSignedIn(answer(200, [['set-cookie', clearCookie('secure')]]), ask('/auth/logout', 'bd_in=1', 'POST'), 'brain.dog');
  assert.deepEqual(inOf(gone), ['bd_in=; Path=/; Domain=brain.dog; Max-Age=0; Secure; SameSite=Lax']);
});
