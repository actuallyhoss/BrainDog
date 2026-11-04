/**
 * `serveBridge` against a real self-host, started in this process by `start` over a real socket, as
 * `brainfile-selfhost.test.ts` starts one: the handshake, the tool list and a call go through the host's own `/mcp`; a
 * host that is away is served from the cache, or by the bundled server with no cache; a sign-in the host refuses turns
 * every answer into how to sign in.
 *
 * THE FETCH IS THE REAL ONE, WATCHED. Each test hands the bridge a fetch that records what left and then sends it on, so
 * the test can say no `Origin` went, the bearer did, and the hints rode in `_meta.session`. Where a test needs the host
 * to say something it cannot be made to say (a new build, a 503, a slow answer), the watcher changes the answer and
 * nothing else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';

import { TOOLS } from '@braindog/mcp';
import { INSTRUCTIONS, VERSIONS } from '@braindog/mcp/rpc';

import { openKeyStore, recordKeys } from '../../selfhost/src/keys.ts';
import { start } from '../../selfhost/src/server.ts';
import { cacheFile, readDoorCache, writeDoorCache } from '../src/bridge-cache.ts';
import { attaches, linesForModel, mayHaveLeft, namedIn, readTools, serveBridge, UNREACHABLE_MAYBE, type BridgeIo } from '../src/bridge.ts';
import { readSession, sessionPath, writeSession } from '../src/hooks.ts';
import type { Target } from '../src/http.ts';
import { UNREACHABLE_FIX } from '../src/surface.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};
const HELLO = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.2.0' } };

type Rpc = { id?: string | number | null; method?: string; result?: Record<string, unknown>; error?: { message: string } };
type Sent = { url: string; headers: Headers; body: Record<string, unknown> };

/** A self-host holding one record with a list of two things, and the folder the test writes in. */
async function stack(t: { after: (f: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-bridge-'));
  const serverKey = randomBytes(32).toString('base64url');
  const store = await openKeyStore(join(dir, 'kek.key'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    keys: store,
    pollMs: 0,
  });
  let closed = false;
  const close = async () => {
    if (!closed) await running.close();
    closed = true;
  };
  t.after(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok((await running.api.kernel.install([THINGS])).ok);
  for (const name of ['Kiln', 'Wheel']) assert.ok(running.api.kernel.create('things', { name }, { actor: person.value.id }).ok);
  const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
  return { dir, serverKey, base, close };
}

/** A fetch that keeps what left and lets `change` stand in for the host's answer. */
function watched(change?: (sent: Sent, real: () => Promise<Response>, signal: AbortSignal) => Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const one: Sent = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
    sent.push(one);
    const real = () => globalThis.fetch(input, init);
    return change ? change(one, real, init!.signal!) : real();
  }) as typeof globalThis.fetch;
  return { sent, fetch };
}

/** A bridge over two pipes, and a way to ask it something and read the line that answers. */
function bridge(target: Target, home: string, fetch: typeof globalThis.fetch, more: Partial<BridgeIo> = {}, run: Record<string, string> = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: Rpc[] = [];
  const waiting: (() => void)[] = [];
  const said: string[] = [];
  createInterface({ input: output }).on('line', (line) => {
    lines.push(JSON.parse(line) as Rpc);
    for (const wake of waiting.splice(0)) wake();
  });
  const hints = async (client: { name?: string | undefined; version?: string | undefined }) => ({
    'x-braindog-host': 'studio-mac',
    'x-braindog-cwd': '/work/studio',
    'x-braindog-agent': 'claude',
    ...(client.name ? { 'x-braindog-client-name': client.name } : {}),
    ...(client.version ? { 'x-braindog-client-version': client.version } : {}),
    ...run,
  });
  const done = serveBridge({ input, output, home, fetch, ms: 5_000, say: (l) => void said.push(l), ...more }, target, hints);
  let next = 0;
  const line = async (match: (r: Rpc) => boolean): Promise<Rpc> => {
    for (;;) {
      const found = lines.find(match);
      if (found) return found;
      await new Promise<void>((wake) => waiting.push(wake));
    }
  };
  const ask = (method: string, params?: Record<string, unknown>, id: string | number = ++next): Promise<Rpc> => {
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })}\n`);
    return line((r) => r.id === id);
  };
  const tell = (method: string, params?: Record<string, unknown>) => void input.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) })}\n`);
  const end = async () => {
    input.end();
    await done;
  };
  /** Text written as it is, so several messages can arrive in one write. */
  const raw = (text: string) => void input.write(text);
  return { ask, tell, raw, line, lines, said, end };
}

