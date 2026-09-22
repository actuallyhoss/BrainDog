/**
 * The app under `/app`, on the one domain: which path names a record, where the old host sends a page load, and what
 * bare `/app` opens (`loop/research-one-domain.md` §2.4, §2.5 and §3.1).
 *
 * THE FIRST SEGMENT AFTER `/app/` IS A PAGE OR A RECORD'S NAME, AND NOTHING ELSE DECIDES WHICH. `appPath` asks the
 * Directory's own `badSlug`, so `/app/settings` is always the page and `/app/acme` is always acme; a second list here
 * would be a second answer. What comes back as the slug is only ever a claim: `session.ts` has the Directory say
 * whether it is this person's before any record is addressed, and `session.test.ts` holds that half.
 *
 * `src/index.ts` IMPORTS `cloudflare:workers` AND CANNOT BE LOADED BY `node --test`, so the decisions are functions in
 * `route.ts` and `session.ts`, and the lines in `index.ts` that use them are read as text at the end.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AuthResult, Who } from '@braindog/ports';

import { assetsReader, type Assets } from '../src/catalogue.ts';
import { appPath, atRoot, legacyRedirect } from '../src/route.ts';
import { appEntry, type EntryDeps } from '../src/session.ts';

const SOURCE = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');

/* ── which path names a record ────────────────────────────────────────── */

test('A SLUG AFTER /app/ IS THE RECORD, A WORD THE APP ROUTES IS ITS PAGE, AND THE BUILD’S OWN CHUNKS ARE NEITHER', () => {
  assert.deepEqual(appPath('/app/acme/api/boot'), { slug: 'acme', rest: '/api/boot' });
  assert.deepEqual(appPath('/app/acme/r/tasks/12'), { slug: 'acme', rest: '/r/tasks/12' });
  assert.deepEqual(appPath('/app/acme'), { slug: 'acme', rest: '/' });
  assert.deepEqual(appPath('/app/acme/'), { slug: 'acme', rest: '/' });
  /* NO SLUG IS "THE RECORD MY SESSION IS ON", which is where the old host's redirects land, since a redirect cannot know one. */
  assert.deepEqual(appPath('/app/r/tasks'), { slug: null, rest: '/r/tasks' });
  assert.deepEqual(appPath('/app/settings/agents'), { slug: null, rest: '/settings/agents' });
  assert.deepEqual(appPath('/app/signin'), { slug: null, rest: '/signin' });
  assert.deepEqual(appPath('/app/catalogue/index.json'), { slug: null, rest: '/catalogue/index.json' });
  assert.deepEqual(appPath('/app'), { slug: null, rest: '/' });
  assert.deepEqual(appPath('/app/'), { slug: null, rest: '/' });
  /* `/app/d41` IS DECISION 41 and never a record called `d41`, which the Directory now refuses to hand out. */
  assert.deepEqual(appPath('/app/d41'), { slug: null, rest: '/d41' });
  assert.deepEqual(appPath('/app/SG31'), { slug: null, rest: '/SG31' });
  /* A FILE BESIDE THE PAGES IS NOT A NAME: a dot is not in the slug grammar. */
  assert.deepEqual(appPath('/app/mark.svg'), { slug: null, rest: '/mark.svg' });
  /* THE CHUNKS ARE THE STATIC ASSETS', and `run_worker_first` keeps them away from this Worker altogether. */
  assert.equal(appPath('/app/_app/x.js'), null);
  assert.equal(appPath('/app/_app/immutable/entry/start.js'), null);
  /* NOR IS `/app/api/*`, which names no record and no page: read as a page it was a second copy of the root `/api`,
     the demo and the key doors included, and `slug-api.test.ts` runs that through the bundle. */
  for (const path of ['/app/api', '/app/api/', '/app/api/boot', '/app//api/vault/deposit']) assert.equal(appPath(path), null, path);
  /* AND NOTHING THAT MERELY STARTS WITH THOSE LETTERS. */
  for (const path of ['/', '/api/boot', '/apple', '/application/x', '/r/tasks', '/in/webhook/x']) assert.equal(appPath(path), null, path);
});

test('atRoot moves a request to the root path the record reads, and keeps its method, its headers, its query and its body', async () => {
  const moved = atRoot(
    new Request('https://brain.dog/app/acme/api/create?x=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://brain.dog', cookie: 'c=1' },
      body: '{"register":"tasks"}',
    }),
    '/api/create',
  );
  assert.equal(moved.url, 'https://brain.dog/api/create?x=1');
  assert.equal(moved.method, 'POST');
  assert.equal(moved.headers.get('origin'), 'https://brain.dog');
  assert.equal(moved.headers.get('cookie'), 'c=1');
  assert.equal(await moved.text(), '{"register":"tasks"}');
  assert.equal(atRoot(new Request('https://brain.dog/app/acme/api/boot'), '/api/boot').url, 'https://brain.dog/api/boot');
});

/* ── the old host ─────────────────────────────────────────────────────── */

