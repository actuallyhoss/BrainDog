/**
 * The app under `/app`, on the one domain: which path names a record, where the old host sends a page load, and what
 * bare `/app` opens.
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
     the key door included, and `slug-api.test.ts` runs that through the bundle. */
  for (const path of ['/app/api', '/app/api/', '/app/api/boot', '/app//api/vault/deposit']) assert.equal(appPath(path), null, path);
  /* AND NOTHING THAT MERELY STARTS WITH THOSE LETTERS. */
  for (const path of ['/', '/api/boot', '/apple', '/application/x', '/r/tasks', '/in/webhook/x']) assert.equal(appPath(path), null, path);
});

/* MEASURED ON PRODUCTION BEFORE THIS: `/app/Acme/api/boot`,
   `/app/admin/api/boot` and `/app/www/api/boot` were `200 text/html`, the shell, so a JSON client with a mistyped or
   upper-case slug read a page as success. It cannot be every word that is not a name, because ten of the app's routes
   take a parameter as their second segment (`apps/web/src/routes/<word>/[param]/`, counted), and `/app/r/api` is the
   register page for a register called `api`. */
test('AN API PATH UNDER THE UPPER-CASE SPELLING OF A NAME, OR UNDER A RESERVED WORD THE APP DOES NOT ROUTE, IS NO APP PATH', () => {
  for (const path of ['/app/Acme/api/boot', '/app/ACME/api', '/app/Acme/api/', '/app/Ada-At-Home/api/slash/status', '/app/admin/api/boot', '/app/www/api/boot', '/app/mcp/api/boot', '/app/auth//api/boot'])
    assert.equal(appPath(path), null, path);
  /* THE SAME WORDS WITHOUT `/api` ARE STILL PAGES, which is what the app's root `[id]` route and its 404 page draw. */
  assert.deepEqual(appPath('/app/Acme'), { slug: null, rest: '/Acme' });
  assert.deepEqual(appPath('/app/admin/x'), { slug: null, rest: '/admin/x' });
  assert.deepEqual(appPath('/app/Acme/apiary'), { slug: null, rest: '/Acme/apiary' });
  /* AND A ROUTE THAT TAKES A PARAMETER TAKES `api` AS ONE: a register, a settings area, a track, a view. */
  for (const word of ['automations', 'decide', 'jobs', 'p', 'packs', 'r', 's', 'settings', 't', 'v'])
    assert.deepEqual(appPath(`/app/${word}/api`), { slug: null, rest: `/${word}/api` }, word);
  assert.deepEqual(appPath('/app/settings/api/boot'), { slug: null, rest: '/settings/api/boot' });
  /* A SPOKEN ID IS AN ITEM AND NEVER A NAME, however it is cased. */
  assert.deepEqual(appPath('/app/D41/api'), { slug: null, rest: '/D41/api' });
  /* A LOWER-CASE NAME IS UNCHANGED: its API is that record's. */
  assert.deepEqual(appPath('/app/acme/api/boot'), { slug: 'acme', rest: '/api/boot' });
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
  assert.equal(legacyRedirect(on('/', { headers: html }), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/');
  assert.equal(legacyRedirect(on('/signin?next=%2Fr%2Ftasks', { headers: html }), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/signin?next=%2Fr%2Ftasks');
  assert.equal(legacyRedirect(on('/D41', { method: 'HEAD', headers: html }), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/D41');
  /* A PATH ALREADY UNDER /app IS NOT PREFIXED TWICE. */
  assert.equal(legacyRedirect(on('/app/acme/r/tasks', { headers: html }), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/acme/r/tasks');
  /* A LIST OF NAMES, and case is not a different name. */
  assert.equal(legacyRedirect(new Request('https://APP.Brain.Dog/x', { headers: html }), ' other.example , app.brain.dog', PUBLIC)?.status, 308);
});

/* AGAINST THE ONE-DOMAIN MOVE'S TWO STATEMENTS BELOW. Measured with push B's vars
   before this test: `GET app.brain.dog/app/acme/api/boot` was a 308 to `brain.dog` with no Accept, with a wildcard one
   and with `text/html`, and so were `/app/_app/version.json` and `/app/fonts/geist.woff2` under a wildcard. The public
   host's branch already asked both questions below; the legacy branch asked neither. */
test('"/api/*, /mcp AND /in/* ARE SERVED, NEVER REDIRECTED" ON THE OLD HOST, AND THAT INCLUDES A SLUG’S /api', () => {
  /* THE WEB'S ONE GET, `hostGet`'s Slash status, is sent under the slug by `apiBase()`. A 308 to another origin carries
     no CORS header, so a stale tab's same-origin fetch cannot follow it and the palette's Slash line fails. */
  for (const accept of [undefined, '*/*', 'text/html,application/xhtml+xml'])
    for (const path of ['/app/acme/api/boot', '/app/acme/api/slash/status', '/app/acme//api/boot'])
      assert.equal(legacyRedirect(on(path, accept === undefined ? {} : { headers: { accept } }), LEGACY, PUBLIC), null, `${path} ${accept ?? '(no accept)'}`);
});

test('ONLY A "BROWSER NAVIGATION" IS MOVED OFF THE OLD HOST, which is a GET or a HEAD that asks for HTML', () => {
  /* A STALE SHELL'S VERSION POLL AND ITS FONTS: a 308 to another origin fails the fetch where serving them costs nothing. */
  for (const path of ['/app/_app/version.json', '/app/fonts/geist.woff2', '/_app/version.json', '/favicon.ico'])
    assert.equal(legacyRedirect(on(path, { headers: { accept: '*/*' } }), LEGACY, PUBLIC), null, path);
  /* NO ACCEPT AT ALL IS A SCRIPT OR A PROBE, NOT A BROWSER, which always says `text/html` for a page. */
  for (const path of ['/', '/r/tasks', '/app/acme/r/tasks']) assert.equal(legacyRedirect(on(path), LEGACY, PUBLIC), null, path);
  assert.equal(legacyRedirect(on('/r/tasks', { method: 'HEAD' }), LEGACY, PUBLIC), null);
  /* AND THE SAME PAGES, ASKED AS A PAGE, ARE MOVED, so the check spares the fetch and never the navigation. */
  for (const path of ['/', '/r/tasks', '/app/acme/r/tasks'])
    assert.equal(legacyRedirect(on(path, { headers: html }), LEGACY, PUBLIC)?.status, 308, path);
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

test('UNSET IS THE WORKER AS IT WAS: no legacy host or no public host, and the public host is never sent to another name', () => {
  /* ASKED AS A PAGE LOAD, BECAUSE NOTHING ELSE IS MOVED ON EITHER HOST NOW. Without the Accept these held whatever the
     list said: with the `hosts.includes` line deleted, so that every name was legacy, the whole file still passed. */
  assert.equal(legacyRedirect(on('/r/tasks', { headers: html }), undefined, PUBLIC), null);
  assert.equal(legacyRedirect(on('/r/tasks', { headers: html }), '', PUBLIC), null);
  assert.equal(legacyRedirect(on('/r/tasks', { headers: html }), LEGACY, undefined), null);
  assert.equal(legacyRedirect(on('/r/tasks'), LEGACY, ''), null);
  assert.equal(legacyRedirect(on('/r/tasks', { headers: html }), LEGACY, ''), null);
  /* A NAME LISTED AS BOTH is the public host and nothing else. Read as legacy it would be sent to itself; read as the
     public host its page load goes to `/app` on the same name, and `/app` is never redirected, so it ends there. */
  assert.equal(legacyRedirect(on('/r/tasks'), LEGACY, LEGACY), null);
  assert.equal(legacyRedirect(on('/r/tasks', { headers: html }), LEGACY, LEGACY)?.headers.get('location'), 'https://app.brain.dog/app/r/tasks');
  assert.equal(legacyRedirect(new Request('https://brain.dog/r/tasks', { headers: html }), LEGACY, PUBLIC)?.headers.get('location'), 'https://brain.dog/app/r/tasks');
});

/* ── the public host, before the move reaches it ──────────────────────── */

/* PUSH A OF THE ONE-DOMAIN MOVE: the app built under `/app`, and the Worker still on `app.brain.dog`
   with nothing listed as legacy. Measured there before this branch: `/`, `/signin` and `/r/tasks` answered a JSON
   `ROUTE_UNKNOWN` 404, because the build has no root `index.html` any more and `not_found_handling` is `none`. */
const DARK = 'app.brain.dog';
const dark = (path: string, init: RequestInit = {}) => legacyRedirect(on(path, init), '', DARK);

test('A PAGE LOAD ON THE PUBLIC HOST OUTSIDE /app IS A 308 TO /app ON THE SAME HOST, query kept, so the front door survives the dark deploy', () => {
  const home = dark('/', { headers: html });
  assert.equal(home?.status, 308);
  assert.equal(home?.headers.get('location'), 'https://app.brain.dog/app/');
  assert.equal(home?.headers.get('cache-control'), 'no-store');
  /* THE SITE'S "Sign in" AND AN ALREADY-MAILED MAGIC LINK both land here. The fragment is the browser's to keep. */
  assert.equal(dark('/signin?next=%2Fr%2Ftasks', { headers: html })?.headers.get('location'), 'https://app.brain.dog/app/signin?next=%2Fr%2Ftasks');
  assert.equal(dark('/r/tasks', { method: 'HEAD', headers: html })?.headers.get('location'), 'https://app.brain.dog/app/r/tasks');
  assert.equal(legacyRedirect(new Request('https://APP.Brain.Dog/D41', { headers: html }), '', DARK)?.headers.get('location'), 'https://app.brain.dog/app/D41');
});

test('ON THE PUBLIC HOST A DOOR, /app ITSELF AND ANYTHING THAT IS NOT A PAGE LOAD ARE NEVER MOVED', () => {
  /* THE DOORS, asked as a page load on purpose: the Accept header is not what spares them. */
  for (const path of ['/api/boot', '/mcp', '/in/x', '/in/webhook/rec_01J8ZC0000000000000000000A/bank/tok', '/auth/methods', '/account/records', '/.well-known/braindog-build'])
    assert.equal(dark(path, { headers: html }), null, path);
  /* `/app` IS WHERE THE REDIRECT LANDS, so moving it again would be a loop. */
  for (const path of ['/app', '/app/', '/app/r/tasks', '/app/acme/r/tasks', '/app/_app/version.json'])
    assert.equal(dark(path, { headers: html }), null, path);
  /* NOT A PAGE LOAD: a fetch that does not ask for HTML, an old shell's `/_app/version.json` poll, and a write. A 308
     there would hand a script a redirect it did not ask for, where the router's own 404 says what is true. */
  assert.equal(dark('/r/tasks'), null);
  assert.equal(dark('/_app/version.json', { headers: { accept: '*/*' } }), null);
  assert.equal(dark('/r/tasks', { method: 'POST', headers: html, body: 'x' }), null);
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

test('GET /app WITH NO COOKIE IS THE SHELL, and the app sends a stranger on to sign-in, and the Directory is not asked', async () => {
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

test('THE CATALOGUE IS READ UNDER /app/catalogue/, WHERE THE BUILD PUTS IT ONCE THE APP HAS A BASE PATH', async () => {
  /* `paths.base: '/app'` moves `apps/web/static/catalogue` to `build/app/catalogue`,
     so a reader that asked only `/catalogue/` would find the shell, read it as no file, and Slash would offer nothing. */
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

/* THE APP BACK ON ITS OWN NAME (push C): `app.brain.dog` is the public host and `brain.dog` the legacy one. A page load on
   `brain.dog/app/...` reaches this Worker through the site's binding and is a 308 to `app.brain.dog`, path and query
   kept; `/api/*`, `/mcp` and `/in/*` there are served; and the app's own name is never sent anywhere. */
test('a page load under /app on the site\'s name goes to the app\'s own name, keeping path and query', () => {
  const html = { accept: 'text/html' };
  const site = (path: string, init: RequestInit = {}) => new Request(`https://brain.dog${path}`, init);
  const home = 'app.brain.dog';
  assert.equal(legacyRedirect(site('/app', { headers: html }), 'brain.dog', home)?.headers.get('location'), 'https://app.brain.dog/app');
  assert.equal(legacyRedirect(site('/app/', { headers: html }), 'brain.dog', home)?.headers.get('location'), 'https://app.brain.dog/app/');
  const moved = legacyRedirect(site('/app/acme/r/tasks?new=1', { headers: html }), 'brain.dog', home);
  assert.equal(moved?.status, 308);
  assert.equal(moved?.headers.get('location'), 'https://app.brain.dog/app/acme/r/tasks?new=1');
  assert.equal(legacyRedirect(site('/app/signin?next=%2Fr%2Ftasks', { headers: html }), 'brain.dog', home)?.headers.get('location'), 'https://app.brain.dog/app/signin?next=%2Fr%2Ftasks');
  assert.equal(legacyRedirect(site('/app/acme/r/tasks', { method: 'HEAD', headers: html }), 'brain.dog', home)?.status, 308);
  /* THE DOORS ARE SERVED THERE, NEVER MOVED: a CLI refuses a redirect and a webhook sender does not follow one. */
  for (const path of ['/api/boot', '/mcp', '/in/email/abc', '/app/acme/api/boot', '/auth/methods', '/account/billing/webhook'])
    assert.equal(legacyRedirect(site(path, { headers: html }), 'brain.dog', home), null, path);
  assert.equal(legacyRedirect(site('/app/acme/r/tasks', { method: 'POST', headers: html }), 'brain.dog', home), null);
  /* AND THE APP'S OWN NAME STAYS WHERE IT IS. */
  assert.equal(legacyRedirect(new Request('https://app.brain.dog/app/acme/r/tasks', { headers: html }), 'brain.dog', home), null);
});
