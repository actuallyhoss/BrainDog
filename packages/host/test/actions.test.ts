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

  /* `ms` IS PULLED OUT RATHER THAN COMPARED WITH ITSELF. This read `{ …, ms: answer.ms, … }`, so the
     expected side carried whatever the actual side did and that field asserted nothing: the same
     line passed with `ms` at a float, at `NaN`, or at a string. Checked on 2026-09-20 by making
     `src/actions.ts` answer `ms: (Date.now() - started) + 0.5`, which the old line accepted and this
     one refuses. What can be known about an elapsed time nobody controls is that it is a whole
     number of milliseconds, which is what `Date.now()` twice makes it. */
  const { ms, ...rest } = answer as { ms: number } & Record<string, unknown>;
  assert.deepEqual(rest, { status: 200, body: 'balance 120', bytes: 11, requests: 1 });
  assert.ok(Number.isInteger(ms), `the call was timed as ${JSON.stringify(ms)}`);
  assert.equal(net.calls[0]?.init.redirect, 'manual');
  assert.ok(net.calls[0]?.init.signal, 'the request had no timeout');
  assert.equal(new Headers(net.calls[0]?.init.headers).get('authorization'), `Bearer ${FAKE}`);
  assert.equal(net.calls[0]?.pinned, undefined, 'a host with no pin was handed something to connect to');
});

test('A HOST THE CALLER WRITES NEVER REACHES THE WIRE, with a key or without, so the request goes only where it was checked', async () => {
  for (const grant of [{ id: 'g_1', label: 'example read' }, null]) {
    const net = wire(new Response('ok'));
    const answer = await sendAction({ origins: declaring(ORIGIN), openKey, send: net.send })(
      request({ grant, headers: { accept: 'application/json', host: 'undeclared.example', Connection: 'close', 'transfer-encoding': 'chunked' } }),
    );
    assert.equal(codeOf(answer), 200);
    const sent = new Headers(net.calls[0]?.init.headers);
    assert.equal(sent.get('host'), null, 'the caller chose the Host the request travels under');
    assert.equal(sent.get('connection'), null);
    assert.equal(sent.get('transfer-encoding'), null);
    assert.equal(sent.get('accept'), 'application/json');
  }
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

test('THE TWO SPELLINGS NOTHING ELSE CATCHES ARE SCRUBBED: URL-encoded with lower-case hex, and URL-safe base64', async () => {
  /* A KEY WHOSE ENCODINGS DIFFER FROM THE ONES ALREADY CAUGHT: a `/` so `%2f` is not `%2F`, and bytes whose base64 has
     `+` and `/`, so the URL-safe alphabet's `-` and `_` are not the standard's. Each echo below carries only the one
     spelling, so taking either line out of `spellingsOf` turns this red. */
  const key = `bd/fake>>>?key/${'x'.repeat(12)}~~~???`;
  const opened: OpenKey = async () => key;
  const header = `Bearer ${key}`;
  const lower = encodeURIComponent(header).replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase());
  const urlSafe = btoa(header).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  assert.notEqual(lower, encodeURIComponent(header), 'the key has no hex letter to lower-case');
  assert.notEqual(urlSafe, btoa(header).replace(/=+$/, ''), 'the key has no + or / in its base64');
  for (const [how, echoed] of [
    ['lower-case %2f', lower],
    ['URL-safe base64', urlSafe],
  ] as const) {
    const echo = wire(async () => new Response(JSON.stringify({ heard: echoed })));
    const answer = await sendAction({ origins: declaring(ORIGIN), openKey: opened, send: echo.send })(request());
    assert.equal(codeOf(answer), 200);
    const said = 'body' in answer ? answer.body : '';
    assert.match(said, new RegExp(REDACTED), `${how}: nothing was scrubbed`);
    /* THE KEY'S OWN SPAN IN EITHER SPELLING, which is what `spellingsOf` promises; a character at either end of a base64
       run also carries the `Bearer ` beside it and is not the key's to strike. */
    const span = how === 'lower-case %2f' ? encodeURIComponent(key).replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()) : urlSafe.slice(10, -2);
    assert.equal(said.includes(span), false, `the key came back ${how}: ${said}`);
  }
});

/** Quoted-printable as RFC 2045 writes a body: `=XX` for `=` and every byte outside printable ASCII, soft breaks at 76. */
function quotedPrintable(text: string): string {
  let out = '';
  let line = 0;
  for (const byte of new TextEncoder().encode(text)) {
    const token = byte === 0x3d || byte < 0x20 || byte > 0x7e ? `=${byte.toString(16).toUpperCase().padStart(2, '0')}` : String.fromCharCode(byte);
    /* THE `=` OF A SOFT BREAK COUNTS TOWARDS THE 76, and a token is never split across one. */
    if (line + token.length > 75) {
      out += '=\r\n';
      line = 0;
    }
    out += token;
    line += token.length;
  }
  return out;
}

/** Base64 as MIME writes it: standard alphabet, a CRLF after every 76 characters. */
const mimeBase64 = (text: string): string => (btoa(text).match(/.{1,76}/g) ?? []).join('\r\n');

