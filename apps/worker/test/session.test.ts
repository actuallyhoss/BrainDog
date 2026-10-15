/**
 * The Worker's doors, in order: a bearer, the session cookie, and nothing.
 *
 * THE ONE PROPERTY THAT MATTERS MOST IS THE NEGATIVE ONE. A cookie that names no session is a 401 that clears
 * it: somebody who thinks they are signed in is never let through on a session that is gone. And a request that
 * presents nothing is a 401 as well, at the root and under a slug, because there is no public record behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult, Who } from '@braindog/ports';
import { createDirectory } from '@braindog/record/directory';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { bearerOf, doorOf, withCookie, type BearerDeps, type Deps, type Held } from '../src/session.ts';

const ORIGIN = 'https://app.brain.dog';
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

test('A COOKIE THAT NAMES NO SESSION IS A 401 THAT CLEARS IT, even for a read', async () => {
  const dead = deps({ session: { status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' }, session: 'clear' } });
  assert.deepEqual(await doorOf(at('/api/boot', { headers: cookie }), dead.d), {
    door: 'refused',
    status: 401,
    /* THE ONE 401 BODY (LCH-C08 job 2): the Directory's sentence goes to the log, never to the caller. */
    refusal: { code: 'UNAUTHORIZED', fix: 'unauthorized' },
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

test('NOTHING PRESENTED IS THE ORDINARY 401, for a read and for anything else', async () => {
  const { d, asked } = deps();
  assert.deepEqual(await doorOf(at('/api/boot'), d), { door: 'refused', status: 401 });
  assert.deepEqual(await doorOf(at('/api/create', { method: 'POST', body: '{}' }), d), { door: 'refused', status: 401 });
  assert.deepEqual(asked, [], 'the Directory was asked about a request with no cookie');
});

/* ── a request that names its record: /app/<slug>/api/… ─────────────── */

const DIR_NOW = Date.UTC(2026, 8, 23, 9);
const serverKey = 'a-throwaway-server-key-for-these-tests-only';

/**
 * A real Directory, because the check under test is its SQL: a live slug, an open record, a `dir_member` row. A fake
 * `session` here would test that the fake refuses what it was told to refuse.
 */
async function named() {
  const d = createDirectory(openSqlite(), fixedClock(DIR_NOW), { mac: new Uint8Array(32).fill(7), magic: false, key: { serverKey } });
  const ada = d.person$('ada@example.com', 'Ada');
  assert.ok(ada.ok);
  const acme = d.provision({ slug: 'acme', email: 'ada@example.com' });
  const home = d.provision({ slug: 'ada-at-home', email: 'ada@example.com' });
  assert.ok(acme.ok && home.ok);
  const signed = await d.auth({ flow: 'key.exchange', serverKey, ip: '203.0.113.9' });
  assert.ok(signed.status === 200 && signed.session && signed.session !== 'clear');
  const bob = d.person$('bob@example.com', 'Bob');
  assert.ok(bob.ok);
  const bobs = d.provision({ slug: 'bobs-books', email: 'bob@example.com' });
  assert.ok(bobs.ok);
  const accessed: string[] = [];
  const deps: Deps = {
    origin: ORIGIN,
    session: (sid, slug) => d.auth({ flow: 'session', sid, ...(slug === undefined ? {} : { slug }) }) as Promise<AuthResult<Who>>,
    access: async (record) => (accessed.push(record), OWNER),
  };
  return { deps, accessed, sid: signed.session.sid, acme: acme.value.record, home: home.value.record, bobs: bobs.value.record };
}

test('A COOKIE UNDER A SLUG IS THAT RECORD FOR A MEMBER, whichever record the session row was left on', async () => {
  const { deps, accessed, sid, home } = await named();
  const door = await doorOf(at('/api/boot', { headers: { cookie: `__Host-bd_s=${sid}` } }), deps, 'ada-at-home');
  assert.equal(door.door, 'session');
  assert.equal(door.door === 'session' ? door.record : '', home);
  /* AND THE RECORD STILL HAS THE LAST WORD on what they may do inside it. */
  assert.deepEqual(accessed, [home]);
});

test('A SLUG THAT IS NOT THEIRS AND ONE NOBODY HOLDS ARE THE SAME 403, AND THE RECORD IS NEVER ADDRESSED', async () => {
  const { deps, accessed, sid } = await named();
  const NOT_ON = { code: 'FORBIDDEN', fix: 'You are not on this record.' };
  const bodies: unknown[] = [];
  for (const slug of ['bobs-books', 'nobody-has-this', 'd41']) {
    const door = await doorOf(at('/api/boot', { headers: { cookie: `__Host-bd_s=${sid}` } }), deps, slug);
    assert.equal(door.door === 'refused' ? door.status : 0, 403, slug);
    bodies.push(door.door === 'refused' ? door.refusal : null);
  }
  assert.deepEqual(bodies, [NOT_ON, NOT_ON, NOT_ON], 'a name that exists answered differently from one that does not');
  /* `idFromName` ON A NAME NOBODY HAS CREATES THE OBJECT, so a refused slug that still reached `access` would be a
     signed-in stranger minting empty records, or waking somebody else's. */
  assert.deepEqual(accessed, [], 'a record was addressed for a slug the Directory refused');
});

test('NOTHING PRESENTED IS 401 AT THE ROOT AND UNDER A SLUG, and the Directory is not asked either way', async () => {
  const { d, asked } = deps();
  assert.deepEqual(await doorOf(at('/api/boot'), d, 'acme'), { door: 'refused', status: 401 });
  assert.deepEqual(await doorOf(at('/api/boot'), d, null), { door: 'refused', status: 401 });
  assert.deepEqual(asked, [], 'the Directory was asked about a request with no cookie');
});

test('A BEARER FOR ONE RECORD UNDER ANOTHER RECORD’S SLUG IS 403, AND NOTHING IS PICKED FOR IT', async () => {
  const X = 'rec_01J8ZC0000000000000000000X';
  const Y = 'rec_01J8ZC0000000000000000000Y';
  const accessed: string[] = [];
  const bearer: BearerDeps = {
    knows: async () => true,
    verify: async () => ({ id: 'tok_1', person_id: 'p_1', scope: 'read' }),
    access: async (record) => (accessed.push(record), OWNER),
    named: async (slug) => ({ 'x-studio': X, 'y-studio': Y })[slug] ?? null,
  };
  const request = at('/api/boot', { headers: { authorization: `Bearer ${X}.secret` } });
  const crossed = await bearerOf(request, 'api', bearer, 'y-studio');
  assert.deepEqual(crossed, { status: 403, refusal: { code: 'FORBIDDEN', fix: 'This token is for a different record than the one this address names.', at: 'slug' } });
  const nameless = await bearerOf(request, 'api', bearer, 'nobody-has-this');
  assert.equal('status' in nameless ? nameless.status : 0, 403);
  assert.deepEqual(accessed, [], 'a record was asked about a bearer whose path named another');
  /* ITS OWN SLUG IS ITS OWN RECORD, and no slug is the bearer's record as it always was. */
  const own = await bearerOf(request, 'api', bearer, 'x-studio');
  assert.equal('record' in own ? own.record : '', X);
  const root = await bearerOf(request, 'api', bearer);
  assert.equal('record' in root ? root.record : '', X);
  /* AND A BEARER NOBODY ISSUED IS THE SAME 401 WHATEVER SLUG IT CAME UNDER, so the slug says nothing to a stranger. */
  const forged = await bearerOf(request, 'api', { ...bearer, verify: async () => null }, 'y-studio');
  assert.deepEqual(forged, { status: 401 });
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