const textOf = (r: Rpc) => JSON.stringify(r);

const names = (r: Rpc) => (r.result?.tools as { name: string }[]).map((x) => x.name);
const listChanged = (r: Rpc) => (r.result?.capabilities as { tools?: { listChanged?: boolean } }).tools?.listChanged;

test('THE HANDSHAKE, THE LIST AND A CALL GO THROUGH THE HOST, with the bearer, no Origin, and the hints in _meta.session', async (t) => {
  const s = await stack(t);
  const w = watched();
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, w.fetch);

  const init = await b.ask('initialize', HELLO);
  assert.equal(init.result?.protocolVersion, '2025-06-18');
  assert.equal(init.result?.instructions, INSTRUCTIONS);
  assert.equal(listChanged(init), true, 'the app was not told the bridge can say the list changed');
  assert.deepEqual(names(await b.ask('tools/list', {})), TOOLS.map((x) => x.name));
  /* A KEY THE APP SET ITSELF IS LEFT AS THE APP SET IT. */
  const call = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' }, _meta: { session: { cwd: '/elsewhere' } } });
  assert.notEqual(call.result?.isError, true, textOf(call));
  assert.ok(textOf(call).includes('Kiln') && textOf(call).includes('Wheel'), textOf(call));
  /* PING IS ANSWERED ON THE MACHINE, as its own revision draws a result. */
  assert.deepEqual((await b.ask('ping')).result, {});
  await b.end();

  assert.deepEqual(w.sent.map((x) => x.body.method), ['initialize', 'tools/list', 'tools/call'], 'a ping went to the host, or a request did not');
  for (const one of w.sent) {
    assert.equal(one.url, `${s.base}/mcp`);
    assert.equal(one.headers.get('origin'), null, 'an Origin went, which the door refuses');
    assert.equal(one.headers.get('authorization'), `Bearer ${s.serverKey}`);
    assert.equal(one.headers.get('content-type'), 'application/json');
    assert.match(one.headers.get('x-braindog-cli') ?? '', /\+[0-9a-f]{7,40}$/);
    assert.equal(one.headers.get('x-braindog-host'), 'studio-mac');
  }
  assert.equal(w.sent[0]!.headers.get('mcp-protocol-version'), null, 'the handshake was held to a version before it agreed one');
  const sent = w.sent[2]!;
  assert.equal(sent.headers.get('mcp-protocol-version'), '2025-06-18');
  assert.equal(sent.headers.get('mcp-method'), 'tools/call');
  assert.equal(sent.headers.get('mcp-name'), 'list');
  assert.deepEqual((sent.body.params as { _meta: { session: unknown } })._meta.session, {
    host: 'studio-mac',
    cwd: '/elsewhere',
    agent: 'claude',
    client: 'claude-code',
    client_version: '2.2.0',
  });

  /* THE CACHE: the handshake and the list, at 0600, with no key in it. */
  const file = cacheFile(s.dir, s.base);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const kept = readFileSync(file, 'utf8');
  assert.ok(!kept.includes(s.serverKey), 'the cache holds the bearer');
  assert.equal((JSON.parse(kept) as { tools: { tools: unknown[] } }).tools.tools.length, TOOLS.length);
  assert.ok(!b.lines.some((l) => textOf(l).includes(s.serverKey)) && !b.said.some((l) => l.includes(s.serverKey)), 'a line holds the bearer');
});