/** UTF-16 in either byte order, as the bytes a provider sends. */
function utf16(text: string, order: 'le' | 'be'): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    out[2 * i + (order === 'le' ? 0 : 1)] = unit & 0xff;
    out[2 * i + (order === 'le' ? 1 : 0)] = unit >> 8;
  }
  return out;
}

test('THE KEY IS SCRUBBED FROM THREE ECHOES THE BYTES DO NOT MATCH: MIME base64 wrapped at 76, quoted-printable with soft breaks, and UTF-16 either way round', async () => {
  /* MEASURED WITH `sendAction` AND A 64-CHARACTER KEY: each of these reached the
     script with no spelling of the key intact, and one line of the script's own put it back together. Each case below
     is that line. A `=` in the key makes quoted-printable differ from the bytes, a `/` and a `+` put both of base64's
     odd characters in play, and the JSON around it is long enough that every wrap at 76 lands inside the key. */
  const key = 'bd_live_Zq8=Xk2/Rm9+Tn4=Vp7/Wa1+Yc5=Hd3/Je6+Kf0=Lg8/Mh2+Ni5=Oj7Q';
  assert.equal(key.length, 64);
  const opened: OpenKey = async () => key;
  const said = `{"error":"invalid_token","authorization":"Bearer ${key}"}`;
  const at = said.indexOf(key);

  /* THE KEY'S OWN SPAN OF THE BASE64, which is what `spellingsOf` strikes: the characters every bit of which is the key's. */
  const span = btoa(said).slice(Math.ceil((8 * at) / 6), Math.floor((8 * (at + key.length)) / 6));
  const cases: [string, ConstructorParameters<typeof Response>[0], (body: string) => boolean][] = [
    ['MIME base64 wrapped at 76', mimeBase64(said), (body) => body.replaceAll('\r\n', '').includes(span)],
    [
      'quoted-printable with soft breaks',
      quotedPrintable(said),
      (body) => body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).includes(key),
    ],
    ['UTF-16LE', utf16(said, 'le'), (body) => body.replaceAll('\u0000', '').includes(key)],
    ['UTF-16BE', utf16(said, 'be'), (body) => body.replaceAll('\u0000', '').includes(key)],
    /* THE KEY ALONE, WITH NOTHING BESIDE IT. Inside a longer echo either byte order's spelling is found in the other's,
       since the NUL a character carries on one side is also the NUL of its neighbour, so taking out either line of
       `spellingsOf` left the two cases above green. At the edge of a body there is no neighbour, and each is needed. */
    ['UTF-16LE, the key alone', utf16(key, 'le'), (body) => body.replaceAll('\u0000', '').includes(key)],
    ['UTF-16BE, the key alone', utf16(key, 'be'), (body) => body.replaceAll('\u0000', '').includes(key)],
  ];
  assert.ok(mimeBase64(said).includes('\r\n') && !mimeBase64(said).includes(span), 'the wrap did not land inside the key');
  assert.ok(quotedPrintable(said).includes('=\r\n') && !quotedPrintable(said).includes(key), 'the soft break did not land inside the key');

  /* EVERY CASE IS RUN BEFORE ANYTHING IS ASSERTED, so a red run names each spelling that got through, not the first. */
  const recovered: string[] = [];
  const unscrubbed: string[] = [];
  for (const [how, echoed, recovers] of cases) {
    const echo = wire(async () => new Response(echoed));
    const answer = await sendAction({ origins: declaring(ORIGIN), openKey: opened, send: echo.send })(request());
    assert.equal(codeOf(answer), 200);
    const body = 'body' in answer ? answer.body : '';
    if (recovers(body)) recovered.push(how);
    if (!body.includes(REDACTED)) unscrubbed.push(how);
  }
  assert.deepEqual(recovered, [], 'the script put the key back together from these echoes');
  assert.deepEqual(unscrubbed, [], 'nothing was scrubbed from these echoes');
});

