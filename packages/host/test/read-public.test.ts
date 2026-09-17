/**
 * Reading a shared use-case file from an address on the host (`readPublic`): what it reads from a public-looking address,
 * and what it refuses to read at all. The network is a test double; nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PUBLIC_MOST_BYTES, readPublic } from '../src/actions.ts';

const FILE = JSON.stringify({ usecase: 'study', version: '1.0.1' });

/** A web that answers from a table of addresses, and remembers every request it was sent. */
function web(pages: Record<string, () => Response>) {
  const sent: { url: string; init: RequestInit }[] = [];
  const send = async (input: URL, init: RequestInit) => {
    sent.push({ url: input.href, init });
    const page = pages[input.href];
    return page ? page() : new Response('not here', { status: 404 });
  };
  return { sent, send };
}

test('A PUBLIC ADDRESS IS READ, WITH NOTHING OF THE RECORD SENT, AND A SAME-SITE OR CROSS-SITE REDIRECT IS FOLLOWED', async () => {
  const net = web({
    'https://files.example.org/study.usecase.json': () => new Response(FILE, { status: 200, headers: { 'content-type': 'application/json' } }),
    'https://short.example.net/s': () => new Response(null, { status: 302, headers: { location: 'https://files.example.org/study.usecase.json' } }),
  });
  const read = readPublic({ send: net.send });
  assert.deepEqual(await read('https://files.example.org/study.usecase.json'), { ok: true, text: FILE, bytes: FILE.length });
  assert.deepEqual(await read('https://short.example.net/s'), { ok: true, text: FILE, bytes: FILE.length });
  for (const { init } of net.sent) {
    const headers = new Headers(init.headers);
    assert.equal(headers.get('authorization'), null);
    assert.equal(headers.get('cookie'), null);
    assert.equal(init.redirect, 'manual', 'a redirect is checked before it is followed');
  }
});

test('A PRIVATE, LOCAL OR PLAIN-HTTP ADDRESS IS NEVER SENT TO, NOR IS A REDIRECT TO ONE', async () => {
  const net = web({ 'https://files.example.org/bounce': () => new Response(null, { status: 301, headers: { location: 'https://169.254.169.254/latest/meta-data' } }) });
  const read = readPublic({ send: net.send });
  for (const address of ['https://127.0.0.1/a.json', 'https://10.0.0.1/a.json', 'https://localhost/a.json', 'https://[::1]/a.json', 'https://db.internal/a.json']) {
    const out = await read(address);
    assert.equal(out.ok, false, address);
    assert.match((out as { fix: string }).fix, /private or local/u, address);
  }
  assert.match(((await read('http://files.example.org/a.json')) as { fix: string }).fix, /https/u);
  assert.match(((await read('not an address')) as { fix: string }).fix, /not a web address/u);
  assert.deepEqual(net.sent, []);
  const bounced = await read('https://files.example.org/bounce');
  assert.equal(bounced.ok, false);
  assert.match((bounced as { fix: string }).fix, /169\.254\.169\.254 is a private or local address/u);
  assert.equal(net.sent.length, 1, 'the private hop was sent to');
});

test('A NAME THAT RESOLVES TO A PRIVATE ADDRESS IS REFUSED BY THE PIN BEFORE ANYTHING IS SENT', async () => {
  const net = web({ 'https://sneaky.example.com/a.json': () => new Response(FILE) });
  const read = readPublic({ send: net.send, pin: async (at) => (at.hostname === 'sneaky.example.com' ? 'sneaky.example.com resolves to 192.168.1.4, which is a private address, so nothing was sent to it.' : {}) });
  const out = await read('https://sneaky.example.com/a.json');
  assert.equal(out.ok, false);
  assert.match((out as { fix: string }).fix, /192\.168\.1\.4/u);
  assert.deepEqual(net.sent, []);
});

test('TOO LARGE, BY ITS HEADER OR AS IT STREAMS, A FAILED STATUS AND TOO MANY REDIRECTS ARE EACH ONE SENTENCE', async () => {
  const big = 'x'.repeat(PUBLIC_MOST_BYTES + 1);
  const net = web({
    'https://files.example.org/said-big': () => new Response('{}', { headers: { 'content-length': String(PUBLIC_MOST_BYTES + 1) } }),
    'https://files.example.org/is-big': () => new Response(new ReadableStream({ start: (c) => (c.enqueue(new TextEncoder().encode(big)), c.close()) })),
    'https://files.example.org/gone': () => new Response('gone', { status: 410 }),
    'https://files.example.org/loop': () => new Response(null, { status: 302, headers: { location: '/loop' } }),
  });
  const read = readPublic({ send: net.send });
  assert.match(((await read('https://files.example.org/said-big')) as { fix: string }).fix, /larger than a shared use case/u);
  assert.match(((await read('https://files.example.org/is-big')) as { fix: string }).fix, /larger than a shared use case/u);
  assert.match(((await read('https://files.example.org/gone')) as { fix: string }).fix, /answered 410/u);
  assert.match(((await read('https://files.example.org/loop')) as { fix: string }).fix, /redirected more than 3 times/u);
  const down = readPublic({ send: async () => Promise.reject(new Error('ECONNREFUSED')) });
  assert.match(((await down('https://files.example.org/a.json')) as { fix: string }).fix, /could not be reached/u);
});
