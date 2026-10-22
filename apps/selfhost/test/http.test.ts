/**
 * The four constraints the `Http` adapter holds, each asserted by the name it refuses with.
 *
 * THE NAME IS THE TEST. `47 §5.1` maps the four onto three codes and three different repairs, so
 * an adapter that refused a private address with a `Network` would have a connector retried on a
 * ladder for a week for an SSRF attempt, and it would look like a provider having a bad day the
 * whole time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { httpFor } from '../src/http.ts';
import type { Resolve, Send } from '../src/actions.ts';

const URL_OK = new URL('https://api.example.com/v1/things');
const INIT = { method: 'GET' as const, headers: { accept: 'application/json' }, timeoutMs: 1_000 };

const resolving = (address: string): Resolve => () => Promise.resolve([{ address, family: 4 as const }]);
const PUBLIC = resolving('93.184.216.34');

const named = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.name : 'not an Error';
  }
  throw new assert.AssertionError({ message: 'nothing was refused, and a refusal was wanted' });
};

test('a name that resolves to a private address is refused before anything is sent', async () => {
  let sent = false;
  const send: Send = () => { sent = true; return Promise.resolve(new Response('{}')); };
  const http = httpFor({ send, resolve: resolving('127.0.0.1') });

  assert.equal(await named(() => http.fetch(URL_OK, INIT)), 'PrivateRange');
  assert.equal(sent, false, 'the socket was opened to a private address');
});

test('the socket connects to the address that was checked and to no other', async () => {
  const seen: string[] = [];
  const send: Send = (_url, _init, pinned) => {
    seen.push(pinned.address);
    return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
  };
  const res = await httpFor({ send, resolve: PUBLIC }).fetch(URL_OK, INIT);

  assert.equal(res.status, 200);
  assert.deepEqual(seen, ['93.184.216.34']);
  assert.equal(await res.text(), '{"ok":true}');
});

test('a body past two megabytes is refused as it streams, whatever the header claimed', async () => {
  const send: Send = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) { controller.enqueue(new Uint8Array(200_000)); },
        }),
        { status: 200, headers: { 'content-length': '900' } },
      ),
    );

  assert.equal(await named(() => httpFor({ send, resolve: PUBLIC }).fetch(URL_OK, INIT)), 'TooLarge');
});

test('a transport that never answers is a timeout and not a network fault', async () => {
  const send: Send = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { reject(new Error('aborted')); });
    });

  assert.equal(await named(() => httpFor({ send, resolve: PUBLIC }).fetch(URL_OK, { ...INIT, timeoutMs: 20 })), 'Timeout');
});

test('anything else the transport throws is the network', async () => {
  const send: Send = () => Promise.reject(new Error('ECONNRESET'));
  assert.equal(await named(() => httpFor({ send, resolve: PUBLIC }).fetch(URL_OK, INIT)), 'Network');
});

test('a redirect comes back intact rather than being followed', async () => {
  const send: Send = () => Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
  const res = await httpFor({ send, resolve: PUBLIC }).fetch(URL_OK, INIT);

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://evil.example/');
});

test('a scheme other than https is this build being wrong and not a provider being wrong', async () => {
  const http = httpFor({ send: () => Promise.resolve(new Response('{}')), resolve: PUBLIC });
  assert.equal(await named(() => http.fetch(new URL('http://api.example.com/v1'), INIT)), 'Error');
});
