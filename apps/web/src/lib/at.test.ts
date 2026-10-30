/**
 * Where the app lives on `app.brain.dog`, and which record an address names.
 *
 * THE RECORD IS IN THE PATH NOW, AND THE DATA DOES NOT KNOW IT. A rail address, a nav-prefs key and a `{{ref:…}}` are
 * stored as `/r/<list>` and `/p/<page>` inside the record, so every one of them is still record-relative, and the prefix
 * is added where an address is RENDERED: an `href`, a `goto`, a copied link. These tests hold the three functions that
 * do that, and the one that undoes it for the router.
 *
 * THE APP IS THE ROOT SINCE 29 OCT, AND IT WAS `/app` BEFORE. So the root is shared with the host's doors, which are
 * never the app's, and an address kept from before the move is read as the one it names now.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import { APP_WORDS, BASE, DOORS, apiBase, at, fromLegacy, here, onward, rerouted, signInFirst, signinFor, slugOf, split } from './at.ts';

const on = (path: string) => ({ origin: 'https://app.brain.dog', pathname: path });

test('an address under a slug keeps its slug, and one with no slug stays on the session record', () => {
  assert.equal(at('/r/tasks/12', '/acme/r/obligations'), '/acme/r/tasks/12');
  assert.equal(at('/r/tasks/12', '/r/obligations'), '/r/tasks/12');
  assert.equal(at('/', '/acme/decide'), '/acme/');
  assert.equal(at('/', '/'), '/');
  assert.equal(at('/decide/SG31?option=accept', '/acme'), '/acme/decide/SG31?option=accept');
});

test('AT IS SAFE TO CALL TWICE, because `Button` calls it on whatever it is handed', () => {
  assert.equal(at(at('/r/tasks', '/acme/'), '/acme/'), '/acme/r/tasks');
  assert.equal(at(at('/', '/acme/'), '/acme/'), '/acme/');
  assert.equal(at(at('/r/tasks', '/'), '/'), '/r/tasks');
  /* An address that names its record already is left on it, whichever record the page is on. */
  assert.equal(at('/kiln/r/tasks', '/acme/'), '/kiln/r/tasks');
  /* A query, a fragment, another origin and a protocol-relative address are none of this function's business. */
  for (const left of ['?f=state:is:open', '#b-2', 'https://example.com/r/x', '//evil.example/r', 'mailto:a@b.c', ''])
    assert.equal(at(left, '/acme/'), left);
});

test("A HOST'S DOOR IS NEVER PUT UNDER A RECORD, and an address from before the move is the one it names now", () => {
  for (const door of ['/api/export', '/auth/logout', '/account/records', '/oauth/authorize', '/in/x', '/drawn-frame'])
    assert.equal(at(door, '/acme/r/tasks'), door, door);
  assert.equal(at('/app/acme/r/tasks', '/kiln/'), '/acme/r/tasks');
  assert.equal(at('/app/r/tasks', '/acme/'), '/acme/r/tasks');
  assert.equal(at('/app', '/acme/'), '/acme/');
  assert.equal(at('/app/signin', '/acme/'), '/signin');
});

test('fromLegacy takes off the `/app` the app had, and nothing else', () => {
  assert.equal(fromLegacy('/app'), '/');
  assert.equal(fromLegacy('/app/'), '/');
  assert.equal(fromLegacy('/app/acme/r/tasks'), '/acme/r/tasks');
  assert.equal(fromLegacy('/app?x=1'), '/?x=1');
  assert.equal(fromLegacy('/app#top'), '/#top');
  /* A name that merely starts with the letters is a name. */
  for (const kept of ['/apple/r', '/apps', '/acme/app/x', '/'])
    assert.equal(fromLegacy(kept), kept, kept);
});

/* SEC4 (security review of 30 Oct): `/app` WAS TAKEN OFF AFTER THE CHECKS, AND ONE SLASH WITH IT. A link to
   `/signin?next=/app//evil.example/phish` passed the `//` check as typed and came out `//evil.example/phish`, another
   host, so "Open BrainDog" after a passkey sign-in left the site. */
test('SEC4: A NEXT UNDER /app WITH A HOST BEHIND IT NEVER LEAVES THE ORIGIN', () => {
  assert.equal(fromLegacy('/app//evil.example/x'), '/evil.example/x');
  assert.equal(fromLegacy('/app///evil.example'), '/evil.example');
  for (const next of ['/app//evil.example/phish', '/app///evil.example', '/app/%2F/x', '/app/%2F%2Fevil.example', '/app//\\evil.example']) {
    const to = onward(`?${new URLSearchParams({ next })}`);
    assert.ok(to.startsWith('/') && !to.startsWith('//'), `${next} went to ${to}`);
    assert.equal(new URL(to, 'https://app.example').origin, 'https://app.example', next);
    assert.ok(!decodeURIComponent(to).startsWith('//'), `${next} decodes to another host: ${to}`);
  }
});