test('A HOST AWAY AT THE START: the cached handshake and list, and every tool refuses; with no cache, the bundled server', async (t) => {
  const s = await stack(t);
  const target = { key: s.base, base: s.base, token: s.serverKey };
  const warm = bridge(target, s.dir, globalThis.fetch);
  await warm.ask('initialize', HELLO);
  await warm.ask('tools/list', {});
  await warm.end();
  /* WHAT THE CACHE SAYS, made unlike the bundled server's, so the test can tell which one answered. */
  const file = cacheFile(s.dir, s.base);
  const cached = JSON.parse(readFileSync(file, 'utf8')) as { initialize: { instructions: string }; tools: { tools: unknown[] } };
  cached.initialize.instructions = 'The words the host gave last.';
  cached.tools.tools = cached.tools.tools.slice(0, 3);
  writeFileSync(file, JSON.stringify(cached));
  await s.close();

  const w = watched();
  const b = bridge(target, s.dir, w.fetch);
  const init = await b.ask('initialize', { ...HELLO, protocolVersion: VERSIONS[0] });
  assert.equal(init.result?.protocolVersion, VERSIONS[0]);
  assert.equal(init.result?.resultType, 'complete');
  assert.equal(init.result?.instructions, 'The words the host gave last.');
  assert.equal(listChanged(init), true);
  const listed = await b.ask('tools/list');
  assert.equal(names(listed).length, 3, 'the list was not the cached one');
  assert.equal(listed.result?.resultType, 'complete');
  const call = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.equal(call.result?.isError, true);
  assert.deepEqual(call.result?.structuredContent, { code: 'UNREACHABLE', fix: UNREACHABLE_FIX });
  await b.end();
  assert.equal(w.sent.filter((x) => x.body.method === 'tools/call').length, 1, 'a tool call was sent twice');

  const bare = bridge(target, mkdtempSync(join(s.dir, 'empty-')), globalThis.fetch);
  const hello = await bare.ask('initialize', HELLO);
  assert.equal(hello.result?.instructions, INSTRUCTIONS);
  assert.equal(names(await bare.ask('tools/list')).length, TOOLS.length);
  const refused = await bare.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.equal(refused.result?.isError, true);
  assert.ok(textOf(refused).includes(UNREACHABLE_FIX), textOf(refused));
  await bare.end();
});

test('SIGNED OUT: a 401 at the start, and one mid-session, turn every answer into how to sign in, and nothing more is sent', async (t) => {
  const s = await stack(t);
  const w = watched();
  const b = bridge({ key: s.base, base: s.base, token: 'not-the-key' }, s.dir, w.fetch);
  const init = await b.ask('initialize', HELLO);
  assert.equal(init.result?.protocolVersion, '2025-06-18', 'the refusing server did not answer the handshake');
  assert.equal(names(await b.ask('tools/list')).length, TOOLS.length);
  const call = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.equal(call.result?.isError, true);
  const refusal = call.result?.structuredContent as { code: string; fix: string };
  assert.equal(refusal.code, 'UNAUTHORIZED');
  assert.ok(refusal.fix.includes(`login ${s.base}`), refusal.fix);
  await b.end();
  assert.equal(w.sent.length, 1, 'a request went to the host after it refused the sign-in');
  assert.equal(b.said.length, 1);
  assert.ok(![...b.lines.map(textOf), ...b.said].some((l) => l.includes('not-the-key')), 'a line holds the bearer');

  /* MID-SESSION: the host refuses the bearer from the third request on, as it does a login revoked in the app. */
  const later = watched((one, real) => {
    if (later.sent.length < 3) return real();
    const headers = new Headers(one.headers);
    headers.set('authorization', 'Bearer revoked');
    return globalThis.fetch(one.url, { method: 'POST', headers, body: JSON.stringify(one.body) });
  });
  const m = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, later.fetch);
  await m.ask('initialize', HELLO);
  assert.notEqual((await m.ask('tools/call', { name: 'list', arguments: { register: 'things' } })).result?.isError, true);
  const ended = await m.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.equal((ended.result?.structuredContent as { code: string }).code, 'UNAUTHORIZED');
  assert.equal((await m.ask('tools/call', { name: 'list', arguments: { register: 'things' } })).result?.isError, true);
  await m.end();
  assert.equal(later.sent.length, 3, 'the bridge kept asking a host that refused the sign-in');
});

test('A DEPLOY MID-SESSION: one list-changed line when the build moves, and the cache holds the new build', async (t) => {
  const s = await stack(t);
  let build = '2026.10.08+aaaaaaa';
  /* THE SELF-HOST SENDS NO BUILD, so the watcher says the one the test sets, on the host's own answer. */
  const w = watched(async (_one, real) => {
    const res = await real();
    const headers = new Headers(res.headers);
    headers.set('braindog-build', build);
    return new Response(res.body, { status: res.status, headers });
  });
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, w.fetch);
  await b.ask('initialize', HELLO);
  await b.ask('tools/list', {});
  await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  const changed = () => b.lines.filter((l) => l.method === 'notifications/tools/list_changed').length;
  assert.equal(changed(), 0, 'the list was said to change on the build it started with');

  build = '2026.10.09+bbbbbbb';
  await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  await b.line((l) => l.method === 'notifications/tools/list_changed');
  await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.equal(changed(), 1, 'one deploy said the list changed more than once');
  const file = cacheFile(s.dir, s.base);
  for (let i = 0; i < 50 && !readFileSync(file, 'utf8').includes(build); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal((JSON.parse(readFileSync(file, 'utf8')) as { build: string }).build, build);
  await b.end();
});

