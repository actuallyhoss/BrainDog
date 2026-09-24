/**
 * Where the app lives on `brain.dog`, and which record an address names (`loop/research-one-domain.md` §2.4, §3.2).
 *
 * THE RECORD IS IN THE PATH NOW, AND THE DATA DOES NOT KNOW IT. A rail address, a nav-prefs key and a `{{ref:…}}` are
 * stored as `/r/<list>` and `/p/<page>` inside the record, so every one of them is still record-relative, and the prefix
 * is added where an address is RENDERED: an `href`, a `goto`, a copied link. These tests hold the three functions that
 * do that, and the one that undoes it for the router.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import { APP_WORDS, BASE, apiBase, at, here, onward, rerouted, signInFirst, signinFor, slugOf, split } from './at.ts';

const on = (path: string) => ({ origin: 'https://brain.dog', pathname: path });

test('an address under a slug keeps its slug, and one with no slug stays on the session record', () => {
  assert.equal(at('/r/tasks/12', '/app/acme/r/obligations'), '/app/acme/r/tasks/12');
  assert.equal(at('/r/tasks/12', '/app/r/obligations'), '/app/r/tasks/12');
  assert.equal(at('/', '/app/acme/decide'), '/app/acme/');
  assert.equal(at('/', '/app/'), '/app/');
  assert.equal(at('/decide/SG31?option=accept', '/app/acme'), '/app/acme/decide/SG31?option=accept');
});

test('AT IS SAFE TO CALL TWICE, because `Button` calls it on whatever it is handed', () => {
  assert.equal(at(at('/r/tasks', '/app/acme/'), '/app/acme/'), '/app/acme/r/tasks');
  assert.equal(at('/app', '/app/acme/'), '/app');
  /* A query, a fragment, another origin and a protocol-relative address are none of this function's business. */
  for (const left of ['?f=state:is:open', '#b-2', 'https://example.com/r/x', '//evil.example/r', 'mailto:a@b.c', ''])
    assert.equal(at(left, '/app/acme/'), left);
});

test('SIGN-IN, AN INVITATION AND A SHARED PAGE NAME NO RECORD, so a slug is never added to them', () => {
  assert.equal(at('/signin', '/app/acme/r/tasks'), '/app/signin');
  assert.equal(at('/invite', '/app/acme/'), '/app/invite');
  assert.equal(at('/s/tok_1', '/app/acme/'), '/app/s/tok_1');
  /* `/start` keeps it: an empty record is sent there to be set up, and it is that record that is set up. */
  assert.equal(at('/start?add=clients', '/app/acme/'), '/app/acme/start?add=clients');
});

test('the first segment is an app word, a spoken id or a slug, and only a slug is a slug', () => {
  assert.deepEqual(split('/app/acme/r/tasks'), { slug: 'acme', rest: '/r/tasks' });
  assert.deepEqual(split('/app/acme'), { slug: 'acme', rest: '/' });
  assert.deepEqual(split('/app/r/tasks'), { slug: null, rest: '/r/tasks' });
  assert.deepEqual(split('/app'), { slug: null, rest: '/' });
  assert.deepEqual(split('/app/'), { slug: null, rest: '/' });
  /* `D41` and `sg31` are spoken ids, whichever case they were typed in (`routes/[id]`). */
  assert.deepEqual(split('/app/D41'), { slug: null, rest: '/D41' });
  assert.deepEqual(split('/app/sg31'), { slug: null, rest: '/sg31' });
  assert.deepEqual(split('/app/_app/immutable/x.js'), { slug: null, rest: '/_app/immutable/x.js' });
  assert.deepEqual(split('/app/acme/D41'), { slug: 'acme', rest: '/D41' });
  /* Not under the app at all: the marketing site's own pages, and a path that merely starts with the letters. */
  assert.equal(split('/pricing'), null);
  assert.equal(split('/apple/r'), null);
  assert.equal(slugOf('/app/signin'), null);
  assert.equal(slugOf('/app/the-studio/settings/agents'), 'the-studio');
});

test('EVERY TOP-LEVEL ROUTE AND STATIC FOLDER IS AN APP WORD, so none of them can be read as a record', () => {
  /* A route added tomorrow under `src/routes` and missing here would be read as a slug the day it shipped: `/app/usage`
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
  assert.equal(rerouted('/app/acme/r/tasks'), '/app/r/tasks');
  assert.equal(rerouted('/app/acme'), '/app/');
  assert.equal(rerouted('/app/acme/D41'), '/app/D41');
  /* Nothing to take out, so the router is told nothing and matches the address as it came. */
  assert.equal(rerouted('/app/r/tasks'), undefined);
  assert.equal(rerouted('/app/D41'), undefined);
});

test('the API is the named record under a slug and the session record without one', () => {
  assert.equal(apiBase(on('/app/acme/r/tasks')), 'https://brain.dog/app/acme');
  assert.equal(apiBase(on('/app/r/tasks')), 'https://brain.dog');
  assert.equal(apiBase(on('/app/signin')), 'https://brain.dog');
});

