/**
 * The app at the root of `app.brain.dog`: which path names a record, where an old `/app` address and the site's name
 * send a page load, and what bare `/` opens.
 *
 * THE FIRST SEGMENT IS A PAGE OR A RECORD'S NAME, AND NOTHING ELSE DECIDES WHICH. `appPath` asks the Directory's own
 * `badSlug`, so `/settings` is always the page and `/acme` is always acme; a second list here would be a second answer.
 * What comes back as the slug is only ever a claim: `session.ts` has the Directory say whether it is this person's
 * before any record is addressed, and `session.test.ts` holds that half.
 *
 * THE APP WAS UNDER `/app` UNTIL 29 OCT, and he did not want the second `app`. A page load there is a 308 to the same
 * address without it, and what may not be redirected, a CLI's `/app/<slug>/api/<method>`, is read as the new address.
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
import { appPath, atRoot, legacyRedirect, unprefixed } from '../src/route.ts';
import { appEntry, type EntryDeps } from '../src/session.ts';

const SOURCE = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');

/* ── which path names a record ────────────────────────────────────────── */

test('A SLUG FIRST IS THE RECORD, A WORD THE APP ROUTES IS ITS PAGE, AND THE BUILD’S OWN CHUNKS ARE NEITHER', () => {
  assert.deepEqual(appPath('/acme/api/boot'), { slug: 'acme', rest: '/api/boot' });
  assert.deepEqual(appPath('/acme/r/tasks/12'), { slug: 'acme', rest: '/r/tasks/12' });
  assert.deepEqual(appPath('/acme'), { slug: 'acme', rest: '/' });
  assert.deepEqual(appPath('/acme/'), { slug: 'acme', rest: '/' });
  /* NO SLUG IS "THE RECORD MY SESSION IS ON", which is where a redirect lands, since a redirect cannot know one. */
  assert.deepEqual(appPath('/r/tasks'), { slug: null, rest: '/r/tasks' });
  assert.deepEqual(appPath('/settings/agents'), { slug: null, rest: '/settings/agents' });
  assert.deepEqual(appPath('/signin'), { slug: null, rest: '/signin' });
  assert.deepEqual(appPath('/catalogue/index.json'), { slug: null, rest: '/catalogue/index.json' });
  assert.deepEqual(appPath('/'), { slug: null, rest: '/' });
  /* `/d41` IS DECISION 41 and never a record called `d41`, which the Directory refuses to hand out. */
  assert.deepEqual(appPath('/d41'), { slug: null, rest: '/d41' });
  assert.deepEqual(appPath('/SG31'), { slug: null, rest: '/SG31' });
  /* A FILE BESIDE THE PAGES IS NOT A NAME: a dot is not in the slug grammar. */
  assert.deepEqual(appPath('/mark.svg'), { slug: null, rest: '/mark.svg' });
  /* THE CHUNKS ARE THE STATIC ASSETS', and `run_worker_first` keeps them away from this Worker altogether. */
  assert.equal(appPath('/_app/x.js'), null);
  assert.equal(appPath('/_app/immutable/entry/start.js'), null);
  /* NOR `/.well-known/*`, which is the host's. */
  assert.equal(appPath('/.well-known/security.txt'), null);
});

test('THE OLD /app ADDRESS IS READ AS THE NEW ONE, so a CLI whose hosts file was written before the move still reaches its record', () => {
  assert.deepEqual(appPath('/app/acme/api/boot'), { slug: 'acme', rest: '/api/boot' });
  assert.deepEqual(appPath('/app/acme/.well-known/braindog-key'), { slug: 'acme', rest: '/.well-known/braindog-key' });
  assert.deepEqual(appPath('/app/r/tasks'), { slug: null, rest: '/r/tasks' });
  assert.deepEqual(appPath('/app'), { slug: null, rest: '/' });
  assert.deepEqual(appPath('/app/'), { slug: null, rest: '/' });
  assert.equal(appPath('/app/_app/x.js'), null);
  /* `unprefixed` TAKES `/app` OFF AND NOTHING THAT MERELY STARTS WITH THOSE LETTERS. */
  assert.equal(unprefixed('/app'), '/');
  assert.equal(unprefixed('/app/'), '/');
  assert.equal(unprefixed('/app/acme/r/tasks'), '/acme/r/tasks');
  for (const path of ['/', '/apple', '/application/x', '/acme/app', '/r/tasks']) assert.equal(unprefixed(path), null, path);
  assert.deepEqual(appPath('/apple'), { slug: 'apple', rest: '/' });
});

