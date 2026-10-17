/**
 * `POST /api/seen` (`src/seen.ts`): the pages and the places a visit is counted under, held to the site's own list, and
 * the door that answers 204 to everything and counts only a same-origin visit from the public host with counting on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEEN_CAME, SEEN_PAGES, SITE_PAGES, cameOf, pageOf, sectionOf, seenDoor, servesSeen, type SeenDeps } from '../src/seen.ts';

const HOST = 'example.dog';

/* THE SITE'S LIST, BY A WIDENED DYNAMIC IMPORT. A static one would put the site's Vite-only `import.meta.glob` into this
   program's typecheck; under plain Node `nav.ts` counts every place as live, which is the list this file wants. */
const navAt = '../../site/src/lib/nav.ts' as string;
const nav = (await import(navAt)) as { PAGES: readonly { path: string }[]; reachable: (launch: { public: boolean }) => readonly { path: string }[] };

test('the sections counted from are the site\'s, home and every place it may reach on the public day, both ways', () => {
  const top = (path: string): string => (path === '/' ? '/' : `/${path.split('/')[1] ?? ''}`);
  const site = new Set(['/', ...nav.reachable({ public: true }).map((p) => top(p.path))]);
  assert.deepEqual([...SITE_PAGES].sort(), [...site].sort());
  for (const page of nav.PAGES) assert.notEqual(pageOf(page.path), null, `${page.path} is a page the site draws today`);
});

test('every page of the site has its section on the Directory\'s closed list', () => {
  for (const page of SITE_PAGES) assert.ok((SEEN_PAGES as readonly string[]).includes(sectionOf(page)), `${page} is kept as ${sectionOf(page)}`);
});

test('a path counts under its section, and nothing else counts', () => {
  assert.equal(pageOf('/'), 'home');
  assert.equal(pageOf('/pricing'), 'pricing');
  assert.equal(pageOf('/pricing/'), 'pricing');
  assert.equal(pageOf('/docs/agents/connect'), 'docs');
  assert.equal(pageOf('/legal/terms'), 'legal');
  assert.equal(pageOf('/for/teams'), 'for');
  for (const path of ['', 'pricing', '/pricingx', '/nope', '/build', '/app/', '/pricing?x=1', '/docs#a', '/a\\b', '/a b', `/${'d'.repeat(300)}`, 7, null, undefined])
    assert.equal(pageOf(path), null, String(path));
});

test('where a visit came from is a closed list, by host and never more', () => {
  assert.equal(cameOf(undefined, HOST), 'direct');
  assert.equal(cameOf('', HOST), 'direct');
  assert.equal(cameOf(HOST, HOST), 'site');
  assert.equal(cameOf(`app.${HOST}`, HOST), 'site');
  assert.equal(cameOf('www.google.com', HOST), 'search');
  assert.equal(cameOf('google.co.uk', HOST), 'search');
  assert.equal(cameOf('duckduckgo.com', HOST), 'search');
  assert.equal(cameOf('News.YCombinator.com', HOST), 'hacker-news');
  assert.equal(cameOf('t.co', HOST), 'x');
  assert.equal(cameOf('notgoogle.com', HOST), 'other');
  assert.equal(cameOf('https://www.google.com/search?q=x', HOST), 'other');
  assert.equal(cameOf(42, HOST), 'other');
  for (const host of ['www.google.com', 'bing.com', 'claude.ai', 'github.com', 'unknown.example', '', HOST])
    assert.ok((SEEN_CAME as readonly string[]).includes(cameOf(host, HOST)));
});

test('the door is /api/seen and nothing near it', () => {
  for (const path of ['/api/seen', '//api//seen/', '/api/seen/']) assert.ok(servesSeen(path), path);
  for (const path of ['/api/seenx', '/api/seen/1', '/seen', '/api/push/key']) assert.ok(!servesSeen(path), path);
});

const deps = (over: Partial<SeenDeps> = {}): SeenDeps & { counted: unknown[]; limited: number } => {
  const out = {
    counted: [] as unknown[],
    limited: 0,
    on: true,
    host: HOST,
    limit: async () => {
      out.limited += 1;
      return null;
    },
    count: async (call: unknown) => {
      out.counted.push(call);
      return { ok: true };
    },
    ...over,
  };
  return out;
};

const visit = (body: unknown, headers: Record<string, string> = {}, method = 'POST'): Request =>
  new Request(`https://${HOST}/api/seen`, {
    method,
    headers: { origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain', ...headers },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });

test('a same-origin visit from the public host is counted once, by page and place only', async () => {
  const d = deps();
  const out = await seenDoor(visit({ p: '/docs/agents', r: 'www.google.com', ua: 'kept nowhere' }, { cookie: 'bd_in=1' }), d);
  assert.equal(out.status, 204);
  assert.equal(await out.text(), '');
  assert.equal(out.headers.get('set-cookie'), null);
  assert.deepEqual(d.counted, [{ flow: 'seen.count', page: 'docs', came: 'search' }]);
});

test('every other visit is the same 204 and counts nothing', async () => {
  const cases: [string, Request, Partial<SeenDeps>][] = [
    ['counting off', visit({ p: '/' }), { on: false }],
    ['no public host', visit({ p: '/' }), { host: '' }],
    ['a GET', visit(null, {}, 'GET'), {}],
    ['another origin', visit({ p: '/' }, { origin: 'https://elsewhere.example' }), {}],
    ['no origin', new Request(`https://${HOST}/api/seen`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: '{"p":"/"}' }), {}],
    ['cross-site', visit({ p: '/' }, { 'sec-fetch-site': 'cross-site' }), {}],
    ['over the limit', visit({ p: '/' }), { limit: async () => new Response(null, { status: 429 }) }],
    ['not JSON', visit('p=/'), {}],
    ['an array', visit(['/']), {}],
    ['a page the site does not have', visit({ p: '/admin' }), {}],
    ['too long a body', visit({ p: '/', pad: 'x'.repeat(2_000) }), {}],
  ];
  for (const [name, request, over] of cases) {
    const d = deps(over);
    const out = await seenDoor(request, d);
    assert.equal(out.status, 204, name);
    assert.deepEqual(d.counted, [], name);
  }
});

test('counting off reads nothing, not even the limit', async () => {
  const d = deps({ on: false });
  await seenDoor(visit({ p: '/' }), d);
  assert.equal(d.limited, 0);
});

test('a Directory that fails is still a 204', async () => {
  const out = await seenDoor(visit({ p: '/' }), deps({ count: async () => Promise.reject(new Error('down')) }));
  assert.equal(out.status, 204);
});