test('SIGN-IN, AN INVITATION AND A SHARED PAGE NAME NO RECORD, so a slug is never added to them', () => {
  assert.equal(at('/signin', '/acme/r/tasks'), '/signin');
  assert.equal(at('/invite', '/acme/'), '/invite');
  assert.equal(at('/s', '/acme/'), '/s');
  /* `/start` keeps it: an empty record is sent there to be set up, and it is that record that is set up. */
  assert.equal(at('/start?add=clients', '/acme/'), '/acme/start?add=clients');
});

test('the first segment is a door, an app word, a spoken id or a slug, and only a slug is a slug', () => {
  assert.deepEqual(split('/acme/r/tasks'), { slug: 'acme', rest: '/r/tasks' });
  assert.deepEqual(split('/acme'), { slug: 'acme', rest: '/' });
  assert.deepEqual(split('/r/tasks'), { slug: null, rest: '/r/tasks' });
  assert.deepEqual(split('/'), { slug: null, rest: '/' });
  /* `D41` and `sg31` are spoken ids, whichever case they were typed in (`routes/[id]`). */
  assert.deepEqual(split('/D41'), { slug: null, rest: '/D41' });
  assert.deepEqual(split('/sg31'), { slug: null, rest: '/sg31' });
  assert.deepEqual(split('/acme/D41'), { slug: 'acme', rest: '/D41' });
  assert.deepEqual(split('/apple/r'), { slug: 'apple', rest: '/r' });
  /* NOT THE APP AT ALL: the host's doors, the build's chunks, and the old `/app`, which the Worker sends on. */
  for (const door of ['/api/boot', '/auth/session', '/account', '/mcp', '/in/webhook/x', '/oauth/token', '/healthz', '/_app/immutable/x.js', '/.well-known/braindog-build', '/drawn-frame', '/app', '/app/acme/r'])
    assert.equal(split(door), null, door);
  assert.equal(split('pricing'), null);
  assert.equal(slugOf('/signin'), null);
  assert.equal(slugOf('/the-studio/settings/agents'), 'the-studio');
});

test('EVERY DOOR IS AN APP WORD TOO, so no record can be called by one', () => {
  for (const door of DOORS) if (!door.startsWith('.')) assert.ok(APP_WORDS.has(door), `${door} is a door and could be read as a record`);
});

