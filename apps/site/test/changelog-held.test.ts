/**
 * The changelog is held until the site is public, since W.170, because the site was not deployed publicly yet,
 * and the packs with it since the site's design ("Packs and the changelog stay
 * held"). One flag, `LAUNCH.public` in `src/lib/launch.ts`, shows them on the day.
 *
 * EVERY HALF IS ASKED UNDER BOTH FLAGS, with a copy of the flags passed in and `launch.ts` never edited: the header
 * and the footer read `reachable`, the page answers through `_load` and the feed through `_feed`. Held, the place is
 * gone and both answer not found; shown, the place is back and both answer.
 *
 * THE BUILD IS READ ONLY WHERE IT WAS JUST MADE (`SITE_BUILT=1`, `ci.yml`'s build job), because a build left on a
 * desk may come from a day the flag stood the other way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { isHttpError } from '@sveltejs/kit';

import { HELD, LAUNCH, held } from '../src/lib/launch.ts';
import { reachable, LIVE, PAGES, PLACES } from '../src/lib/nav.ts';
import { _load } from '../src/routes/changelog/+page.ts';
import { _feed } from '../src/routes/changelog.xml/+server.ts';
import { ENTRIES } from '../src/routes/changelog/entries.ts';
import { BUILD, STRICT, WHERE } from './built.ts';

/* THE PACKS' SERVER LOADS NAME `$lib`, which only Vite knows: under plain Node it is `src/lib/`, so the two loads are
   imported here as the build imports them. Their `./$types` imports are types only and are stripped. */
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('$lib/')) return next(new URL(`../src/lib/${specifier.slice(5)}`, import.meta.url).href, context);
    return next(specifier, context);
  },
});
const packsPage = await import('../src/routes/packs/+page.server.ts');
const packPage = await import('../src/routes/packs/[id]/+page.server.ts');

const OFF = { ...LAUNCH, public: false };
const ON = { ...LAUNCH, public: true };

/** The status `_load` answers with under these flags: 200 when it returns, the error's status when it throws. */
const pageStatus = (launch: { public: boolean }): number => {
  try {
    _load(launch);
    return 200;
  } catch (e) {
    if (isHttpError(e)) return e.status;
    throw e;
  }
};

test('the flag is off until the owner flips it, and it holds the page and its feed', () => {
  assert.equal(LAUNCH.public, false, "LAUNCH.public is on: that is the owner's choice, not a build");
  assert.equal(held(), true);
  /* The pricing page came back on 20 October as the early access page, three of the pages for one kind of person
     went, and the teams page went while inviting people is held (22 October). */
  assert.deepEqual([...HELD], ['/changelog', '/changelog.xml', '/packs', '/download', '/for/personal', '/for/students', '/for/new-projects']);
});

test('with the flag off the header, the footer, the 404 and the sitemap hold no changelog place', () => {
  const off = reachable(OFF).map((p) => p.path);
  assert.ok(!off.includes('/changelog'), 'the changelog is still a place with the flag off');
  assert.ok(!reachable(OFF).some((p) => p.header && p.path === '/changelog'), 'the header still names the changelog');
  /* What the shell and the sitemap read today, under the flag as it stands. */
  assert.ok(!LIVE.some((p) => p.path === '/changelog'), 'LIVE names the changelog while it is held');
  assert.ok(!PAGES.some((p) => p.path === '/changelog'), 'PAGES, which the 404 and the sitemap read, names the changelog');
  /* Nothing else is held: every other place stays. */
  assert.deepEqual(off, PLACES.map((p) => p.path).filter((path) => !(HELD as readonly string[]).includes(path)));
});

test('with a copy of the flag on the changelog is back in the header, in its old place', () => {
  const on = reachable(ON);
  const place = on.find((p) => p.path === '/changelog');
  assert.ok(place, 'the changelog is not a place with the flag on');
  assert.equal(place.header, true, 'the changelog is not in the header with the flag on');
  assert.deepEqual(on.map((p) => p.path), PLACES.map((p) => p.path));
});

test('with the flag off the page answers not found, and with it on the page answers', () => {
  assert.equal(pageStatus(OFF), 404);
  assert.equal(pageStatus(ON), 200);
});

test('with the flag off the feed answers not found, and with it on the feed is the Atom document', async () => {
  const off = _feed(OFF);
  assert.equal(off.status, 404);
  assert.ok(!(await off.text()).includes('<feed'), 'the held feed still carries the entries');

  const on = _feed(ON);
  assert.equal(on.status, 200);
  assert.match(on.headers.get('content-type') ?? '', /application\/atom\+xml/);
  const xml = await on.text();
  assert.ok(xml.includes('<feed xmlns="http://www.w3.org/2005/Atom">'), 'the shown feed is not an Atom document');
  assert.equal(xml.split('<entry>').length - 1, ENTRIES.length, 'the shown feed does not carry every entry');
});

test('with the flag off the packs are no place: not in the header, the footer, the 404 or the sitemap', () => {
  assert.ok(!reachable(OFF).some((p) => p.path === '/packs'), 'the packs are still a place with the flag off');
  assert.ok(!LIVE.some((p) => p.path === '/packs'), 'LIVE names the packs while they are held');
  assert.ok(!PAGES.some((p) => p.path === '/packs'), 'PAGES, which the 404 and the sitemap read, names the packs');
});

test('with a copy of the flag on the packs are back as a place, and never in the header row', () => {
  const place = reachable(ON).find((p) => p.path === '/packs');
  assert.ok(place, 'the packs are not a place with the flag on');
  assert.equal(place.header, false, 'the packs left the header row with the site design');
});

test('while held, /packs answers not found and no page is made for any one pack', async () => {
  assert.equal(held(), true);
  await assert.rejects(
    async () => packsPage.load({} as never),
    (e: unknown) => isHttpError(e) && e.status === 404,
    '/packs still answers while it is held',
  );
  assert.deepEqual(await packPage.entries(), [], 'a page for one pack is still prerendered while /packs is held');
});

test('the source is kept while the page is held', () => {
  assert.ok(ENTRIES.length > 0, 'entries.ts is empty: holding the page keeps its entries');
});

test(
  'a build made with the flag as it stands writes the changelog, its feed and the packs only when the site is public',
  STRICT ? {} : { skip: 'reads the build only under SITE_BUILT=1, where it was just made from this tree' },
  () => {
    for (const file of ['changelog.html', 'changelog.xml', 'packs.html']) {
      const there = existsSync(new URL(file, BUILD));
      if (held()) assert.ok(!there, `${WHERE} holds ${file} while the changelog is held, so brain.dog would show it`);
      else assert.ok(there, `${WHERE} holds no ${file}, and LAUNCH.public is on`);
    }
  },
);
