/**
 * The one send loop both hosts run for scheduled actions (`src/actions.ts`).
 *
 * WHAT EITHER HOST SENDS, asserted once: https to a declared origin and nothing else, a host written as a private or
 * local address refused before the key is opened, a redirect only to the same origin and checked again, a timeout, a
 * size cap, the ledger asked first, and the key's value scrubbed from everything that comes back. `send` stands in
 * for the network and `pin` for a name service; the key is a fake made here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_KEY_STORE,
  REDACTED,
  REDIRECT_HOPS,
  holding,
  ipFamily,
  meterPass,
  refusedAddress,
  refusedHost,
  sendAction,
  type ActionAnswer,
  type ActionRequest,
  type OpenKey,
  type Pin,
  type Send,
} from '../src/actions.ts';

const ORIGIN = 'https://api.example.test';
const FAKE = `bd_fake_action_value_${crypto.randomUUID()}`;

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

const declaring = (...origins: string[]) => () => origins;
const openKey: OpenKey = async () => FAKE;

function wire<P = undefined>(...responses: (Response | Send<P>)[]) {
  const calls: { url: string; init: RequestInit; pinned: P }[] = [];
  const send: Send<P> = async (url, init, pinned) => {
    calls.push({ url: url.href, init, pinned });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return typeof next === 'function' ? next(url, init, pinned) : next;
  };
  return { send, calls };
}

const codeOf = (a: ActionAnswer): string | number => ('refused' in a ? a.refused.code : a.status);
const fixOf = (a: ActionAnswer): string => ('refused' in a ? a.refused.fix : '');

test('IT SENDS TO A DECLARED ORIGIN with the key as a bearer, and follows no redirect on its own', async () => {
  const net = wire(new Response('balance 120'));
  const answer = await sendAction({ origins: declaring(ORIGIN), openKey, send: net.send })(request());

  assert.deepEqual(answer, { status: 200, body: 'balance 120', bytes: 11, ms: answer.ms, requests: 1 });
  assert.equal(net.calls[0]?.init.redirect, 'manual');
  assert.ok(net.calls[0]?.init.signal, 'the request had no timeout');
  assert.equal(new Headers(net.calls[0]?.init.headers).get('authorization'), `Bearer ${FAKE}`);
  assert.equal(net.calls[0]?.pinned, undefined, 'a host with no pin was handed something to connect to');
});

test('THE KEY IS SCRUBBED FROM WHAT COMES BACK, when a provider echoes the header in its answer', async () => {
  const echo = wire(async (_url, init) => new Response(`{"seen":"${new Headers(init.headers).get('authorization')}","again":"${FAKE}"}`));
  const answer = await sendAction({ origins: declaring(ORIGIN), openKey, send: echo.send })(request());
  assert.equal(codeOf(answer), 200);
  assert.doesNotMatch(JSON.stringify(answer), new RegExp(FAKE));
  assert.equal('body' in answer ? answer.body : '', `{"seen":"Bearer ${REDACTED}","again":"${REDACTED}"}`);

  /* AND FROM A REFUSAL'S SENTENCE, which names what a provider said: here, a redirect's host. */
  const away = wire(new Response(null, { status: 302, headers: { location: `https://${FAKE.toLowerCase().replaceAll('_', '-')}.example.test/` } }));
  const lower: OpenKey = async () => FAKE.toLowerCase().replaceAll('_', '-');
  const refused = await sendAction({ origins: declaring(ORIGIN), openKey: lower, send: away.send })(request());
  assert.equal(codeOf(refused), 'PULL_ORIGIN_REFUSED');
  assert.doesNotMatch(fixOf(refused), new RegExp(FAKE.toLowerCase().replaceAll('_', '-')));
  assert.match(fixOf(refused), new RegExp(`redirected to ${REDACTED}\\.example\\.test`));
});

