/**
 * `markRead()` IS THE ONE CALL SENT WITH `keepalive: true`, so the reader's mark still reaches the record when it is
 * stamped as the page goes away. A browser cancels a plain fetch of a page that is closing, and the mark was lost
 * with it: what was new stayed new on the next visit. Every other method is sent as it was.
 *
 * `fetch` is a stand-in. What a browser does with the flag when a tab closes is not held here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '../src/index.ts';

type Sent = { url: string; method: string; keepalive: boolean | undefined; body: string | undefined };

function recording(value: unknown = {}) {
  const seen: Sent[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method ?? 'GET',
      keepalive: init?.keepalive,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(JSON.stringify({ ok: true, value }));
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

const BASE = 'https://braindog.example/';

test('markRead() IS SENT WITH keepalive, with a cursor and with none', async () => {
  const net = recording({ upTo: 7, seen_at: null });
  const client = createClient({ base: BASE, fetch: net.fetch });

  assert.ok((await client.markRead()).ok);
  assert.ok((await client.markRead(7)).ok);
  assert.ok((await client.markRead('e.01J')).ok);

  assert.equal(net.seen.length, 3);
  for (const sent of net.seen) {
    assert.equal(sent.url, 'https://braindog.example/api/markRead');
    assert.equal(sent.method, 'POST');
    assert.equal(sent.keepalive, true);
  }
  assert.deepEqual(net.seen.map((s) => JSON.parse(s.body!)), [{}, { upTo: 7 }, { upTo: 'e.01J' }]);
});

test('markRead() KEEPS ITS BODY FAR UNDER THE 64 KB A BROWSER ALLOWS A keepalive REQUEST', async () => {
  const net = recording();
  await createClient({ base: BASE, fetch: net.fetch }).markRead('e.01JABCDEFGHJKMNPQRSTVWXYZ0');
  assert.ok(new TextEncoder().encode(net.seen[0]!.body!).length < 1024);
});

test('A MARK TOO LONG FOR keepalive GOES AS A PLAIN POST, never refused by the browser for its size', async () => {
  const net = recording();
  const out = await createClient({ base: BASE, fetch: net.fetch }).markRead('e.' + 'x'.repeat(70_000));
  assert.ok(out.ok);
  assert.equal(net.seen.length, 1);
  assert.equal(net.seen[0]!.method, 'POST');
  assert.notEqual(net.seen[0]!.keepalive, true);
});

test('NO OTHER METHOD IS SENT WITH keepalive', async () => {
  const net = recording();
  const client = createClient({ base: BASE, fetch: net.fetch }) as unknown as Record<string, unknown>;

  /* Every method the client has, each called with one plain object. Some refuse or throw on arguments that are not
     theirs before anything is sent; that is theirs to do, and what matters here is what does go out. */
  const reached = new Set<string>();
  let methods = 0;
  for (const [name, method] of Object.entries(client)) {
    if (typeof method !== 'function' || name === 'markRead') continue;
    methods += 1;
    const before = net.seen.length;
    try {
      await (method as (...args: unknown[]) => unknown)({ register: 'tasks', seq: 1, slug: 'a', rows: [], op_id: 'o' });
    } catch {
      /* Not this test's. */
    }
    if (net.seen.length > before) reached.add(name);
  }

  const kept = net.seen.filter((s) => s.keepalive !== undefined);
  assert.deepEqual(kept, []);
  assert.ok(!net.seen.some((s) => s.url.endsWith('/api/markRead')));
  /* The loop is worth something only if it reached the network: writes, reads and the host's own doors. */
  assert.ok(methods > 50, `only ${methods} methods found`);
  assert.ok(reached.size > 50, `only ${reached.size} of ${methods} methods sent anything`);
  assert.ok(net.seen.some((s) => s.method === 'POST') && net.seen.some((s) => s.method === 'GET'));
  for (const door of ['capture', 'log', 'pagesCensus']) assert.ok(reached.has(door), `${door} sent nothing`);
});