test('A NEWER COMMAND INSTALLED UNDER THE SESSION is said once, at the end of the next tool answer', async (t) => {
  const s = await stack(t);
  let installed: string | null = null;
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, watched().fetch, { installed: () => installed });
  await b.ask('initialize', HELLO);
  const before = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.ok(!textOf(before).includes('newer BrainDog command'), textOf(before));
  installed = 'A newer BrainDog command is installed (2026.10.23); this session still runs 2026.10.22. Start a new session to use it.';
  const after = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  const content = after.result?.content as { type: string; text: string }[];
  assert.equal(content.at(-1)?.text, installed, 'the next answer did not end on the line');
  assert.ok(textOf(after).includes('Kiln'), 'the answer itself was lost');
  assert.ok(b.said.includes(installed), 'the log did not say it');
  await b.end();
});

test('A 503 REFUSES THE CALL ONCE, and a cancelled request is never answered', async (t) => {
  const s = await stack(t);
  const w = watched((one, real, signal) => {
    if (one.body.id === 'down') return Promise.resolve(new Response('', { status: 503 }));
    if (one.body.id === 'slow') return new Promise<Response>((_, no) => signal.addEventListener('abort', () => no(new Error('aborted'))));
    return real();
  });
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, w.fetch);
  await b.ask('initialize', HELLO);
  const down = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } }, 'down');
  assert.deepEqual(down.result?.structuredContent, { code: 'UNREACHABLE', fix: UNREACHABLE_FIX });
  assert.equal(w.sent.filter((x) => x.body.id === 'down').length, 1, 'a tool call was sent twice');

  /* ASKED, THEN CANCELLED: the host is still holding it, and the bridge stops it and writes nothing for it. */
  void b.ask('tools/call', { name: 'list', arguments: { register: 'things' } }, 'slow');
  while (!w.sent.some((x) => x.body.id === 'slow')) await new Promise((r) => setTimeout(r, 5));
  b.tell('notifications/cancelled', { requestId: 'slow', reason: 'the person moved on' });
  assert.ok((await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } })).result);
  await b.end();
  assert.ok(!b.lines.some((l) => l.id === 'slow'), 'a cancelled request was answered');
  assert.ok(!w.sent.some((x) => x.body.method === 'notifications/cancelled'), 'the cancel went to the host, which holds no session to cancel in');
});

/*
 * A WRITE THAT MAY HAVE LANDED SAYS SO. Before this a timed-out `log` answered "could not be
 * reached", the agent logged it again, and the record held the line twice. RED FIRST: with `away` given `false` in
 * place of `got.maybe` in `forward`, the timed-out log answers the old sentence and the first test goes red; with
 * `mayHaveLeft` answering true always, the refused log answers the new one and the second goes red.
 */
test('A TIMED-OUT LOG MAY HAVE BEEN RECORDED, so it says read before sending again; a timed-out read keeps the old sentence', async (t) => {
  const s = await stack(t);
  /* THE HOST TAKES THE CALL AND NEVER ANSWERS, as a host that wrote and then stalled would. */
  const w = watched((one, real, signal) => {
    if (one.body.method !== 'tools/call') return real();
    return new Promise<Response>((_, no) => signal.addEventListener('abort', () => no(signal.reason)));
  });
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, w.fetch, { ms: 1_000 });
  await b.ask('initialize', HELLO);
  await b.ask('tools/list');
  const logged = await b.ask('tools/call', { name: 'log', arguments: { text: 'Fired the kiln' } }, 'log');
  assert.equal(logged.result?.isError, true);
  assert.deepEqual(logged.result?.structuredContent, { code: 'UNREACHABLE', fix: UNREACHABLE_MAYBE });
  assert.equal(w.sent.filter((x) => x.body.id === 'log').length, 1, 'a log was sent twice');
  const read = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } }, 'read');
  assert.deepEqual(read.result?.structuredContent, { code: 'UNREACHABLE', fix: UNREACHABLE_FIX });
  await b.end();
  assert.ok(!UNREACHABLE_MAYBE.includes('\u2014') && !/\brow\b/.test(UNREACHABLE_MAYBE), UNREACHABLE_MAYBE);
});