test('AN UNDECLARED ORIGIN, PLAIN HTTP AND A HOST WRITTEN AS A PRIVATE OR LOCAL ADDRESS ARE REFUSED before the key is opened', async () => {
  let opened = 0;
  const counting: OpenKey = async () => (opened++, FAKE);
  const net = wire(new Response('never'));
  assert.equal(codeOf(await sendAction({ origins: declaring(), openKey: counting, send: net.send })(request())), 'PULL_ORIGIN_REFUSED');
  assert.equal(codeOf(await sendAction({ origins: declaring(ORIGIN), openKey: counting, send: net.send })(request({ url: 'https://other.example.test/v1' }))), 'PULL_ORIGIN_REFUSED');
  const plain = 'http://api.example.test';
  assert.equal(codeOf(await sendAction({ origins: declaring(plain), openKey: counting, send: net.send })(request({ url: `${plain}/v1`, origin: plain }))), 'PULL_ORIGIN_REFUSED');

  for (const written of ['https://127.0.0.1', 'https://10.0.0.5', 'https://100.64.0.1', 'https://169.254.169.254', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://[fd00::5]', 'https://localhost', 'https://localhost.', 'https://metadata.google.internal']) {
    const origin = new URL(written).origin;
    const asked: string[] = [];
    const pin: Pin<object> = async (at) => (asked.push(at.host), {});
    const answer = await sendAction({ origins: declaring(origin), openKey: counting, send: wire<object>(new Response('never')).send, pin })(request({ url: `${origin}/v1`, origin }));
    assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED', origin);
    assert.match(fixOf(answer), /is a private or local address, so nothing was sent\.$/);
    assert.deepEqual(asked, [], `${origin} was handed to pin`);
  }
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0, 'a key was opened for an address that is never sent to');
});

test('PIN IS ASKED FOR EVERY HOP, its sentence ends the run before the key is opened, and a throw from it is the network', async () => {
  let opened = 0;
  const counting: OpenKey = async () => (opened++, FAKE);
  const refusing: Pin<{ at: string }> = async (at) => `${at.host} resolves to 10.0.0.5, which is a private address, so nothing was sent to it.`;
  const net = wire<{ at: string }>(new Response('never'));
  const refused = await sendAction({ origins: declaring(ORIGIN), openKey: counting, send: net.send, pin: refusing })(request());
  assert.equal(codeOf(refused), 'PULL_ORIGIN_REFUSED');
  assert.match(fixOf(refused), /10\.0\.0\.5, which is a private address/);
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0);

  let turn = 0;
  const moving: Pin<{ at: string }> = async () => ({ at: `hop ${turn++}` });
  const home = wire<{ at: string }>(new Response(null, { status: 307, headers: { location: '/v2/balance' } }), new Response('balance 120'));
  const followed = await sendAction({ origins: declaring(ORIGIN), openKey, send: home.send, pin: moving })(request());
  assert.equal(codeOf(followed), 200);
  assert.deepEqual(home.calls.map((c) => c.pinned.at), ['hop 0', 'hop 1']);

  const thrown: Pin<object> = async () => {
    throw new Error('the name resolved to no address');
  };
  assert.match(fixOf(await sendAction({ origins: declaring(ORIGIN), openKey, send: wire<object>(new Response('never')).send, pin: thrown })(request())), /could not be reached/);

  /* A name service that never answers is the run's ten seconds, not a hang. */
  const silent: Pin<object> = () => new Promise(() => undefined);
  assert.match(fixOf(await sendAction({ origins: declaring(ORIGIN), openKey, send: wire<object>(new Response('never')).send, pin: silent })(request({ timeoutMs: 20 }))), /did not answer/);
});

test('A REDIRECT TO ANOTHER HOST IS REFUSED, one to the same origin is followed, and a fourth is refused', async () => {
  const away = wire(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
  assert.equal(codeOf(await sendAction({ origins: declaring(ORIGIN), openKey, send: away.send })(request())), 'PULL_ORIGIN_REFUSED');
  assert.equal(away.calls.length, 1);

  const post = wire(new Response(null, { status: 303, headers: { location: '/v2/done' } }), new Response('ok'));
  const posted = await sendAction({ origins: declaring(ORIGIN), openKey, send: post.send })(request({ method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } }));
  assert.equal(codeOf(posted), 200);
  assert.equal(post.calls[1]?.init.method, 'GET');
  assert.equal(post.calls[1]?.init.body, undefined);
  assert.equal(new Headers(post.calls[1]?.init.headers).get('content-type'), null);
  assert.equal(posted.bytes, 7 + 2);

  const loop = wire(new Response(null, { status: 302, headers: { location: '/again' } }));
  assert.equal(codeOf(await sendAction({ origins: declaring(ORIGIN), openKey, send: loop.send })(request())), 'PULL_REQUEST_REFUSED');
  assert.equal(loop.calls.length, REDIRECT_HOPS + 1);
});

