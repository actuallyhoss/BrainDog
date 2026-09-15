/**
 * The self-host's executor for scheduled actions (`loop/DIRECTION.md` §0b).
 *
 * WHAT MAY LEAVE, asserted one door at a time: https to a declared origin and nothing else, a redirect only
 * to the same origin, a timeout, a size cap that a lying `Content-Length` does not get past, and a key that
 * is opened by reference and sent as a bearer to the origin that named it. `send` is a stand-in for `fetch`,
 * so nothing here touches the network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ActionAnswer, ActionRequest } from '@braindog/kernel';

import { actionExecutor, type OpenKey, type Send } from '../src/actions.ts';

const ORIGIN = 'https://api.example.test';

const request = (over: Partial<ActionRequest> = {}): ActionRequest => ({
  job: 'o_1',
  channel: 'poll',
  ingest: 'balance',
  method: 'GET',
  url: `${ORIGIN}/v1/balance`,
  origin: ORIGIN,
  headers: { accept: 'application/json' },
  grant: { id: 'g_1', label: 'example read' },
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
  ...over,
});

/** A record whose active declarations name these origins, and nothing else of it. */
const declaring = (...origins: string[]) => ({ kernel: { actionOrigins: () => origins } }) as never;
const openKey: OpenKey = async () => 'sk-example-123';

function wire(...responses: (Response | Send)[]): { send: Send; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    send: async (url, init) => {
      calls.push({ url: url.href, init });
      const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
      return typeof next === 'function' ? next(url, init) : next;
    },
  };
}

const codeOf = (a: ActionAnswer): string | number => ('refused' in a ? a.refused.code : a.status);

test('IT SENDS TO A DECLARED ORIGIN, with the key opened by reference as a bearer, and follows no redirect on its own', async () => {
  const net = wire(new Response('balance 120', { status: 200 }));
  const answer = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send })(request());

  assert.deepEqual(answer, { status: 200, body: 'balance 120', bytes: 11, ms: answer.ms, requests: 1 });
  const [call] = net.calls;
  assert.equal(call?.url, `${ORIGIN}/v1/balance`);
  assert.equal(call?.init.redirect, 'manual');
  assert.equal(new Headers(call?.init.headers).get('authorization'), 'Bearer sk-example-123');
  assert.doesNotMatch(JSON.stringify(answer), /sk-example-123/, 'the key came back in the answer');

  /* No grant, no header. */
  const bare = wire(new Response('ok'));
  await actionExecutor(declaring(ORIGIN), { openKey, send: bare.send })(request({ grant: null }));
  assert.equal(new Headers(bare.calls[0]?.init.headers).get('authorization'), null);
});

test('AN ORIGIN NO ACTIVE DECLARATION NAMES IS REFUSED BEFORE ANYTHING IS SENT, and so is plain http', async () => {
  const net = wire(new Response('never'));
  const answer = await actionExecutor(declaring(), { openKey, send: net.send })(request());
  assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED');

  const other = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send })(request({ url: 'https://other.example.test/v1/balance' }));
  assert.equal(codeOf(other), 'PULL_ORIGIN_REFUSED');

  const plain = await actionExecutor(declaring('http://api.example.test'), { openKey, send: net.send })(
    request({ url: 'http://api.example.test/v1/balance', origin: 'http://api.example.test' }),
  );
  assert.equal(codeOf(plain), 'PULL_ORIGIN_REFUSED');
  assert.equal(net.calls.length, 0);
});

test('A REDIRECT TO ANOTHER HOST IS REFUSED, and one to the same origin is followed', async () => {
  const away = wire(new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.test/steal' } }));
  const refused = await actionExecutor(declaring(ORIGIN), { openKey, send: away.send })(request());
  assert.equal(codeOf(refused), 'PULL_ORIGIN_REFUSED');
  assert.equal(away.calls.length, 1, 'the redirect was followed');

  const home = wire(new Response(null, { status: 301, headers: { location: '/v2/balance' } }), new Response('balance 120'));
  const followed = await actionExecutor(declaring(ORIGIN), { openKey, send: home.send })(request());
  assert.equal(codeOf(followed), 200);
  assert.equal(home.calls[1]?.url, `${ORIGIN}/v2/balance`);
  assert.equal(followed.requests, 2);

  const loop = wire(new Response(null, { status: 302, headers: { location: '/again' } }));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: loop.send })(request())), 'PULL_REQUEST_REFUSED');
  assert.equal(loop.calls.length, 4);
});

test('AN ANSWER OVER THE CAP IS REFUSED, whether it says so up front or streams past it', async () => {
  const said = wire(new Response('0123456789', { headers: { 'content-length': '10' } }));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: said.send })(request({ maxBytes: 5 }))), 'PULL_REQUEST_REFUSED');

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 4; i++) controller.enqueue(new TextEncoder().encode('abc'));
      controller.close();
    },
  });
  const quiet = wire(new Response(stream));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: quiet.send })(request({ maxBytes: 8 }))), 'PULL_REQUEST_REFUSED');
});

test('A PROVIDER THAT DOES NOT ANSWER IN TIME, or cannot be reached, is unavailable', async () => {
  const hang: Send = (_url, init) =>
    new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  const late = await actionExecutor(declaring(ORIGIN), { openKey, send: hang })(request({ timeoutMs: 20 }));
  assert.equal(codeOf(late), 'PULL_PROVIDER_UNAVAILABLE');
  assert.match('refused' in late ? late.refused.fix : '', /did not answer/);

  const down: Send = async () => {
    throw new TypeError('fetch failed');
  };
  const gone = await actionExecutor(declaring(ORIGIN), { openKey, send: down })(request());
  assert.match('refused' in gone ? gone.refused.fix : '', /could not be reached/);
});

test('A KEY THIS HOST CANNOT OPEN SENDS NOTHING', async () => {
  const net = wire(new Response('never'));
  const answer = await actionExecutor(declaring(ORIGIN), { openKey: async () => null, send: net.send })(request());
  assert.equal(codeOf(answer), 'WRONG_KEY');
  assert.equal(net.calls.length, 0);
});