test('A LOG TO A HOST THAT REFUSED THE CONNECTION never left, so it keeps "could not be reached"', async (t) => {
  const s = await stack(t);
  const target = { key: s.base, base: s.base, token: s.serverKey };
  await s.close();
  const b = bridge(target, mkdtempSync(join(s.dir, 'empty-')), globalThis.fetch);
  await b.ask('initialize', HELLO);
  const logged = await b.ask('tools/call', { name: 'log', arguments: { text: 'Fired the kiln' } });
  assert.equal(logged.result?.isError, true);
  assert.ok(textOf(logged).includes(UNREACHABLE_FIX), textOf(logged));
  assert.ok(!textOf(logged).includes(UNREACHABLE_MAYBE), textOf(logged));
  await b.end();
  /* A KEY NO HEADER CAN CARRY throws before anything is sent, which is a request that never left too. */
  let sent = 0;
  const counted: typeof globalThis.fetch = async () => {
    sent += 1;
    throw new TypeError('fetch failed');
  };
  const c = bridge({ ...target, token: 'bad\nkey' }, mkdtempSync(join(s.dir, 'empty-')), counted);
  await c.ask('initialize', HELLO);
  const unsent = await c.ask('tools/call', { name: 'log', arguments: { text: 'Fired the kiln' } });
  assert.equal(sent, 0, 'a request with a key no header can carry was sent');
  assert.ok(textOf(unsent).includes(UNREACHABLE_FIX), textOf(unsent));
  await c.end();
});

test('WHAT MAY HAVE LEFT: a timeout, a reset and an error with no code may have; a refused or unknown host never did', () => {
  const refused = new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });
  const both = new TypeError('fetch failed', { cause: Object.assign(new AggregateError([Object.assign(new Error('a'), { code: 'ECONNREFUSED' })]), {}) });
  assert.equal(mayHaveLeft(refused), false);
  assert.equal(mayHaveLeft(both), false);
  assert.equal(mayHaveLeft(new TypeError('fetch failed', { cause: Object.assign(new Error('dns'), { code: 'ENOTFOUND' }) })), false);
  assert.equal(mayHaveLeft(new TypeError('fetch failed', { cause: Object.assign(new Error('tls'), { code: 'CERT_HAS_EXPIRED' }) })), false);
  assert.equal(mayHaveLeft(new TypeError('fetch failed', { cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }) })), true);
  assert.equal(mayHaveLeft(new TypeError('fetch failed')), true);
  /* A TIMEOUT throws the signal's own reason, which names no connection, so it may have landed. */
  assert.equal(mayHaveLeft(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), true);
  /* THE HOST'S LIST DECIDES what reads, and a tool it does not list goes by this command's own. */
  const reads = readTools({ tools: [{ name: 'list', annotations: { readOnlyHint: true } }, { name: 'get', annotations: { destructiveHint: false } }] });
  assert.ok(reads.has('list') && !reads.has('get') && !reads.has('log'));
  assert.ok(readTools(undefined).has('search') && !readTools(undefined).has('create'));
});

test('A HOST BACK AFTER THE START WAS SERVED FROM THE MACHINE: one list-changed line, so the app lists the live tools', async (t) => {
  const s = await stack(t);
  /* THE HANDSHAKE FINDS NOBODY, as when the laptop wakes before its network does, and the next call finds the host. */
  const w = watched((one, real) => (one.body.method === 'initialize' ? Promise.reject(new Error('offline')) : real()));
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, mkdtempSync(join(s.dir, 'empty-')), w.fetch);
  const init = await b.ask('initialize', HELLO);
  assert.equal(init.result?.instructions, INSTRUCTIONS, 'the bundled server did not answer the handshake');
  const call = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.ok(textOf(call).includes('Kiln'), textOf(call));
  await b.line((l) => l.method === 'notifications/tools/list_changed');
  await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  assert.equal(b.lines.filter((l) => l.method === 'notifications/tools/list_changed').length, 1);
  await b.end();
});