test('AN ANSWER OVER THE CAP IS REFUSED, and a provider that is late or down is unavailable', async () => {
  const said = wire(new Response('0123456789', { headers: { 'content-length': '10' } }));
  assert.equal(codeOf(await sendAction({ origins: declaring(ORIGIN), openKey, send: said.send })(request({ maxBytes: 5 }))), 'PULL_REQUEST_REFUSED');

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 4; i++) controller.enqueue(new TextEncoder().encode('abc'));
      controller.close();
    },
  });
  const over = await sendAction({ origins: declaring(ORIGIN), openKey, send: wire(new Response(stream)).send })(request({ maxBytes: 8 }));
  assert.equal(codeOf(over), 'PULL_REQUEST_REFUSED');
  assert.equal(over.bytes, 8);

  const hang: Send<undefined> = (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  const late = await sendAction({ origins: declaring(ORIGIN), openKey, send: hang })(request({ timeoutMs: 20 }));
  assert.equal(codeOf(late), 'PULL_PROVIDER_UNAVAILABLE');
  assert.match(fixOf(late), /did not answer within/);

  const down: Send<undefined> = async () => {
    throw new TypeError('fetch failed');
  };
  assert.match(fixOf(await sendAction({ origins: declaring(ORIGIN), openKey, send: down })(request())), /could not be reached/);
});

test('NO KEY STORE, OR A KEY THAT DOES NOT OPEN, SENDS NOTHING; an action that names no key is sent', async () => {
  const net = wire(new Response('ok'));
  const unbound = await sendAction({ origins: declaring(ORIGIN), openKey: null, send: net.send })(request());
  assert.equal(codeOf(unbound), 'WRONG_KEY');
  assert.equal(fixOf(unbound), `${NO_KEY_STORE} "example read" was not opened and nothing was sent.`);
  assert.equal(codeOf(await sendAction({ origins: declaring(ORIGIN), openKey: async () => null, send: net.send })(request())), 'WRONG_KEY');
  assert.equal(net.calls.length, 0);

  const bare = await sendAction({ origins: declaring(ORIGIN), openKey: null, send: net.send })(request({ grant: null }));
  assert.equal(codeOf(bare), 200);
  assert.equal(new Headers(net.calls[0]?.init.headers).get('authorization'), null);
});

test('THE LEDGER IS ASKED FIRST: a held record makes no request and opens no key, and a pass is metered in order', async () => {
  let opened = 0;
  const net = wire(new Response('never'));
  const inner = sendAction({ origins: declaring(ORIGIN), openKey: async () => (opened++, FAKE), send: net.send });
  const asked: string[] = [];
  const until = Date.UTC(2026, 9, 1);
  const say = 'balance is waiting until 1 October.';
  const held = await holding(inner, 'rec_1', (record, action) => (asked.push(`${record} ${action}`), { until, say }))(request());
  assert.deepEqual(held, { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: { until, say } });
  assert.deepEqual(asked, ['rec_1 balance']);
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0);

  const free = await holding(sendAction({ origins: declaring(ORIGIN), openKey, send: wire(new Response('ok')).send }), 'rec_1', async () => null)(request());
  assert.equal(codeOf(free), 200);

  const metered: string[] = [];
  const run = (event: string) => ({ event, at: '2026-09-15T12:00:00Z', ingest: 'balance', channel: 'poll', scope: 'global', outcome: 'ok' as const, usage: { runs: 1, requests: 1, bytes: 1, ms: 1, failures: 0, held: 0 } });
  await meterPass(async (record, m) => void metered.push(`${record} ${m.event}`), 'rec_1', [run('e_1'), run('e_2')]);
  assert.deepEqual(metered, ['rec_1 e_1', 'rec_1 e_2']);
});

