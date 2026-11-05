/**
 * The readable `bd_in` cookie beside the session (`src/signed-in.ts`): `1` when the session is set, cleared when the
 * session is, and nothing else touched. It is readable by every script and every name under the site's, and it names no record.
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

test('a session set writes 1, whatever it redirects into and whatever the request held, with every attribute exact', () => {
  const line = 'bd_in=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax';
  const into = withSignedIn(answer(302, [['location', '/maya-okafor/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify'));
  assert.deepEqual(inOf(into), [line]);
  assert.equal(into.headers.getSetCookie().length, 2, 'the session cookie stays beside it');
  assert.equal(into.headers.get('location'), '/maya-okafor/');
  assert.equal(into.status, 302);
  /* A COOKIE THAT STILL NAMES A RECORD, from before 5 Nov, is replaced at the next rotation. */
  const rotated = withSignedIn(answer(200, [['set-cookie', sessionCookie(SID, 'secure')]]), ask('/tidepool/api/boot', `__Host-bd_s=${SID}; bd_in=tidepool`));
  assert.deepEqual(inOf(rotated), [line]);
});

test('GET / with a session and no rotation teaches the cookie nothing: no record is named to every name under the site', () => {
  const frozen = Response.redirect(`${ORIGIN}/ferment-co/`, 302);
  assert.equal(withSignedIn(frozen, ask('/', `__Host-bd_s=${SID}`)), frozen);
});

test('a cleared session clears bd_in, as sign-out and account close answer', () => {
  const out = withSignedIn(answer(200, [['set-cookie', clearCookie('secure')]]), ask('/auth/logout', `__Host-bd_s=${SID}; bd_in=tidepool`, 'POST'));
  assert.deepEqual(inOf(out), ['bd_in=; Path=/; Max-Age=0; Secure; SameSite=Lax']);
  /* A dead cookie answered by `GET /` with the shell and the cookie cleared is the same rule. */
  const shell = withSignedIn(answer(200, [['content-type', 'text/html'], ['set-cookie', clearCookie('secure')]]), ask('/', `__Host-bd_s=dead`));
  assert.deepEqual(inOf(shell), ['bd_in=; Path=/; Max-Age=0; Secure; SameSite=Lax']);
});

test('local mode writes and clears without Secure', () => {
  const set = withSignedIn(answer(302, [['location', '/maya/'], ['set-cookie', sessionCookie(SID, 'local')]]), ask('/auth/verify'));
  assert.deepEqual(inOf(set), ['bd_in=1; Path=/; Max-Age=2592000; SameSite=Lax']);
  const gone = withSignedIn(answer(200, [['set-cookie', clearCookie('local')]]), ask('/auth/logout'));
  assert.deepEqual(inOf(gone), ['bd_in=; Path=/; Max-Age=0; SameSite=Lax']);
});

test('it is never HttpOnly and never holds the session id or an email', () => {
  const answers = [
    withSignedIn(answer(302, [['location', '/maya/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify')),
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
    assert.equal(value, '1', 'it names no record');
  }
});

test('anything else is the answer itself, untouched', () => {
  const plain = answer(200, [['content-type', 'application/json']]);
  assert.equal(withSignedIn(plain, ask('/api/boot', `__Host-bd_s=${SID}`)), plain);
  const other = answer(200, [['set-cookie', 'bd_theme=dark; Path=/']]);
  assert.equal(withSignedIn(other, ask('/maya/')), other);
  const elsewhere = answer(302, [['location', '/maya/']]);
  assert.equal(withSignedIn(elsewhere, ask('/auth/verify')), elsewhere, 'a redirect with no session move and not GET /');
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

  const set = withSignedIn(answer(302, [['location', '/maya-okafor/'], ['set-cookie', sessionCookie(SID, 'secure')]]), ask('/auth/verify'), 'brain.dog');
  assert.deepEqual(inOf(set), ['bd_in=1; Path=/; Domain=brain.dog; Max-Age=2592000; Secure; SameSite=Lax']);
  const gone = withSignedIn(answer(200, [['set-cookie', clearCookie('secure')]]), ask('/auth/logout', 'bd_in=1', 'POST'), 'brain.dog');
  assert.deepEqual(inOf(gone), ['bd_in=; Path=/; Domain=brain.dog; Max-Age=0; Secure; SameSite=Lax']);
});