const LEGACY = 'app.brain.dog';
const PUBLIC = 'brain.dog';
const on = (path: string, init: RequestInit = {}) => new Request(`https://app.brain.dog${path}`, init);
const html = { accept: 'text/html,application/xhtml+xml' };

test('A PAGE LOAD ON THE OLD HOST IS A 308 TO THE SAME PAGE UNDER /app ON THE NEW ONE, query and all', () => {
  const moved = legacyRedirect(on('/r/tasks', { headers: html }), LEGACY, PUBLIC);
  assert.equal(moved?.status, 308);
  assert.equal(moved?.headers.get('location'), 'https://brain.dog/app/r/tasks');
  assert.equal(moved?.headers.get('cache-control'), 'no-store');
  assert.equal(legacyRedirect(on('/'), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/');
  assert.equal(legacyRedirect(on('/signin?next=%2Fr%2Ftasks'), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/signin?next=%2Fr%2Ftasks');
  assert.equal(legacyRedirect(on('/D41', { method: 'HEAD' }), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/D41');
  /* A PATH ALREADY UNDER /app IS NOT PREFIXED TWICE. */
  assert.equal(legacyRedirect(on('/app/acme/r/tasks'), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/acme/r/tasks');
  /* A LIST OF NAMES, and case is not a different name. */
  assert.equal(legacyRedirect(new Request('https://APP.Brain.Dog/x'), ' other.example , app.brain.dog', PUBLIC)?.status, 308);
});

test('/api, /mcp AND /in/* ON THE OLD HOST ARE SERVED WHERE THEY STAND, BECAUSE NOTHING THAT CALLS THEM FOLLOWS A REDIRECT', () => {
  /* The CLI refuses every redirect, a webhook sender does not follow a 3xx, and a 301 or 302 turns a POST into a GET. */
  assert.equal(legacyRedirect(on('/in/webhook/rec_01J8ZC0000000000000000000A/bank/tok', { method: 'POST', body: '{}' }), LEGACY, PUBLIC), null);
  assert.equal(legacyRedirect(on('/in/email/tok', { method: 'POST', body: 'x' }), LEGACY, PUBLIC), null);
  assert.equal(legacyRedirect(on('/api/boot', { method: 'POST', headers: html, body: '{}' }), LEGACY, PUBLIC), null);
  /* A GET TOO, because an agent's GET is not a page load and a stale tab's fetch does not follow a redirect across origins. */
  for (const path of ['/api/boot', '/mcp', '/in/webhook/x', '/auth/methods', '/account/records', '/.well-known/braindog-build'])
    assert.equal(legacyRedirect(on(path, { headers: html }), LEGACY, PUBLIC), null, path);
  /* AND A WRITE TO A PAGE IS NOT A PAGE LOAD. */
  assert.equal(legacyRedirect(on('/r/tasks', { method: 'POST', body: 'x' }), LEGACY, PUBLIC), null);
});

test('UNSET IS THE WORKER AS IT WAS: no legacy host, no public host, or the public host itself is never redirected', () => {
  assert.equal(legacyRedirect(on('/r/tasks'), undefined, PUBLIC), null);
  assert.equal(legacyRedirect(on('/r/tasks'), '', PUBLIC), null);
  assert.equal(legacyRedirect(on('/r/tasks'), LEGACY, undefined), null);
  assert.equal(legacyRedirect(on('/r/tasks'), LEGACY, ''), null);
  /* A NAME LISTED AS BOTH would redirect to itself for ever. */
  assert.equal(legacyRedirect(on('/r/tasks'), LEGACY, LEGACY), null);
  assert.equal(legacyRedirect(new Request('https://brain.dog/r/tasks'), LEGACY, PUBLIC), null);
});

/* ── bare /app ────────────────────────────────────────────────────────── */

const SID = 'S'.repeat(43);
const REC = 'rec_01J8ZC0000000000000000000B';
const WHO: Who = { person: 'p_1', email: 'ada@example.com', record: REC, provedAt: 0 };
const SHELL = '<!doctype html><title>BrainDog</title>';

function entry(o: { session?: AuthResult<Who>; slug?: string | null } = {}) {
  const asked: string[] = [];
  const deps: EntryDeps = {
    session: async (sid) => (asked.push(`session ${sid}`), o.session ?? { status: 200, body: WHO }),
    slugOf: async (record) => (asked.push(`slugOf ${record}`), o.slug === undefined ? 'acme' : o.slug),
    shell: async () => (asked.push('shell'), new Response(SHELL, { headers: { 'content-type': 'text/html' } })),
  };
  return { deps, asked };
}
const bare = (headers: Record<string, string> = {}) => new Request('https://brain.dog/app', { headers });
const cookie = { cookie: `__Host-bd_s=${SID}` };

test('GET /app WITH NO COOKIE IS THE SHELL, which draws the sample for a stranger, and the Directory is not asked', async () => {
  const { deps, asked } = entry();
  const out = await appEntry(bare(), deps);
  assert.equal(out.status, 200);
  assert.equal(await out.text(), SHELL);
  assert.deepEqual(asked, ['shell']);
});

test('GET /app WITH A SESSION ON acme IS A 302 TO /app/acme/, and one on no record yet is sent to start', async () => {
  const { deps, asked } = entry();
  const out = await appEntry(bare(cookie), deps);
  assert.equal(out.status, 302);
  assert.equal(out.headers.get('location'), '/app/acme/');
  /* IT DEPENDS ON THE COOKIE, so no cache may keep it for the next visitor. */
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.deepEqual(asked, [`session ${SID}`, `slugOf ${REC}`]);

  const none = await appEntry(bare(cookie), entry({ session: { status: 200, body: { ...WHO, record: null } } }).deps);
  assert.equal(none.status, 302);
  assert.equal(none.headers.get('location'), '/app/start');

  /* A RECORD WITH NO LIVE NAME HAS NO ADDRESS TO SEND ANYBODY TO, and the shell sorts it out from `boot`. */
  const unnamed = entry({ slug: null });
  assert.equal((await appEntry(bare(cookie), unnamed.deps)).status, 200);
  assert.ok(unnamed.asked.includes('shell'));
});

test('A ROTATION RIDES ON THE 302, AND A DEAD COOKIE IS THE SHELL WITH THE COOKIE CLEARED, never a redirect into a record', async () => {
  const rotated = await appEntry(bare(cookie), entry({ session: { status: 200, body: WHO, session: { sid: 'R'.repeat(43) } } }).deps);
  assert.equal(rotated.status, 302);
  assert.deepEqual(rotated.headers.getSetCookie(), [`__Host-bd_s=${'R'.repeat(43)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`]);

  const dead = await appEntry(bare(cookie), entry({ session: { status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' }, session: 'clear' } }).deps);
  assert.equal(dead.status, 200);
  assert.equal(await dead.text(), SHELL);
  assert.deepEqual(dead.headers.getSetCookie(), ['__Host-bd_s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax']);

  /* A LOCKOUT OR A FAILED STORE IS NOT A SIGN-OUT: the shell, and the cookie kept. */
  const busy = await appEntry(bare(cookie), entry({ session: { status: 503 } }).deps);
  assert.equal(busy.status, 200);
  assert.deepEqual(busy.headers.getSetCookie(), []);
});

/* ── the catalogue ────────────────────────────────────────────────────── */

test('THE CATALOGUE IS READ UNDER /app/catalogue/, WHERE THE BUILD PUTS IT ONCE THE APP HAS A BASE PATH', async () => {
  /* `paths.base: '/app'` moves `apps/web/static/catalogue` to `build/app/catalogue` (`loop/research-one-domain.md` §3.2),
     so a reader that asked only `/catalogue/` would find the shell, read it as no file, and Spark would offer nothing. */
  const asked: string[] = [];
  const moved: Assets = {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      asked.push(path);
      return path === '/app/catalogue/index.json'
        ? new Response('{"entries":[]}', { headers: { 'content-type': 'application/json' } })
        : new Response(null, { status: 404 });
    },
  };
  assert.equal(await assetsReader(moved)('index.json'), '{"entries":[]}');
  assert.ok(asked.includes('/app/catalogue/index.json'), `the reader asked ${asked.join(', ')}`);
});

/* ── and index.ts uses all of it ──────────────────────────────────────── */

test('THE WORKER ASKS ABOUT THE OLD HOST FIRST, then reads /app, and serves a slug’s API through the same door', () => {
  const body = SOURCE.slice(SOURCE.indexOf('async function route('));
  const redirect = body.indexOf('legacyRedirect(request, env.LEGACY_HOSTS, env.PUBLIC_HOST)');
  assert.ok(redirect > 0, 'route() does not ask about the old host');
  /* BEFORE THE BUILD ID AND SIGN-IN TOO, which never redirect, because `legacyRedirect` is what says so. */
  assert.ok(redirect < body.indexOf('servesBuild(url.pathname)'), 'something is answered before the old host is asked about');
  const app = body.indexOf('appPath(url.pathname)');
  assert.ok(app > redirect, 'route() does not read /app');
  /* AND BEFORE THE ROOT'S `ROUTE_UNKNOWN`, which would otherwise answer every page of the app. */
  assert.ok(app < body.indexOf("'A record method is at /api/<method>.'"), '/app is read after the root refuses it');
  assert.match(SOURCE, /doorOf\(request, \{[\s\S]*?\}, slug\)/u, 'the slug does not reach doorOf');
  assert.match(SOURCE, /bearerOf\(request, 'api', bearerDeps\(env\), slug\)/u, 'the slug does not reach bearerOf');
  assert.match(SOURCE, /directory\.auth\(\{ flow: 'session', sid, \.\.\.\(slug === undefined \? \{\} : \{ slug \}\) \}\)/u, 'the Directory is not asked about the slug');
  assert.match(SOURCE, /relyingParty\(`https:\/\/\$\{host\}`, this\.env\.RP_ID\)/u, 'RP_ID is not read');
});