test('A DOOR’S WORD IS NO APP PATH, AT THE ROOT OR UNDER THE OLD PREFIX', () => {
  /* `/api/*` NAMES NO RECORD AND NO PAGE: read as a page it was a second copy of the root `/api`, the key door included,
     and `slug-api.test.ts` runs that through the bundle. The root's `/api` is `route()`'s own, below `appPath`. */
  for (const path of ['/api', '/api/', '/api/boot', '/app/api', '/app/api/', '/app/api/boot', '/app//api/vault/deposit']) assert.equal(appPath(path), null, path);
  /* THE DOORS NOT YET BUILT AND THE ONES `route()` ANSWERS FIRST: the router's 404, never the shell's 200. */
  for (const path of ['/a', '/a/x', '/ws', '/ws/x', '/in/webhook/x', '/auth/methods', '/account/records', '/mcp', '/oauth/authorize', '/healthz', '/app/app/x'])
    assert.equal(appPath(path), null, path);
});

/* MEASURED ON PRODUCTION BEFORE THIS: `/app/Acme/api/boot`,
   `/app/admin/api/boot` and `/app/www/api/boot` were `200 text/html`, the shell, so a JSON client with a mistyped or
   upper-case slug read a page as success. It cannot be every word that is not a name, because ten of the app's routes
   take a parameter as their second segment (`apps/web/src/routes/<word>/[param]/`, counted), and `/r/api` is the
   register page for a register called `api`. */
test('AN API PATH UNDER THE UPPER-CASE SPELLING OF A NAME, OR UNDER A RESERVED WORD THE APP DOES NOT ROUTE, IS NO APP PATH', () => {
  for (const path of ['/Acme/api/boot', '/ACME/api', '/Acme/api/', '/Ada-At-Home/api/slash/status', '/admin/api/boot', '/www/api/boot', '/app/Acme/api/boot', '/app/www/api/boot'])
    assert.equal(appPath(path), null, path);
  /* THE SAME WORDS WITHOUT `/api` ARE STILL PAGES, which is what the app's root `[id]` route and its 404 page draw. */
  assert.deepEqual(appPath('/Acme'), { slug: null, rest: '/Acme' });
  assert.deepEqual(appPath('/admin/x'), { slug: null, rest: '/admin/x' });
  assert.deepEqual(appPath('/Acme/apiary'), { slug: null, rest: '/Acme/apiary' });
  /* AND A ROUTE THAT TAKES A PARAMETER TAKES `api` AS ONE: a register, a settings area, a track, a view. */
  for (const word of ['automations', 'decide', 'jobs', 'p', 'packs', 'r', 's', 'settings', 't', 'v'])
    assert.deepEqual(appPath(`/${word}/api`), { slug: null, rest: `/${word}/api` }, word);
  assert.deepEqual(appPath('/settings/api/boot'), { slug: null, rest: '/settings/api/boot' });
  /* A SPOKEN ID IS AN ITEM AND NEVER A NAME, however it is cased. */
  assert.deepEqual(appPath('/D41/api'), { slug: null, rest: '/D41/api' });
  /* A LOWER-CASE NAME IS UNCHANGED: its API is that record's. */
  assert.deepEqual(appPath('/acme/api/boot'), { slug: 'acme', rest: '/api/boot' });
});

test('atRoot moves a request to the root path the record reads, and keeps its method, its headers, its query and its body', async () => {
  const moved = atRoot(
    new Request('https://app.brain.dog/acme/api/create?x=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://app.brain.dog', cookie: 'c=1' },
      body: '{"register":"tasks"}',
    }),
    '/api/create',
  );
  assert.equal(moved.url, 'https://app.brain.dog/api/create?x=1');
  assert.equal(moved.method, 'POST');
  assert.equal(moved.headers.get('origin'), 'https://app.brain.dog');
  assert.equal(moved.headers.get('cookie'), 'c=1');
  assert.equal(await moved.text(), '{"register":"tasks"}');
  assert.equal(atRoot(new Request('https://app.brain.dog/app/acme/api/boot'), '/api/boot').url, 'https://app.brain.dog/api/boot');
});