test('EVERY TOP-LEVEL ROUTE AND STATIC FOLDER IS AN APP WORD, so none of them can be read as a record', () => {
  /* A route added tomorrow under `src/routes` and missing here would be read as a slug the day it shipped: `/usage`
     would ask the Directory for a record called usage and draw its refusal instead of the screen. */
  const routes = readdirSync(new URL('../routes', import.meta.url), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('['))
    .map((e) => e.name);
  const statics = readdirSync(new URL('../../static', import.meta.url), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  assert.ok(routes.length > 15, `read ${routes.length} route folders, which is not the app`);
  for (const word of [...routes, ...statics, '_app']) assert.ok(APP_WORDS.has(word), `${word} is a top-level address and not an app word`);
});

test('the router matches the address with its slug taken out', () => {
  assert.equal(rerouted('/acme/r/tasks'), '/r/tasks');
  assert.equal(rerouted('/acme'), '/');
  assert.equal(rerouted('/acme/D41'), '/D41');
  /* Nothing to take out, so the router is told nothing and matches the address as it came. */
  assert.equal(rerouted('/r/tasks'), undefined);
  assert.equal(rerouted('/D41'), undefined);
  assert.equal(rerouted('/api/boot'), undefined);
});

test('the API is the named record under a slug and the session record without one', () => {
  assert.equal(apiBase(on('/acme/r/tasks')), 'https://app.brain.dog/acme');
  assert.equal(apiBase(on('/r/tasks')), 'https://app.brain.dog');
  assert.equal(apiBase(on('/signin')), 'https://app.brain.dog');
});

test('here is the address inside the record, which is what the rail compares its links against', () => {
  assert.equal(here('/acme/decide/SG31'), '/decide/SG31');
  assert.equal(here('/acme'), '/');
  assert.equal(here('/'), '/');
  assert.equal(here('/inbox'), '/inbox');
});

test('sign-in comes back to the address it was sent from, and never to one somewhere else', () => {
  assert.equal(signinFor({ pathname: '/acme/r/tasks', search: '?f=a' }), '/signin?next=%2Facme%2Fr%2Ftasks%3Ff%3Da');
  assert.equal(onward('?next=%2Facme%2Fr%2Ftasks'), '/acme/r/tasks');
  /* A next mailed before the move, under `/app`, is the address it names now. */
  assert.equal(onward('?next=%2Fapp%2Facme%2Fr%2Ftasks'), '/acme/r/tasks');
  assert.equal(onward('?next=%2Fapp'), '/');
  /* Off the app to a door, off the origin, or nothing at all: the app's own front door. */
  for (const bad of ['?next=https%3A%2F%2Fevil.example%2F', '?next=%2F%2Fevil.example', '?next=%2Fauth%2Fsession', '?next=%2Fapi%2Fexport', '?next=%2Fapp%5C%5Cevil', '', '?next='])
    assert.equal(onward(bad), `${BASE}/`, bad);
});

/* THE SPELLING IS NOT THE ADDRESS. Each of these starts with an app address as typed, and each resolves on this origin
   at one of the host's doors. A first fix caught them in `signin.ts` only, so `onward()` called on its own still handed
   back every one while its comment said a next that leaves the app is dropped. */
test('A NEXT IS JUDGED WHERE IT RESOLVES, so a dot segment however spelled cannot carry it out of the app', () => {
  for (const bad of [
    '/app/../auth/session',
    '/app/%2e%2e/api/export',
    '/app/%2E%2E/api/export',
    '/app/.%2e/in/x',
    '/acme/../auth/session',
    '/acme/%2e%2e/api/export',
    '/r/.%2e/.%2e/in/x',
  ])
    assert.equal(onward(`?${new URLSearchParams({ next: bad })}`), `${BASE}/`, bad);
  /* A TAB OR A NEWLINE IS DELETED BY THE PARSER BEFORE IT READS, so `/\t/[` is `//[` to it: a host, and not a valid one.
     `new URL` threw on it, and the sign-in page calls this before it reads its link, so the page died on arrival. */
  for (const bad of ['/\t/[', '/\n/evil.example', '/\r/evil.example/x'])
    assert.equal(onward(`?${new URLSearchParams({ next: bad })}`), `${BASE}/`, JSON.stringify(bad));
  /* One that resolves inside the app is followed as it resolves, so what is drawn is what the browser will open. */
  assert.equal(onward(`?${new URLSearchParams({ next: '/acme/../shop/./r/tasks?f=a#top' })}`), '/shop/r/tasks?f=a#top');
  assert.equal(onward(`?${new URLSearchParams({ next: '/app/acme/../shop/./r/tasks?f=a#top' })}`), '/shop/r/tasks?f=a#top');
});

test('THE BASE HERE IS THE BASE THE BUILD WAS GIVEN, and the build lands where the Worker serves it from', async () => {
  /* A PATH IN A VARIABLE, so `svelte-check` does not ask for a declaration file for a config written in JavaScript. */
  const file = '../../svelte.config.js';
  const { default: config } = (await import(file)) as { default: { kit: { paths?: { base?: string }; appDir?: string } } };
  assert.equal(config.kit.paths?.base ?? '', BASE);
  assert.equal(BASE, '');
  /* `assets.directory` stays `../web/build` in the Worker's wrangler file, so `/_app/x.js` is `build/_app/x.js`. */
  assert.equal(config.kit.appDir ?? '_app', '_app');
});

/**
 * A 401 IS SENT TO SIGN-IN WHEREVER IT LANDS, slug or not.
 *
 * `/` WITH NOBODY SIGNED IN WAS THE SAMPLE, and this test used to hold that it was left alone to draw it. The app
 * only ever shows a real record now, so the bare address asks for sign-in exactly as `/acme/` does, and `/start`
 * with it: it needs a record to install into, and a stranger has none.
 */
test('A 401 IS SENT TO SIGN-IN, UNDER A SLUG OR NOT, and only the three addresses with no record are spared', () => {
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/', search: '' }), '/signin?next=%2F');
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/acme/r/tasks', search: '' }), '/signin?next=%2Facme%2Fr%2Ftasks');
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/r/tasks', search: '?f=a' }), '/signin?next=%2Fr%2Ftasks%3Ff%3Da');
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/start', search: '' }), '/signin?next=%2Fstart');
  /* Any other refusal is the record's own sentence, drawn where it was asked, and so is a host nobody reached. */
  assert.equal(signInFirst('FORBIDDEN', { pathname: '/acme/', search: '' }), null);
  assert.equal(signInFirst('UNREACHABLE', { pathname: '/', search: '' }), null);
  /* And sign-in itself is never sent to sign-in, nor an invitation, nor a shared page, with a slug or without. */
  for (const pathname of ['/signin', '/acme/signin', '/invite', '/s'])
    assert.equal(signInFirst('UNAUTHORIZED', { pathname, search: '' }), null, pathname);
});
