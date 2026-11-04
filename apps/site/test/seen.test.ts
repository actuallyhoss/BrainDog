/**
 * The visit count, read at the source with no build: `/seen.js` and `src/lib/site/seen.ts` say the same thing, it sends
 * nothing under Global Privacy Control, and `PAGES` is every page the route tree serves (batch 103b, LAUNCH 103 job 9).
 *
 *   node --test apps/site/test/seen.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { HELD } from '../src/lib/launch.ts';
import { PAGES, SEEN, SEEN_INIT, cameFrom, seenBody } from '../src/lib/site/seen.ts';

const SCRIPT = readFileSync(new URL('../static/seen.js', import.meta.url), 'utf8');

type Sent = { url: string; init: Record<string, unknown> };

/** What `/seen.js` sends on a page at `pathname`, opened from `referrer`, in a browser that does or does not say GPC. */
const run = (pathname: string, referrer: string, gpc?: boolean): Sent[] => {
  const sent: Sent[] = [];
  const fetch = (url: string, init: Record<string, unknown>) => {
    sent.push({ url, init });
    return Promise.resolve();
  };
  runInNewContext(SCRIPT, {
    URL,
    JSON,
    fetch,
    location: { pathname },
    document: { referrer },
    navigator: gpc === undefined ? {} : { globalPrivacyControl: gpc },
  });
  return sent;
};

const VISITS: [string, string][] = [
  ['/', ''],
  ['/pricing', 'https://www.example.com/search?q=memory'],
  ['/agents', 'https://news.example.org/item/42#top'],
  ['/docs/start/connect', 'http://localhost:5173/'],
  ['/slash', 'not a url'],
];

test('/seen.js and seenBody send the same path and came-from host on every visit', () => {
  for (const [pathname, referrer] of VISITS) {
    const sent = run(pathname, referrer);
    assert.equal(sent.length, 1, `/seen.js sent ${sent.length} requests for ${pathname}`);
    assert.equal(sent[0]?.url, SEEN);
    assert.equal(sent[0]?.init.body, seenBody(pathname, referrer), `the two disagree on ${pathname} from ${referrer}`);
  }
});

test('/seen.js makes the request SEEN_INIT says: POST, kept alive, no cookie, a simple request', () => {
  const { body, ...init } = run('/', '')[0]?.init ?? {};
  assert.equal(typeof body, 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(init)), JSON.parse(JSON.stringify(SEEN_INIT)));
});

test('the came-from is the host alone, never the path, the query or the fragment', () => {
  assert.equal(cameFrom('https://www.example.com/search?q=memory#a'), 'www.example.com');
  assert.equal(cameFrom(''), '');
  assert.equal(cameFrom('not a url'), '');
  assert.deepEqual(JSON.parse(seenBody('/pricing', 'https://a.example.com/x?y=1')), { p: '/pricing', r: 'a.example.com' });
});

test('under Global Privacy Control /seen.js sends nothing at all', () => {
  assert.deepEqual(run('/', 'https://www.example.com/', true), []);
  assert.equal(run('/', '', false).length, 1, 'a browser that says GPC is off is still counted');
});

test('/seen.js imports nothing, reads no cookie and sends no identifier of the browser', () => {
  assert.ok(!/\bimport\b|\bexport\b/.test(SCRIPT), 'seen.js is a plain script');
  const code = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const word of ['document.cookie', 'userAgent', 'language', 'screen', 'localStorage', 'sessionStorage', 'location.href', 'location.search', 'sendBeacon']) {
    assert.ok(!code.includes(word), `seen.js reads ${word}`);
  }
});

/**
 * The pages the route tree serves: each `+page.svelte`, cut at its first dynamic segment, less the 404 page and the
 * held. A page beneath a held address is held with it: `/plugins/by/<who>` prerenders nothing while `/plugins` is held.
 */
const served = (): string[] => {
  const routes = new URL('../src/routes/', import.meta.url);
  const out = new Set<string>();
  for (const file of readdirSync(routes, { recursive: true }) as string[]) {
    const parts = file.split(/[\\/]/);
    if (parts.at(-1) !== '+page.svelte') continue;
    const dirs = parts.slice(0, -1).filter((d) => !/^\(.*\)$/.test(d));
    const cut = dirs.findIndex((d) => d.startsWith('['));
    const path = `/${(cut === -1 ? dirs : dirs.slice(0, cut)).join('/')}`;
    if (path === '/404' || HELD.some((held) => path === held || path.startsWith(`${held}/`))) continue;
    out.add(path);
  }
  return [...out].sort();
};

test('PAGES is every page the site serves, so the count names each one and nothing else', () => {
  assert.deepEqual([...PAGES].sort(), served());
});
