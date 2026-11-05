/**
 * What the Worker's adapter holds that the platform does not.
 *
 * ONE ADAPTER'S RESOLVED `PrivateRange` IS THE OTHER'S PLATFORM. Cloudflare will not route a Worker's `fetch` to a
 * private address, so this file asserts the three names left, and a host WRITTEN as a private address, which the
 * Worker can see for itself. `47 §5.1` turns each into a different repair.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { httpFor, OVER, textWithin } from '../src/http.ts';
import type { Send } from '../src/actions.ts';

const AT = new URL('https://api.example.com/v1/things');
const INIT = { method: 'GET' as const, headers: { accept: 'application/json' }, timeoutMs: 1_000 };

const named = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.name : 'not an Error';
  }
  throw new assert.AssertionError({ message: 'nothing was refused, and a refusal was wanted' });
};

test('a redirect is asked for manually and comes back intact', async () => {
  const seen: RequestInit[] = [];
  const send: Send = (_url, init) => {
    seen.push(init);
    return Promise.resolve(new Response(null, { status: 301, headers: { location: 'https://evil.example/' } }));
  };
  const res = await httpFor(send).fetch(AT, INIT);

  assert.equal(seen[0]?.redirect, 'manual');
  assert.equal(res.status, 301);
});

test('a body past two megabytes is refused as it streams', async () => {
  const send: Send = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(200_000)); } }),
        { status: 200, headers: { 'content-length': '900' } },
      ),
    );
  assert.equal(await named(() => httpFor(send).fetch(AT, INIT)), 'TooLarge');
});

test('nothing answering is a timeout, and anything else is the network', async () => {
  const hangs: Send = (_url, init) =>
    new Promise((_r, reject) => { init.signal?.addEventListener('abort', () => { reject(new Error('aborted')); }); });
  assert.equal(await named(() => httpFor(hangs).fetch(AT, { ...INIT, timeoutMs: 20 })), 'Timeout');

  const breaks: Send = () => Promise.reject(new Error('ECONNRESET'));
  assert.equal(await named(() => httpFor(breaks).fetch(AT, INIT)), 'Network');
});

test('a body under the cap comes through whole', async () => {
  const send: Send = () => Promise.resolve(new Response('{"items":[1,2,3]}', { status: 200 }));
  const res = await httpFor(send).fetch(AT, INIT);
  assert.equal(await res.text(), '{"items":[1,2,3]}');
});

test('A HOST WRITTEN AS A PRIVATE ADDRESS IS REFUSED BEFORE THE PLATFORM IS ASKED, in every spelling', async () => {
  for (const at of ['https://169.254.169.254/latest', 'https://127.0.0.1/', 'https://2130706433/', 'https://[::ffff:7f00:1]/', 'https://metadata.google.internal/', 'https://foo.localhost/']) {
    let sent = 0;
    const http = httpFor(async () => (sent++, new Response('')));
    await assert.rejects(http.fetch(new URL(at), { method: 'GET', headers: {}, timeoutMs: 1000 }), (e: Error) => e.name === 'PrivateRange', at);
    assert.equal(sent, 0, `${at} was sent`);
  }
});

test('WHAT A SCRIPT POSTS IS READ UP TO THE CAP AND NO FURTHER', async () => {
  const post = (body: string | ReadableStream<Uint8Array>): Request => new Request('https://a.example/', { method: 'POST', body });
  assert.equal(await textWithin(post('héllo'), 100), 'héllo');
  assert.equal(await textWithin(post('x'.repeat(101)), 100), OVER);
  let pulled = 0;
  const endless = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1_000)); } });
  assert.equal(await textWithin(new Request('https://a.example/', { method: 'POST', body: endless, duplex: 'half' } as RequestInit), 2_000), OVER);
  assert.ok(pulled < 10, `it kept reading: ${pulled} pulls`);
});

test("THE GATEWAY'S LOG LINE HOLDS NONE OF A SCRIPT'S WORDS: a refusal quotes the URL it wrote, and a URL can carry a row", () => {
  const source = readFileSync(new URL('../src/script.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.\w+\([^)]*reply\.error/u);
});
