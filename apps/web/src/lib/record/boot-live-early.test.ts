/**
 * The shell's one request goes out as the page parses: `app.html` asks for `boot` beside the first chunks, at
 * the address the app will ask, and `readBoot` takes that answer once and only for that address.
 *
 * THE TEMPLATE GUESSES THE RECORD BY THE APP'S OWN RULE (`split` in `lib/at.ts`), written again in a line of script that
 * has no module to import. This holds the two to one rule: the same words, the same slug pattern, the same handle
 * pattern, and the same answer for every address below.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { APP_WORDS, apiBase } from '../at.ts';
import { forget, readBoot, type Fetch } from './boot-live.ts';

const TEMPLATE = readFileSync(fileURLToPath(new URL('../../app.html', import.meta.url)), 'utf8');
/** The early script itself: the one that names `__bdBoot`. */
const SCRIPT = [...TEMPLATE.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((m) => m[1]!).find((s) => s.includes('__bdBoot')) ?? '';

test('the template asks for boot early, and knows the app’s own words as `APP_WORDS` does', () => {
  assert.ok(SCRIPT !== '', 'app.html no longer asks for boot before the app arrives');
  const words = /'( [a-z_ -]+ )'\.indexOf/u.exec(SCRIPT)?.[1]?.trim().split(' ') ?? [];
  assert.deepEqual([...words].sort(), [...APP_WORDS].sort(), "the template's words drifted from APP_WORDS");
});

/** The address the template asks at, by running its own line against a `location` and a `fetch` handed in. */
function asked(pathname: string): string {
  const origin = 'https://brain.dog';
  const seen: string[] = [];
  const window: Record<string, unknown> = {};
  const fetch = (url: string) => {
    seen.push(url);
    return Promise.resolve(new Response('{}'));
  };
  new Function('location', 'window', 'fetch', SCRIPT)({ pathname, origin }, window, fetch);
  return seen[0] ?? '';
}

test('it asks at the address the app asks at, for a record, a bare address and the app’s own screens', () => {
  for (const path of ['/acme', '/acme/', '/acme/decide', '/', '/', '/decide', '/d41', '/start', '/elsewhere']) {
    const url = new URL(`https://brain.dog${path}`);
    assert.equal(asked(path), `${apiBase(url)}/api/boot`, path);
  }
});

test('NOTHING IS ASKED ON SIGN-IN OR SIGN-UP, where a stranger has no record to read (first hour audit, E14)', () => {
  for (const path of ['/signin', '/signup', '/acme/signin', '/signin/desktop']) assert.equal(asked(path), '', path);
});

test('readBoot takes the early answer once, and only at the address it was asked at', async () => {
  const BASE = 'https://brain.dog/acme';
  const value = { registers: [], now: '2026-10-08T09:00:00.000Z', home: null };
  const body = () => new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  const held = globalThis as { __bdBoot?: unknown; fetch: typeof globalThis.fetch };
  const real = held.fetch;
  const network: string[] = [];
  held.fetch = (async (url: string | URL | Request) => (network.push(String(url)), body())) as typeof globalThis.fetch;
  try {
    /* AT ANOTHER ADDRESS IT IS LEFT UNREAD, and the app asks the network as it always did. */
    forget();
    held.__bdBoot = { url: 'https://brain.dog/kiln/api/boot', at: Promise.resolve(body()) };
    assert.equal((await readBoot(BASE)).from, 'live');
    assert.deepEqual(network, [`${BASE}/api/boot`]);

    /* AT ITS OWN ADDRESS IT IS THE ANSWER, and nothing goes to the network. */
    forget();
    network.length = 0;
    held.__bdBoot = { url: `${BASE}/api/boot`, at: Promise.resolve(body()) };
    assert.equal((await readBoot(BASE)).from, 'live');
    assert.deepEqual(network, []);
    assert.equal(held.__bdBoot, undefined, 'the early answer was kept to be read twice');

    /* A CALLER HANDING ITS OWN FETCH (a test, the gates) never takes it. */
    forget();
    held.__bdBoot = { url: `${BASE}/api/boot`, at: Promise.resolve(body()) };
    const sent: string[] = [];
    await readBoot(BASE, (async (url: string | URL | Request) => (sent.push(String(url)), body())) as Fetch);
    assert.deepEqual(sent, [`${BASE}/api/boot`]);
  } finally {
    held.fetch = real;
    held.__bdBoot = undefined;
    forget();
  }
});

/** Every address the template asks at, in order. */
function everyAsked(pathname: string): string[] {
  const seen: string[] = [];
  const fetch = (url: string) => (seen.push(url), Promise.resolve(new Response('{}')));
  new Function('location', 'window', 'fetch', SCRIPT)({ pathname, origin: 'https://brain.dog' }, {}, fetch);
  return seen;
}

test('and beside boot it asks every list the reader may read, at the same address, boot first', () => {
  /* AND TODAY ON TODAY (c52df9b85), A PAGE ON ITS OWN ADDRESS (`page` with `shape`), and on any other screen only those two. */
  for (const [path, after] of [
    ['/acme', ['/api/today']],
    ['/acme/p/kiln', ['/api/page?slug=kiln&shape=1']],
    ['/', ['/api/today']],
    ['/decide', []],
  ] as const) {
    const base = apiBase(new URL(`https://brain.dog${path}`));
    assert.deepEqual(everyAsked(path), [`${base}/api/boot`, `${base}/api/schemas?every=true`, ...after.map((a) => `${base}${a}`)], path);
  }
});

test('firstOpen hands the early declarations to the client once, and only at the address they were asked at', async () => {
  const { firstOpen } = await import('./boot-live.ts');
  const { batchSchemas, createClient, forgetSchemas } = await import('@braindog/client');
  const BASE = 'https://brain.dog/acme';
  const held = globalThis as { __bdSchemas?: unknown };
  const lists = { tasks: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text' }] } };
  const early = () => Promise.resolve(new Response(JSON.stringify({ ok: true, value: { lists, refused: {}, blocks: {} } }), { status: 200 }));
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => (sent.push(String(url)), new Response(JSON.stringify({ ok: true, value: { ...lists.tasks, blocks: {} } })))) as typeof globalThis.fetch;
  try {
    forgetSchemas();
    held.__bdSchemas = { url: 'https://brain.dog/kiln/api/schemas?every=true', at: early() };
    firstOpen(BASE);
    assert.notEqual(held.__bdSchemas, undefined, 'another address took it');
    held.__bdSchemas = { url: `${BASE}/api/schemas?every=true`, at: early() };
    firstOpen(BASE);
    assert.equal(held.__bdSchemas, undefined, 'kept to be read twice');
    /* A CLIENT WITH A FETCH OF ITS OWN KEEPS ITS OWN STORE and still takes them, so nothing goes out for tasks. */
    const out = await createClient({ base: BASE, fetch: io }).schema('tasks');
    assert.equal(out.ok, true);
    assert.deepEqual(sent, []);
  } finally {
    held.__bdSchemas = undefined;
    batchSchemas(false);
    forgetSchemas();
  }
});

test('A PAGE OPENED BY ITS ADDRESS IS ASKED BESIDE BOOT, as its reader asks it first, and nothing else is (speed-d SD2)', () => {
  const left = (pathname: string, search = ''): unknown => {
    const window: Record<string, unknown> = {};
    const fetch = () => Promise.resolve(new Response('{}'));
    new Function('location', 'window', 'fetch', SCRIPT)({ pathname, origin: 'https://brain.dog', search }, window, fetch);
    return (window.__bdPage as { url?: unknown } | undefined)?.url;
  };
  assert.equal(left('/acme/p/money'), 'https://brain.dog/acme/api/page?slug=money&shape=1');
  assert.equal(left('/p/work'), 'https://brain.dog/api/page?slug=work&shape=1');
  for (const [path, search] of [['/acme/p/money', '?src=1'], ['/acme/p/money/x', ''], ['/acme/p', ''], ['/acme', ''], ['/signin', '']] as const)
    assert.equal(left(path, search), undefined, `${path}${search}`);
});