test('EVERY PRIVATE, LOCAL AND SPECIAL RANGE IS REFUSED, in both families and in the IPv4 an IPv6 address carries', () => {
  const refused: [string, string][] = [
    ['0.0.0.0', 'unspecified'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'link-local'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['100.127.255.255', 'carrier-grade NAT'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['255.255.255.255', 'reserved'],
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['fe80::1', 'link-local'],
    ['febf::1', 'link-local'],
    ['fe80::1%eth0', 'link-local'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456::1', 'unique-local'],
    ['ff02::1', 'multicast'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:7f00:1', 'loopback'],
    ['::ffff:10.0.0.1', 'private'],
    ['::ffff:a9fe:a9fe', 'link-local'],
    ['::127.0.0.1', 'loopback'],
    ['64:ff9b::a9fe:a9fe', 'link-local'],
    /* READ THROUGH THE FORMS THAT CARRY AN IPv4 ADDRESS ELSEWHERE, and the IPv4 blocks nothing public is at. A shared file's
       address of https://[2002:7f00:1::]/ was read. */
    ['2002:7f00:1::', 'loopback'],
    ['2002:a00:1::1', 'private'],
    ['::ffff:0:7f00:1', 'loopback'],
    ['::ffff:0:a00:1', 'private'],
    ['64:ff9b:1::a00:1', 'private'],
    ['100::1', 'reserved'],
    ['198.18.0.1', 'reserved'],
    ['198.19.255.255', 'reserved'],
    ['192.0.0.1', 'reserved'],
    ['not an address', 'unreadable'],
    ['01.2.3.4', 'unreadable'],
    ['1:2:3:4:5:6:7:8:9', 'unreadable'],
  ];
  for (const [address, why] of refused) assert.equal(refusedAddress(address), why, address);

  for (const address of ['203.0.113.10', '8.8.8.8', '172.32.0.1', '172.15.255.255', '100.128.0.1', '100.63.255.255', '192.169.0.1', '169.253.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', 'fec0::1', '2002:808:808::1', '198.20.0.1', '198.17.255.255', '192.0.1.1'])
    assert.equal(refusedAddress(address), null, address);
});

test('WITHOUT node:net, AN ADDRESS IS READ THE WAY net.isIP READS IT, and a host is judged as the URL writes it', () => {
  for (const [text, family] of [['1.2.3.4', 4], ['255.255.255.255', 4], ['256.1.1.1', 0], ['1.2.3', 0], ['::1', 6], ['::ffff:1.2.3.4', 6], ['fe80::1%eth0', 6], ['2001:db8::g', 0], ['api.example.test', 0], ['', 0]] as const)
    assert.equal(ipFamily(text), family, text);

  assert.equal(refusedHost(new URL('https://api.example.test/')), null);
  assert.equal(refusedHost(new URL('https://203.0.113.10/')), null);
  assert.equal(refusedHost(new URL('https://[2606:4700:4700::1111]/')), null);
  assert.equal(refusedHost(new URL('https://0x7f.1/')), 'loopback', 'a URL writes 0x7f.1 as 127.0.0.1');
  assert.equal(refusedHost(new URL('https://LOCALHOST./')), 'local');
  assert.equal(refusedHost(new URL('https://a.b.localhost/')), 'local');
});

test('HOLDING TELLS THE LEDGER HOW MANY RUNS THIS PASS HAS ALREADY LET THROUGH, and a held run is not one of them', async () => {
  const asked: number[] = [];
  let sent = 0;
  const execute = holding(
    async () => {
      sent++;
      return { status: 200, body: 'ok', bytes: 2, ms: 1, requests: 1 };
    },
    'rec_x',
    (_record, _action, pending = 0) => {
      asked.push(pending);
      return pending >= 2 ? { until: 0, say: 'waiting' } : null;
    },
  );
  const request = { ingest: 'ping' } as Parameters<typeof execute>[0];
  for (let i = 0; i < 4; i++) await execute(request);
  assert.deepEqual(asked, [0, 1, 2, 2]);
  assert.equal(sent, 2, 'a pass sent past the allowance, because nothing it let through counted until it was metered');
});

test('A POLL THAT SENDS NO KEY IS STILL REFUSED A PRIVATE OR LOCAL ADDRESS, and nothing is sent', async () => {
  for (const written of ['https://127.0.0.1:5932', 'https://localhost', 'https://192.168.1.10']) {
    const origin = new URL(written).origin;
    const net = wire<object>(new Response('{"mrr":1}'));
    const answer = await sendAction({ origins: declaring(origin), openKey: null, send: net.send, pin: async () => ({}) })(request({ url: `${origin}/numbers.json`, origin, grant: null }));
    assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED', origin);
    assert.equal(net.calls.length, 0, `${origin} was sent to`);
  }
});