/** Every byte of `text` as two hex digits. */
const hexOf = (text: string): string => [...new TextEncoder().encode(text)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

test('THE KEY IS SCRUBBED FROM NINE MORE ECHOES: hex, every byte percent-encoded, URL-encoded twice, lower-case quoted-printable, JSON and HTML escapes, and base64 folded as a header', async () => {
  /* MEASURED WITH `sendAction`, THIS KEY AND A PROVIDER ECHOING IT IN ONE ENCODING PER
     CASE: each of the nine it names reached the script whole, and each case below is the one line of the script's own
     that gave it back. Two are the defaults of widespread stacks: ASP.NET Core's System.Text.Json writes every `+` as
     `+`, and a Go error page through `html/template` writes it as `&#43;`. Neither escapes the `=` or the `/`, so a
     spelling with every such character escaped would not have caught them: each character may be escaped or not. */
  const key = 'bd_live_Zq8=Xk2/Rm9+Tn4=Vp7/Wa1+Yc5=Hd3/Je6+Kf0=Lg8/Mh2+Ni5=Oj7Q';
  const opened: OpenKey = async () => key;
  const said = `{"error":"invalid_token","authorization":"Bearer ${key}"}`;
  const at = said.indexOf(key);
  const span = btoa(said).slice(Math.ceil((8 * at) / 6), Math.floor((8 * (at + key.length)) / 6));
  const bytes = [...new TextEncoder().encode(said)];
  const entities = (body: string): string => body.replace(/&#(x?)([0-9a-f]+);/gi, (_, x: string, n: string) => String.fromCodePoint(parseInt(n, x ? 16 : 10)));
  /* HEADER FOLDING, as a provider writes a long header back in a MIME part: a CRLF and one space before each line after the first. */
  const folded = (btoa(said).match(/.{1,76}/g) ?? []).join('\r\n ');
  const qpLower = quotedPrintable(said).replace(/=([0-9A-F]{2})/g, (_, hex: string) => `=${hex.toLowerCase()}`);

  const cases: [string, string, (body: string) => boolean][] = [
    ['hex, lower', hexOf(said), (body) => Buffer.from(body, 'hex').toString().includes(key)],
    ['hex, upper', hexOf(said).toUpperCase(), (body) => Buffer.from(body, 'hex').toString().includes(key)],
    ['every byte percent-encoded', bytes.map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join(''), (body) => decodeURIComponent(body).includes(key)],
    ['every byte percent-encoded, lower-case hex', bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''), (body) => decodeURIComponent(body).includes(key)],
    ['URL-encoded twice', encodeURIComponent(encodeURIComponent(said)), (body) => decodeURIComponent(decodeURIComponent(body)).includes(key)],
    ['quoted-printable, lower-case hex', qpLower, (body) => body.replace(/=\r?\n/g, '').replace(/=([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).includes(key)],
    ['JSON with + as \\u002B (System.Text.Json default)', said.replaceAll('+', '\\u002B'), (body) => String(JSON.parse(body).authorization).includes(key)],
    [
      'JSON with every character outside [A-Za-z0-9_-] as \\u, lower-case hex',
      said.replace(/[^A-Za-z0-9_\-"{}:,]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`),
      (body) => String(JSON.parse(body).authorization).includes(key),
    ],
    ['HTML, + as &#43; (Go html/template)', `<p>${said.replaceAll('+', '&#43;')}</p>`, (body) => entities(body).includes(key)],
    ['HTML hex entities for = / +', `<p>${said.replace(/[=/+]/g, (c) => `&#x${c.charCodeAt(0).toString(16).toUpperCase()};`)}</p>`, (body) => entities(body).includes(key)],
    ['base64 folded with CRLF and a space (header folding)', folded, (body) => body.replaceAll('\r\n ', '').includes(span)],
  ];
  /* EACH ECHO IS ONE THE SPELLINGS BEFORE THIS TEST DID NOT HOLD: the fold lands inside the key, and no case holds the key's bytes. */
  assert.ok(folded.replaceAll('\r\n ', '').includes(span), 'the fold did not land inside the key');
  for (const [how, echoed] of cases) assert.ok(!echoed.includes(key) && !echoed.includes(span), `${how} holds the key as sent`);

  /* EVERY CASE IS RUN BEFORE ANYTHING IS ASSERTED, so a red run names each spelling that got through, not the first. */
  const recovered: string[] = [];
  const unscrubbed: string[] = [];
  for (const [how, echoed, recovers] of cases) {
    const echo = wire(async () => new Response(echoed));
    const answer = await sendAction({ origins: declaring(ORIGIN), openKey: opened, send: echo.send })(request());
    assert.equal(codeOf(answer), 200);
    const body = 'body' in answer ? answer.body : '';
    if (recovers(body)) recovered.push(how);
    if (!body.includes(REDACTED)) unscrubbed.push(how);
  }
  assert.deepEqual(recovered, [], 'the script put the key back together from these echoes');
  assert.deepEqual(unscrubbed, [], 'nothing was scrubbed from these echoes');
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
  const run = (event: string) => ({ event, at: '2026-09-15T12:00:00Z', ingest: 'balance', channel: 'poll', scope: 'global', outcome: 'ok' as const, usage: { runs: 1, requests: 1, bytes: 1, ms: 1, failures: 0, held: 0, cpu_ms: 0 } });
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
    /* The deprecated site-local block, `fec0::/10`: nothing public answers there, and a network may still route it inside. */
    ['fec0::1', 'site-local'],
    ['feff::1', 'site-local'],
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
    ['168.63.129.16', 'reserved'],
    ['not an address', 'unreadable'],
    ['01.2.3.4', 'unreadable'],
    ['1:2:3:4:5:6:7:8:9', 'unreadable'],
  ];
  for (const [address, why] of refused) assert.equal(refusedAddress(address), why, address);

  for (const address of ['203.0.113.10', '8.8.8.8', '172.32.0.1', '172.15.255.255', '100.128.0.1', '100.63.255.255', '192.169.0.1', '169.253.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', 'fbff::1', '2002:808:808::1', '198.20.0.1', '198.17.255.255', '192.0.1.1'])
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