test('A REQUEST SENT IN THE SAME WRITE AS THE HELLO waits for its answer, then goes under the agreed version', async (t) => {
  const s = await stack(t);
  let answered = false;
  const early: string[] = [];
  /* THE HOST TAKES ITS TIME OVER THE HANDSHAKE, so a request read before the answer would leave first. A throw here
     would read as a host away, so what left early is kept and asserted after. */
  const w = watched(async (one, real) => {
    if (one.body.method !== 'initialize') {
      if (!answered) early.push(String(one.body.method));
      return real();
    }
    await new Promise((r) => setTimeout(r, 60));
    const res = await real();
    answered = true;
    return res;
  });
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, w.fetch);
  const line = (id: number, method: string, params: Record<string, unknown>) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  /* ONE WRITE, three messages, as a client may send them. */
  b.raw(`${line(1, 'initialize', HELLO)}\n${line(2, 'tools/call', { name: 'list', arguments: { register: 'things' } })}\n${line(3, 'tools/list', {})}\n`);
  const got = await Promise.all([b.line((r) => r.id === 1), b.line((r) => r.id === 2), b.line((r) => r.id === 3)]);
  await b.end();
  assert.deepEqual(early, [], 'a request read with the hello left before the hello was answered');
  assert.equal(got[0]!.result?.protocolVersion, '2025-06-18');
  assert.ok(textOf(got[1]!).includes('Kiln'), textOf(got[1]!));
  assert.equal(names(got[2]!).length, TOOLS.length);
  for (const one of w.sent.filter((x) => x.body.method === 'tools/call' || x.body.method === 'tools/list'))
    assert.equal(one.headers.get('mcp-protocol-version'), '2025-06-18', 'a request read with the hello went before the version was agreed');
  assert.ok(!b.lines.some((l) => textOf(l).includes(s.serverKey)) && !b.said.some((l) => l.includes(s.serverKey)), 'a line holds the bearer');
});

test('A NEW BUILD\'S HANDSHAKE DROPS THE OLD BUILD\'S LIST, so a session that starts away still lists again when the host is back', () => {
  const home = mkdtempSync(join(tmpdir(), 'bridge-cache-'));
  const host = 'https://brain.dog/acme';
  writeDoorCache(home, host, { build: 'b1', initialize: { serverInfo: { name: 'braindog' } }, tools: { tools: [{ name: 'list' }] } });
  writeDoorCache(home, host, { build: 'b1', initialize: { serverInfo: { name: 'braindog' } } });
  assert.equal(readDoorCache(home, host)?.tools?.tools !== undefined, true, 'the same build lost its list');
  writeDoorCache(home, host, { build: 'b2', initialize: { serverInfo: { name: 'braindog' } } });
  const kept = readDoorCache(home, host);
  assert.equal(kept?.build, 'b2');
  assert.equal(kept?.tools, undefined, 'the old build\'s list was kept under the new build');
});

test('A CACHE WITH A HANDSHAKE AND NO LIST: the app listed the bundled tools, so a host back on the same build still says the list changed', async () => {
  const host = 'https://brain.dog/acme';
  const run = async (tools: boolean) => {
    const home = mkdtempSync(join(tmpdir(), 'bridge-nolist-'));
    writeDoorCache(home, host, { build: 'b2', initialize: { serverInfo: { name: 'braindog' }, capabilities: { tools: {} } }, ...(tools ? { tools: { tools: [{ name: 'list' }] } } : {}) });
    /* AWAY FOR THE HANDSHAKE AND THE LIST, BACK FOR THE CALL, on the build the cache names. */
    const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string };
      if (body.method !== 'tools/call') throw new Error('offline');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [] } }), { status: 200, headers: { 'braindog-build': 'b2' } });
    }) as typeof globalThis.fetch;
    const b = bridge({ key: host, base: host, token: 'k' }, home, fetch);
    await b.ask('initialize', HELLO);
    await b.ask('tools/list', {});
    await b.ask('tools/call', { name: 'list', arguments: {} });
    await b.end();
    return b.lines.filter((l) => l.method === 'notifications/tools/list_changed').length;
  };
  assert.equal(await run(false), 1, 'the bundled list was taken for the host\'s because the builds matched');
  assert.equal(await run(true), 0, 'the cached list of the same build was said to change');
});

/* ── the end, when the app closes the server ───────────────────────────── */