/* ── the old /app on the app's own name ───────────────────────────────── */

const HOME = 'app.brain.dog';
const LEGACY = 'brain.dog';
const on = (path: string, init: RequestInit = {}) => new Request(`https://app.brain.dog${path}`, init);
const site = (path: string, init: RequestInit = {}) => new Request(`https://brain.dog${path}`, init);
const html = { accept: 'text/html,application/xhtml+xml' };

test('A GET UNDER /app ON THE APP’S OWN NAME IS ONE 308 TO THE SAME ADDRESS WITHOUT IT, query kept', () => {
  const moved = legacyRedirect(on('/app/acme/r/tasks?new=1', { headers: html }), LEGACY, HOME);
  assert.equal(moved?.status, 308);
  assert.equal(moved?.headers.get('location'), 'https://app.brain.dog/acme/r/tasks?new=1');
  assert.equal(moved?.headers.get('cache-control'), 'no-store');
  assert.equal(legacyRedirect(on('/app', { headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/');
  assert.equal(legacyRedirect(on('/app/', { headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/');
  /* AN ALREADY-MAILED SIGN-IN LINK. Its fragment is the browser's to keep. */
  assert.equal(legacyRedirect(on('/app/signin?next=%2Fapp%2Facme', { headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/signin?next=%2Fapp%2Facme');
  assert.equal(legacyRedirect(on('/app/D41', { method: 'HEAD', headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/D41');
  /* WHATEVER IT ACCEPTS, because it is the same origin and a tab's fetch follows it: a stale tab's version poll lands on
     the new build's, and a script with no Accept is sent the same way. */
  for (const init of [{}, { headers: { accept: '*/*' } }])
    assert.equal(legacyRedirect(on('/app/_app/version.json', init), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/_app/version.json');
});

test('ON THE APP’S OWN NAME, EVERY ADDRESS OUTSIDE /app IS THE APP’S, AND NONE OF IT IS MOVED', () => {
  for (const path of ['/', '/acme', '/acme/r/tasks', '/signin', '/r/tasks', '/apple', '/_app/version.json'])
    assert.equal(legacyRedirect(on(path, { headers: html }), LEGACY, HOME), null, path);
});

test('/api, /mcp AND /in/* ARE SERVED WHERE THEY STAND, AND SO IS A SLUG’S API AND ITS KEY UNDER THE OLD /app', () => {
  /* The CLI refuses every redirect, a webhook sender does not follow a 3xx, and a 301 or 302 turns a POST into a GET. */
  for (const accept of [undefined, '*/*', 'text/html,application/xhtml+xml'])
    for (const path of ['/app/acme/api/boot', '/app/acme/api/slash/status', '/app/acme//api/boot', '/app/acme/.well-known/braindog-key'])
      for (const ask of [on, site])
        assert.equal(legacyRedirect(ask(path, accept === undefined ? {} : { headers: { accept } }), LEGACY, HOME), null, `${path} ${accept ?? '(no accept)'}`);
  for (const ask of [on, site]) {
    for (const path of ['/api/boot', '/mcp', '/in/webhook/x', '/auth/methods', '/account/records', '/.well-known/braindog-build', '/oauth/authorize'])
      assert.equal(legacyRedirect(ask(path, { headers: html }), LEGACY, HOME), null, path);
    assert.equal(legacyRedirect(ask('/in/email/tok', { method: 'POST', body: 'x' }), LEGACY, HOME), null);
    /* AND A WRITE TO A PAGE IS NOT A PAGE LOAD. */
    assert.equal(legacyRedirect(ask('/app/acme/r/tasks', { method: 'POST', headers: html, body: 'x' }), LEGACY, HOME), null);
  }
});

/* ── the site's name ──────────────────────────────────────────────────── */

/* A PAGE LOAD ON `brain.dog/app/...` reaches this Worker through the site's binding and is ONE 308 straight to the root of
   `app.brain.dog`, not to `app.brain.dog/app/...` and then again. */
test('a page load under /app on the site’s name goes to the app’s own name at the root, in one hop, keeping path and query', () => {
  assert.equal(legacyRedirect(site('/app', { headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/');
  assert.equal(legacyRedirect(site('/app/', { headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/');
  const moved = legacyRedirect(site('/app/acme/r/tasks?new=1', { headers: html }), LEGACY, HOME);
  assert.equal(moved?.status, 308);
  assert.equal(moved?.headers.get('location'), 'https://app.brain.dog/acme/r/tasks?new=1');
  assert.equal(moved?.headers.get('cache-control'), 'no-store');
  assert.equal(legacyRedirect(site('/app/signin?next=%2Fr%2Ftasks', { headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/signin?next=%2Fr%2Ftasks');
  assert.equal(legacyRedirect(site('/app/acme/r/tasks', { method: 'HEAD', headers: html }), LEGACY, HOME)?.status, 308);
  /* A BARE PATH THAT DOES ARRIVE IS SENT TO THE SAME PATH ON THE APP. The site forwards none today. */
  assert.equal(legacyRedirect(site('/r/tasks', { headers: html }), LEGACY, HOME)?.headers.get('location'), 'https://app.brain.dog/r/tasks');
  /* A LIST OF NAMES, and case is not a different name. */
  assert.equal(legacyRedirect(new Request('https://Brain.Dog/app/x', { headers: html }), ' other.example , brain.dog', HOME)?.status, 308);
});

test('ONLY A "BROWSER NAVIGATION" IS MOVED OFF THE SITE’S NAME, which is a GET or a HEAD that asks for HTML', () => {
  /* A STALE SHELL'S VERSION POLL AND ITS FONTS: a 308 to another origin fails the fetch where serving them costs nothing. */
  for (const path of ['/app/_app/version.json', '/app/fonts/geist.woff2', '/favicon.ico'])
    assert.equal(legacyRedirect(site(path, { headers: { accept: '*/*' } }), LEGACY, HOME), null, path);
  /* NO ACCEPT AT ALL IS A SCRIPT OR A PROBE, NOT A BROWSER, which always says `text/html` for a page. */
  for (const path of ['/app', '/app/acme/r/tasks']) assert.equal(legacyRedirect(site(path), LEGACY, HOME), null, path);
  assert.equal(legacyRedirect(site('/app/r/tasks', { method: 'HEAD' }), LEGACY, HOME), null);
});

test('UNSET IS THE WORKER AS IT WAS: no legacy host moves nothing off another name, and no public host moves nothing at all', () => {
  assert.equal(legacyRedirect(site('/app/r/tasks', { headers: html }), undefined, HOME), null);
  assert.equal(legacyRedirect(site('/app/r/tasks', { headers: html }), '', HOME), null);
  assert.equal(legacyRedirect(on('/app/r/tasks', { headers: html }), LEGACY, undefined), null);
  assert.equal(legacyRedirect(on('/app/r/tasks', { headers: html }), LEGACY, ''), null);
  /* A NAME LISTED AS BOTH is the public host and nothing else: never sent to itself, and only its `/app` moves. */
  assert.equal(legacyRedirect(on('/r/tasks', { headers: html }), HOME, HOME), null);
  assert.equal(legacyRedirect(on('/app/r/tasks', { headers: html }), HOME, HOME)?.headers.get('location'), 'https://app.brain.dog/r/tasks');
});

/* ── bare / ───────────────────────────────────────────────────────────── */

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
const bare = (headers: Record<string, string> = {}) => new Request('https://app.brain.dog/', { headers });
const cookie = { cookie: `__Host-bd_s=${SID}` };

test('GET / WITH NO COOKIE IS THE SHELL, and the app sends a stranger on to sign-in, and the Directory is not asked', async () => {
  const { deps, asked } = entry();
  const out = await appEntry(bare(), deps);
  assert.equal(out.status, 200);
  assert.equal(await out.text(), SHELL);
  assert.deepEqual(asked, ['shell']);
});

test('GET / WITH A SESSION ON acme IS A 302 TO /acme/, and one on no record yet is sent to start', async () => {
  const { deps, asked } = entry();
  const out = await appEntry(bare(cookie), deps);
  assert.equal(out.status, 302);
  assert.equal(out.headers.get('location'), '/acme/');
  /* IT DEPENDS ON THE COOKIE, so no cache may keep it for the next visitor. */
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.deepEqual(asked, [`session ${SID}`, `slugOf ${REC}`]);

  const none = await appEntry(bare(cookie), entry({ session: { status: 200, body: { ...WHO, record: null } } }).deps);
  assert.equal(none.status, 302);
  assert.equal(none.headers.get('location'), '/start');

  /* A RECORD WITH NO LIVE NAME HAS NO ADDRESS TO SEND ANYBODY TO, and the shell sorts it out from `boot`. */
  const unnamed = entry({ slug: null });
  assert.equal((await appEntry(bare(cookie), unnamed.deps)).status, 200);
  assert.ok(unnamed.asked.includes('shell'));
});

test('A ROTATION RIDES ON THE 302, AND A DEAD COOKIE IS THE SHELL WITH THE COOKIE CLEARED, never a redirect into a record', async () => {
  const rotated = await appEntry(bare(cookie), entry({ session: { status: 200, body: WHO, session: { sid: 'R'.repeat(43) } } }).deps);
  assert.equal(rotated.status, 302);
  assert.deepEqual(rotated.headers.getSetCookie(), [`__Host-bd_s=${'R'.repeat(43)}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`]);

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

test('THE CATALOGUE IS READ AT /catalogue/, WHERE THE BUILD PUTS IT NOW THE APP IS AT THE ROOT', async () => {
  /* While the app was built under `/app` it was `build/app/catalogue`; a reader that asks anywhere else finds the
     shell, reads it as no file, and Slash offers nothing. */
  const asked: string[] = [];
  const root: Assets = {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      asked.push(path);
      return path === '/catalogue/index.json'
        ? new Response('{"entries":[]}', { headers: { 'content-type': 'application/json' } })
        : new Response(null, { status: 404 });
    },
  };
  assert.equal(await assetsReader(root)('index.json'), '{"entries":[]}');
  assert.deepEqual(asked, ['/catalogue/index.json']);
});

/* ── and index.ts uses all of it ──────────────────────────────────────── */

test('THE WORKER ASKS ABOUT THE OLD ADDRESSES FIRST, then reads the app, and serves a slug’s API through the same door', () => {
  const body = SOURCE.slice(SOURCE.indexOf('async function route('));
  const redirect = body.indexOf('legacyRedirect(request, env.LEGACY_HOSTS, env.PUBLIC_HOST)');
  assert.ok(redirect > 0, 'route() does not ask about the old addresses');
  /* BEFORE THE BUILD ID AND SIGN-IN TOO, which never redirect, because `legacyRedirect` is what says so. */
  assert.ok(redirect < body.indexOf('servesBuild(url.pathname)'), 'something is answered before the old addresses are asked about');
  const app = body.indexOf('appPath(url.pathname)');
  assert.ok(app > redirect, 'route() does not read the app');
  /* AND BEFORE THE ROOT'S `ROUTE_UNKNOWN`, which would otherwise answer every page of the app. */
  assert.ok(app < body.indexOf("'A record method is at /api/<method>.'"), 'the app is read after the root refuses it');
  assert.match(SOURCE, /doorOf\(request, \{[\s\S]*?\}, slug\)/u, 'the slug does not reach doorOf');
  assert.match(SOURCE, /bearerOf\(request, 'api', bearerDeps\(env\), slug\)/u, 'the slug does not reach bearerOf');
  assert.match(SOURCE, /directory\.auth\(\{ flow: 'session', sid, \.\.\.\(slug === undefined \? \{\} : \{ slug \}\) \}\)/u, 'the Directory is not asked about the slug');
  assert.match(SOURCE, /relyingParty\(`https:\/\/\$\{host\}`, this\.env\.RP_ID\)/u, 'RP_ID is not read');
});