test('here is the address inside the record, which is what the rail compares its links against', () => {
  assert.equal(here('/app/acme/decide/SG31'), '/decide/SG31');
  assert.equal(here('/app/acme'), '/');
  assert.equal(here('/app/'), '/');
  assert.equal(here('/app/inbox'), '/inbox');
});

test('sign-in comes back to the address it was sent from, and never to one somewhere else', () => {
  assert.equal(signinFor({ pathname: '/app/acme/r/tasks', search: '?f=a' }), '/app/signin?next=%2Fapp%2Facme%2Fr%2Ftasks%3Ff%3Da');
  assert.equal(onward('?next=%2Fapp%2Facme%2Fr%2Ftasks'), '/app/acme/r/tasks');
  /* Off the app, off the origin, or nothing at all: the app's own front door. */
  for (const bad of ['?next=https%3A%2F%2Fevil.example%2F', '?next=%2F%2Fevil.example', '?next=%2Fpricing', '?next=%2Fapp%5C%5Cevil', '', '?next='])
    assert.equal(onward(bad), `${BASE}/`, bad);
});

/* THE SPELLING IS NOT THE ADDRESS. Each of these starts with `/app/` as typed, and each resolves on this origin outside
   the app (`loop/research-batch-forty-nine-audit.md` §8). Wave 50 caught them in `signin.ts` only, so `onward()` called
   on its own still handed back every one while its comment said a next that leaves the app is dropped. */
test('A NEXT IS JUDGED WHERE IT RESOLVES, so a dot segment however spelled cannot carry it out of the app', () => {
  for (const bad of ['/app/../auth/session', '/app/%2e%2e/api/export', '/app/%2E%2E/api/export', '/app/.%2e/in/x', '/app/..'])
    assert.equal(onward(`?${new URLSearchParams({ next: bad })}`), `${BASE}/`, bad);
  /* A TAB OR A NEWLINE IS DELETED BY THE PARSER BEFORE IT READS, so `/\t/[` is `//[` to it: a host, and not a valid one.
     `new URL` threw on it, and the sign-in page calls this before it reads its link, so the page died on arrival. */
  for (const bad of ['/\t/[', '/\n/evil.example', '/\r/evil.example/app/x'])
    assert.equal(onward(`?${new URLSearchParams({ next: bad })}`), `${BASE}/`, JSON.stringify(bad));
  /* One that resolves inside the app is followed as it resolves, so what is drawn is what the browser will open. */
  assert.equal(onward(`?${new URLSearchParams({ next: '/app/acme/../shop/./r/tasks?f=a#top' })}`), '/app/shop/r/tasks?f=a#top');
});

test('THE BASE HERE IS THE BASE THE BUILD WAS GIVEN, and the build lands where the Worker serves it from', async () => {
  /* A PATH IN A VARIABLE, so `svelte-check` does not ask for a declaration file for a config written in JavaScript. */
  const file = '../../svelte.config.js';
  const { default: config } = (await import(file)) as { default: { kit: { paths?: { base?: string }; appDir?: string } } };
  assert.equal(config.kit.paths?.base, BASE);
  /* `assets.directory` stays `../web/build` in the Worker's wrangler file, so `/app/_app/x.js` is `build/app/_app/x.js`. */
  assert.equal(config.kit.appDir ?? '_app', '_app');
});

/**
 * A 401 IS SENT TO SIGN-IN WHEREVER IT LANDS, slug or not (DIRECTION 26, `loop/research-no-sample.md` brief A2).
 *
 * `/app/` WITH NOBODY SIGNED IN WAS THE SAMPLE, and this test used to hold that it was left alone to draw it. The app
 * only ever shows a real record now, so the bare address asks for sign-in exactly as `/app/acme/` does, and `/start`
 * with it: it needs a record to install into, and a stranger has none.
 */
test('A 401 IS SENT TO SIGN-IN, UNDER A SLUG OR NOT, and only the three addresses with no record are spared', () => {
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/app/', search: '' }), '/app/signin?next=%2Fapp%2F');
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/app', search: '' }), '/app/signin?next=%2Fapp');
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/app/acme/r/tasks', search: '' }), '/app/signin?next=%2Fapp%2Facme%2Fr%2Ftasks');
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/app/r/tasks', search: '?f=a' }), '/app/signin?next=%2Fapp%2Fr%2Ftasks%3Ff%3Da');
  assert.equal(signInFirst('UNAUTHORIZED', { pathname: '/app/start', search: '' }), '/app/signin?next=%2Fapp%2Fstart');
  /* Any other refusal is the record's own sentence, drawn where it was asked, and so is a host nobody reached. */
  assert.equal(signInFirst('FORBIDDEN', { pathname: '/app/acme/', search: '' }), null);
  assert.equal(signInFirst('UNREACHABLE', { pathname: '/app/', search: '' }), null);
  /* And sign-in itself is never sent to sign-in, nor an invitation, nor a shared page, with a slug or without. */
  for (const pathname of ['/app/signin', '/app/acme/signin', '/app/invite', '/app/s/tok_1'])
    assert.equal(signInFirst('UNAUTHORIZED', { pathname, search: '' }), null, pathname);
});