/** An agent's own key on the stack's record, as `braindog login` would hold one. */
async function agentKey(s: { base: string; serverKey: string }): Promise<string> {
  const made = (await fetch(`${s.base}/api/createToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.serverKey}` },
    body: JSON.stringify({ scope: 'write', label: 'Claude Code, studio-mac' }),
  }).then((r) => r.json())) as { ok: boolean; value: { bearer: string } };
  assert.ok(made.ok, JSON.stringify(made));
  return made.value.bearer;
}

/** The record's runs as the owner reads them: spoken id and state, by client id. */
async function runs(s: { base: string; serverKey: string }): Promise<Record<string, string | null>> {
  const said = (await fetch(`${s.base}/api/list?register=session`, { headers: { authorization: `Bearer ${s.serverKey}` } }).then((r) => r.json())) as {
    ok: boolean;
    value: { rows: { state: string | null; fields: { client_id?: string } }[] };
  };
  assert.ok(said.ok, JSON.stringify(said));
  return Object.fromEntries(said.value.rows.map((r) => [r.fields.client_id ?? '-', r.state]));
}

const ends = (w: { sent: Sent[] }) => w.sent.filter((x) => x.url.endsWith('/api/end'));

test('THE INPUT CLOSING ENDS THE RUN THE BRIDGE ATTACHED, once and by its host session id; a bridge that attached none sends no end', async (t) => {
  const s = await stack(t);
  const target = { key: s.base, base: s.base, token: await agentKey(s) };
  const cwd = mkdtempSync(join(tmpdir(), 'bridge-end-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const io = { env: { XDG_CONFIG_HOME: join(cwd, 'config') }, cwd };

  const w = watched();
  const b = bridge(target, s.dir, w.fetch, io, { 'x-braindog-client': 'cc-window-1' });
  await b.ask('initialize', HELLO);
  const wrote = await b.ask('tools/call', { name: 'create', arguments: { register: 'things', fields: { name: 'Glaze' } } });
  assert.notEqual(wrote.result?.isError, true, textOf(wrote));
  assert.equal((await runs(s))['cc-window-1'], 'active');
  await b.end();
  assert.equal(ends(w).length, 1, 'the end went more or fewer than once');
  assert.equal(ends(w)[0]!.headers.get('x-braindog-client'), 'cc-window-1');
  assert.equal(ends(w)[0]!.headers.get('authorization'), `Bearer ${target.token}`);
  assert.equal(ends(w)[0]!.headers.get('origin'), null);
  assert.equal((await runs(s))['cc-window-1'], 'done');
  assert.ok(b.said.includes('The app closed this session, so its run in BrainDog was ended.'), b.said.join('\n'));

  /* NO HOST SESSION ID: the run its calls landed in may be another app's in the same folder, so nothing is ended. */
  const w2 = watched();
  const anon = bridge(target, s.dir, w2.fetch, io);
  await anon.ask('initialize', HELLO);
  await anon.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  await anon.end();
  assert.equal(ends(w2).length, 0);

  /* A HANDSHAKE AND A LIST ATTACH NOTHING, even with an id, so a session that only listed its tools ends nothing. */
  const w3 = watched();
  const idle = bridge(target, s.dir, w3.fetch, io, { 'x-braindog-client': 'cc-window-2' });
  await idle.ask('initialize', HELLO);
  await idle.ask('tools/list', {});
  await idle.end();
  assert.equal(ends(w3).length, 0);
});

test('A RUN THE START HOOK ATTACHED IS LEFT TO THE END HOOK when it comes, and ended by the bridge when it does not', async (t) => {
  const s = await stack(t);
  const target = { key: s.base, base: s.base, token: await agentKey(s) };
  const cwd = mkdtempSync(join(tmpdir(), 'bridge-end-hook-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(cwd, 'config') };
  const io = { env, cwd, endGraceMs: 300 };

  /* The start hook's attach, as the record makes it, and the session file it writes. */
  const attach = async (client: string) => {
    const said = (await fetch(`${s.base}/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${target.token}`, 'x-braindog-client': client, 'x-braindog-agent': 'claude' },
      body: JSON.stringify({ source: 'startup', client_id: client }),
    }).then((r) => r.json())) as { ok: boolean; value: { spoken: string } };
    assert.ok(said.ok, JSON.stringify(said));
    writeSession(sessionPath(env, cwd, client), { host: s.base, spoken: said.value.spoken, client_id: client, head_at_start: null, at: new Date().toISOString() });
    return said.value.spoken;
  };

  /* THE END HOOK CAME AND ITS END LANDED: `seen` and `ended` before the wait ran out, so the bridge sends no end of its own. */
  const one = await attach('cc-hooked');
  const w = watched();
  const b = bridge(target, s.dir, w.fetch, io, { 'x-braindog-client': 'cc-hooked', 'x-braindog-session': one });
  await b.ask('initialize', HELLO);
  await b.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  const file = sessionPath(env, cwd, 'cc-hooked');
  const ending = b.end();
  setTimeout(() => writeSession(file, { ...readSession(file)!, seen: new Date().toISOString(), ended: new Date().toISOString() }), 100);
  await ending;
  assert.equal(ends(w).length, 0, 'the bridge ended the run before the end hook could');

  /* NO END HOOK (a killed window, a -p run): the grace runs out and the bridge ends the run. */
  const two = await attach('cc-killed');
  const w2 = watched();
  const k = bridge(target, s.dir, w2.fetch, io, { 'x-braindog-client': 'cc-killed', 'x-braindog-session': two });
  await k.ask('initialize', HELLO);
  await k.ask('tools/call', { name: 'list', arguments: { register: 'things' } });
  await k.end();
  assert.equal(ends(w2).length, 1);
  assert.equal(ends(w2)[0]!.headers.get('x-braindog-session'), two);
  assert.equal((await runs(s))['cc-killed'], 'done');
});

test('ATTACHED MEANS A HOST SESSION ID AND A TOOL CALL, or the run the start hook named', () => {
  assert.equal(attaches('tools/call', { 'x-braindog-client': 'c1' }), true);
  assert.equal(attaches('tools/list', { 'x-braindog-client': 'c1' }), false);
  assert.equal(attaches('initialize', { 'x-braindog-client': 'c1', 'x-braindog-session': 'S4' }), true);
  assert.equal(attaches('tools/call', { 'x-braindog-session': 'S4' }), false);
  assert.equal(attaches(undefined, {}), false);
});

test('CLAUDE CODE IS HANDED THE LINES, not the JSON copy it would give its model, and what he told the run with them', () => {
  const told = 'New for you: Sam (IN1): "Merge wave 1, then stop". Take it: instructions {take:"IN1"}.';
  const answer = { content: [{ type: 'text', text: `Tasks, 1 open\n${told}` }], structuredContent: { rows: [{ id: 'e_1' }], new_for_you: [told] } };
  const reply = { jsonrpc: '2.0' as const, id: 3, result: answer };
  const call = (args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list', arguments: args } });
  const code = { name: 'claude-code', version: '2.1.308' };
  assert.deepEqual(linesForModel(reply, code, call()), { jsonrpc: '2.0', id: 3, result: { content: answer.content } });
  /* The copy stays where it is asked for, drawn, or read by another app, and on a refusal. */
  assert.deepEqual(linesForModel(reply, code, call({ format: 'full' })), reply);
  assert.deepEqual(linesForModel(reply, { name: 'cursor' }, call()), reply);
  const card = { ...reply, result: { ...answer, structuredContent: { ...answer.structuredContent, card: { kind: 'decision' } } } };
  assert.deepEqual(linesForModel(card, code, call()), card);
  const refusal = { ...reply, result: { ...answer, isError: true } };
  assert.deepEqual(linesForModel(refusal, code, call()), refusal);
});

test('A CLIENT THAT SAYS HELLO WITH server/discover is named from its _meta, so Claude Code still gets the lines', async (t) => {
  const s = await stack(t);
  const b = bridge({ key: s.base, base: s.base, token: s.serverKey }, s.dir, watched().fetch);
  const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'claude-code', version: '2.1.310' } };
  await b.ask('server/discover', { _meta: meta });
  const call = await b.ask('tools/call', { name: 'list', arguments: { register: 'things' }, _meta: meta });
  assert.equal(call.result?.structuredContent, undefined, 'the JSON copy went to Claude Code');
  assert.ok(textOf(call).includes('Kiln'), textOf(call));
  assert.deepEqual(namedIn({ method: 'tools/call', params: { _meta: meta } }), { name: 'claude-code', version: '2.1.310' });
  assert.equal(namedIn({ method: 'tools/call', params: {} }), null);
  await b.end();
});
