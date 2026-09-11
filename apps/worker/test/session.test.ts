/**
 * The Worker's doors, in order: a bearer, the session cookie, the public demo, and nothing.
 *
 * THE ONE PROPERTY THAT MATTERS MOST IS THE NEGATIVE ONE. A cookie that names no session is a 401 that clears
 * it, even on the one request the demo would otherwise answer: somebody who thinks they are signed in and is
 * shown the sample is being shown somebody else's numbers as their own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult, Who } from '@braindog/ports';

import { doorOf, withCookie, type Deps, type Held } from '../src/session.ts';

const ORIGIN = 'https://app.brain.dog';
const PINNED = 'rec_01J8ZC0000000000000000000A';
const MINE = 'rec_01J8ZC0000000000000000000B';
const SID = 'S'.repeat(43);
const NOW = Date.UTC(2026, 8, 5, 12);
const WHO: Who = { person: 'p_1', email: 'ada@example.com', record: MINE, provedAt: NOW };
const OWNER: Held = { level: 'owner', registers: null, levels: {} };
const CLEAR = '__Host-bd_s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

function deps(o: { session?: AuthResult<Who>; held?: Held | null } = {}) {
  const asked: string[] = [];
  const d: Deps = {
    origin: ORIGIN,
    demo: PINNED,
    session: async () => (asked.push('session'), o.session ?? { status: 200, body: WHO }),
    access: async (record) => (asked.push(`access ${record}`), o.held === undefined ? OWNER : o.held),
  };
  return { d, asked };
}

const at = (path: string, init: RequestInit = {}) => new Request(`${ORIGIN}${path}`, init);
const cookie = { cookie: `__Host-bd_s=${SID}` };

test('A BEARER IS THE BEARER\'S DOOR, a cookie beside it is not read, and an empty header is still a header', async () => {
  const { d, asked } = deps();
  assert.deepEqual(await doorOf(at('/api/boot', { headers: { authorization: 'Bearer rec_x.y', ...cookie } }), d), { door: 'bearer' });
  assert.deepEqual(await doorOf(at('/api/boot', { headers: { authorization: '' } }), d), { door: 'bearer' });
  assert.deepEqual(asked, [], 'the Directory was asked about a bearer request');
});

test('A LIVE COOKIE IS THE PERSON, on the record their session names, with the proof time and the rotation', async () => {
  const { d, asked } = deps({ session: { status: 200, body: WHO, session: { sid: 'R'.repeat(43) } } });
  const door = await doorOf(at('/api/boot', { headers: cookie }), d);
  assert.deepEqual(door, {
    door: 'session',
    record: MINE,
    ctx: { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW },
    cookie: `__Host-bd_s=${'R'.repeat(43)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
  });
  assert.deepEqual(asked, ['session', `access ${MINE}`]);
});

test('A COOKIE THAT NAMES NO SESSION IS A 401 THAT CLEARS IT, NEVER THE DEMO, even for the read the demo serves', async () => {
  const dead = deps({ session: { status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' }, session: 'clear' } });
  assert.deepEqual(await doorOf(at('/api/boot', { headers: cookie }), dead.d), {
    door: 'refused',
    status: 401,
    refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' },
    cookie: CLEAR,
  });
  /* SIGN-IN SWITCHED OFF (no `SESSION_SECRET`) answers the session flow 404, and that is the same 401. */
  const off = deps({ session: { status: 404, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' } } });
  const door = await doorOf(at('/api/boot', { headers: cookie }), off.d);
  assert.equal(door.door, 'refused');
  assert.equal(door.door === 'refused' ? door.status : 0, 401);
  assert.equal(door.door === 'refused' ? door.cookie : '', CLEAR);
});

test('the lockout and a failed store pass through as themselves', async () => {
  assert.deepEqual(await doorOf(at('/api/boot', { headers: cookie }), deps({ session: { status: 429, retryAfter: 60 } }).d), { door: 'refused', status: 429, retryAfter: 60 });
  assert.deepEqual(await doorOf(at('/api/boot', { headers: cookie }), deps({ session: { status: 503 } }).d), { door: 'refused', status: 503 });
});

test('A COOKIE WRITE FROM A PAGE ELSEWHERE IS 403, and one from this origin is the person', async () => {
  const { d } = deps();
  const post = (headers: Record<string, string>) => at('/api/create', { method: 'POST', headers: { ...cookie, 'content-type': 'application/json', ...headers }, body: '{}' });
  const foreign = await doorOf(post({ origin: 'https://evil.example' }), d);
  assert.equal(foreign.door === 'refused' ? foreign.status : 0, 403);
  assert.equal((await doorOf(post({}), d)).door, 'refused', 'a cookie write with no origin at all was let through');
  assert.equal((await doorOf(post({ origin: ORIGIN }), d)).door, 'session');
});

test('somebody signed in and no longer on the record is 403, and so is somebody on none yet', async () => {
  const gone = await doorOf(at('/api/boot', { headers: cookie }), deps({ held: null }).d);
  assert.equal(gone.door === 'refused' ? gone.status : 0, 403);
  const none = await doorOf(at('/api/boot', { headers: cookie }), deps({ session: { status: 200, body: { ...WHO, record: null } } }).d);
  assert.equal(none.door === 'refused' ? none.status : 0, 403);
});

test('NOTHING PRESENTED: the demo for a read, and the ordinary 401 for anything else', async () => {
  const { d, asked } = deps();
  const demo = await doorOf(at('/api/boot'), d);
  assert.equal(demo.door, 'demo');
  assert.equal(demo.door === 'demo' ? demo.record : '', PINNED);
  assert.deepEqual(await doorOf(at('/api/create', { method: 'POST', body: '{}' }), d), { door: 'refused', status: 401 });
  assert.deepEqual(await doorOf(at('/api/boot'), { ...d, demo: undefined }), { door: 'refused', status: 401 });
  assert.deepEqual(asked, [], 'the Directory was asked about a request with no cookie');
});

test('withCookie adds the cookie and changes nothing else', async () => {
  const inner = new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const out = withCookie(inner, CLEAR);
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.deepEqual(out.headers.getSetCookie(), [CLEAR]);
  assert.equal(await out.text(), '{"ok":true}');
  const same = new Response('x');
  assert.equal(withCookie(same, undefined), same);
});
