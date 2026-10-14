/**
 * The changelog is held until the site is public, his word on W.170: "we didnt even deploy publically yet. remove
 * those changelog". One flag, `LAUNCH.public` in `src/lib/launch.ts`, shows the page and its feed on the day.
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
import { isHttpError } from '@sveltejs/kit';

import { HELD, LAUNCH, held } from '../src/lib/launch.ts';
import { reachable, LIVE, PAGES, PLACES } from '../src/lib/nav.ts';
import { _load } from '../src/routes/changelog/+page.ts';
import { _feed } from '../src/routes/changelog.xml/+server.ts';
import { ENTRIES } from '../src/routes/changelog/entries.ts';
import { BUILD, STRICT, WHERE } from './built.ts';

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
  assert.equal(LAUNCH.public, false, 'LAUNCH.public is on: that is his word to give (LCH-A20), not a build');
  assert.equal(held(), true);
  assert.deepEqual([...HELD], ['/changelog', '/changelog.xml']);
});

test('with the flag off the header, the footer, the 404 and the sitemap hold no changelog place', () => {
  const off = reachable(OFF).map((p) => p.path);
  assert.ok(!off.includes('/changelog'), 'the changelog is still a place with the flag off');
  assert.ok(!reachable(OFF).some((p) => p.header && p.path === '/changelog'), 'the header still names the changelog');
  /* What the shell and the sitemap read today, under the flag as it stands. */
  assert.ok(!LIVE.some((p) => p.path === '/changelog'), 'LIVE names the changelog while it is held');
  assert.ok(!PAGES.some((p) => p.path === '/changelog'), 'PAGES, which the 404 and the sitemap read, names the changelog');
  /* Nothing else is held: every other place stays. */
  assert.deepEqual(off, PLACES.map((p) => p.path).filter((path) => path !== '/changelog'));
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

test('the source is kept while the page is held', () => {
  assert.ok(ENTRIES.length > 0, 'entries.ts is empty: holding the page keeps its entries');
});

test(
  'a build made with the flag as it stands writes the changelog and its feed only when the site is public',
  STRICT ? {} : { skip: 'reads the build only under SITE_BUILT=1, where it was just made from this tree' },
  () => {
    for (const file of ['changelog.html', 'changelog.xml']) {
      const there = existsSync(new URL(file, BUILD));
      if (held()) assert.ok(!there, `${WHERE} holds ${file} while the changelog is held, so brain.dog would show it`);
      else assert.ok(there, `${WHERE} holds no ${file}, and LAUNCH.public is on`);
    }
  },
);
