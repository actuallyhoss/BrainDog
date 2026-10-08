/**
 * The self-host's executor for scheduled actions.
 *
 * WHAT MAY LEAVE, asserted one door at a time: https to a declared origin and nothing else, a public address and
 * nothing else, a connection to the address that was checked, a redirect only to the same origin and checked again,
 * a timeout, a size cap that a lying `Content-Length` does not get past, and a key that is opened by reference and
 * sent as a bearer to the origin that named it. `send` stands in for the socket and `resolve` for the name service,
 * so nothing here touches the network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ActionAnswer, ActionRequest } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import {
  IDEMPOTENCY_KEY,
  MAY_HAVE_LANDED,
  actionExecutor,
  holding,
  idempotentCalls,
  lookupFor,
  meterPass,
  type OpenKey,
  type Pinned,
  type Resolve,
  type Send,
} from '../src/actions.ts';
import { start } from '../src/server.ts';
import { OUTBOUND_HELD_MS, OUTBOUND_OFF, outboundHeld, outboundOf, scriptSandbox } from '../src/script.ts';
import { kennelAnswer, kennelBase } from '../src/kennel.ts';
import { KENNEL_BASE } from '@braindog/declare/kennel';

const ORIGIN = 'https://api.example.test';
const PUBLIC = '203.0.113.10';

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

/** A name service that answers from a table, one answer per call in turn, and remembers what it was asked. */
function names(table: Record<string, string[] | string[][]>) {
  const asked: string[] = [];
  const resolve: Resolve = async (host) => {
    const said = table[host] ?? [];
    const turn = asked.filter((h) => h === host).length;
    asked.push(host);
    const list = (Array.isArray(said[0]) ? (said as string[][])[Math.min(turn, said.length - 1)] : (said as string[])) ?? [];
    return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  return { resolve, asked };
}

const publicNames = () => names({ 'api.example.test': [PUBLIC] });

function wire(...responses: (Response | Send)[]): { send: Send; calls: { url: string; init: RequestInit; pinned: Pinned }[] } {
  const calls: { url: string; init: RequestInit; pinned: Pinned }[] = [];
  return {
    calls,
    send: async (url, init, pinned) => {
      calls.push({ url: url.href, init, pinned });
      const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
      return typeof next === 'function' ? next(url, init, pinned) : next;
    },
  };
}

const codeOf = (a: ActionAnswer): string | number => ('refused' in a ? a.refused.code : a.status);
const fixOf = (a: ActionAnswer): string => ('refused' in a ? a.refused.fix : '');

test('IT SENDS TO A DECLARED ORIGIN, with the key opened by reference as a bearer, and follows no redirect on its own', async () => {
  const net = wire(new Response('balance 120', { status: 200 }));
  const answer = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send, resolve: publicNames().resolve })(request());

  assert.deepEqual(answer, { status: 200, body: 'balance 120', bytes: 11, ms: answer.ms, requests: 1 });
  const [call] = net.calls;
  assert.equal(call?.url, `${ORIGIN}/v1/balance`);
  assert.equal(call?.init.redirect, 'manual');
  assert.equal(new Headers(call?.init.headers).get('authorization'), 'Bearer sk-example-123');
  assert.doesNotMatch(JSON.stringify(answer), /sk-example-123/, 'the key came back in the answer');

  /* No grant, no header. */
  const bare = wire(new Response('ok'));
  await actionExecutor(declaring(ORIGIN), { openKey, send: bare.send, resolve: publicNames().resolve })(request({ grant: null }));
  assert.equal(new Headers(bare.calls[0]?.init.headers).get('authorization'), null);
});

test('AN ORIGIN NO ACTIVE DECLARATION NAMES IS REFUSED BEFORE ANYTHING IS SENT, and so is plain http', async () => {
  const net = wire(new Response('never'));
  const { resolve } = publicNames();
  const answer = await actionExecutor(declaring(), { openKey, send: net.send, resolve })(request());
  assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED');

  const other = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send, resolve })(request({ url: 'https://other.example.test/v1/balance' }));
  assert.equal(codeOf(other), 'PULL_ORIGIN_REFUSED');

  const plain = await actionExecutor(declaring('http://api.example.test'), { openKey, send: net.send, resolve })(
    request({ url: 'http://api.example.test/v1/balance', origin: 'http://api.example.test' }),
  );
  assert.equal(codeOf(plain), 'PULL_ORIGIN_REFUSED');
  assert.equal(net.calls.length, 0);
});

/* THE RANGE TABLE IS THE SHARED LOOP'S, and is asserted in packages/host/test/actions.test.ts. */

test('A NAME IS REFUSED WHEN ANY ADDRESS IT RESOLVES TO IS PRIVATE, before the key is opened and before anything is sent', async () => {
  let opened = 0;
  const counting: OpenKey = async () => (opened++, 'sk-example-123');

  for (const answers of [['10.0.0.5'], [PUBLIC, '10.0.0.5'], ['::ffff:127.0.0.1'], ['fd00::5']]) {
    const net = wire(new Response('never'));
    const { resolve } = names({ 'api.example.test': answers });
    const answer = await actionExecutor(declaring(ORIGIN), { openKey: counting, send: net.send, resolve })(request());
    assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED', answers.join(','));
    assert.match(fixOf(answer), /^api\.example\.test resolves to \S+, which is an? [a-z -]+ address, so nothing was sent to it\.$/);
    assert.equal(answer.requests, 0);
    assert.equal(net.calls.length, 0, `${answers.join(',')} was sent to`);
  }
  assert.equal(opened, 0, 'a key was opened for a request that could never be sent');

  /* An address written into the URL is judged without asking anybody. */
  for (const origin of ['https://127.0.0.1', 'https://[::1]', 'https://[::ffff:169.254.169.254]']) {
    const net = wire(new Response('never'));
    const dns = names({});
    const answer = await actionExecutor(declaring(origin), { openKey, send: net.send, resolve: dns.resolve })(
      request({ url: `${origin}/v1/balance`, origin }),
    );
    assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED', origin);
    assert.deepEqual(dns.asked, []);
    assert.equal(net.calls.length, 0);
  }
});

test('THE CONNECTION GOES TO THE ADDRESS THAT WAS CHECKED, and a second lookup cannot swap it', async () => {
  /* The name answers a public address first and loopback every time after: the rebinding shape. */
  const dns = names({ 'api.example.test': [[PUBLIC], ['127.0.0.1']] });
  const net = wire(new Response('balance 120'));
  const answer = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send, resolve: dns.resolve })(request());

  assert.equal(codeOf(answer), 200);
  assert.deepEqual(dns.asked, ['api.example.test'], 'the name was asked more than once for one request');
  assert.deepEqual(net.calls[0]?.pinned, { address: PUBLIC, family: 4 });

  /* The socket's own lookup answers the pinned address in both of Node's forms, whatever name it is asked. */
  const pinned: Pinned = { address: PUBLIC, family: 4 };
  const one: unknown[] = [];
  lookupFor(pinned)('elsewhere.example.test', {}, (...args) => one.push(...args));
  assert.deepEqual(one, [null, PUBLIC, 4]);
  const all: unknown[] = [];
  lookupFor(pinned)('elsewhere.example.test', { all: true }, (...args) => all.push(...args));
  assert.deepEqual(all, [null, [{ address: PUBLIC, family: 4 }]]);
});

test('EVERY REDIRECT HOP IS RESOLVED AND CHECKED AGAIN, and one that lands on a private address is refused', async () => {
  const dns = names({ 'api.example.test': [[PUBLIC], ['169.254.169.254']] });
  const net = wire(new Response(null, { status: 302, headers: { location: '/v2/balance' } }), new Response('never'));
  const answer = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send, resolve: dns.resolve })(request());

  assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED');
  assert.match(fixOf(answer), /169\.254\.169\.254, which is a link-local address/);
  assert.equal(net.calls.length, 1, 'the hop to a private address was sent');
  assert.deepEqual(dns.asked, ['api.example.test', 'api.example.test']);

  /* And a hop that stays public is pinned to its own answer. */
  const moved = names({ 'api.example.test': [[PUBLIC], ['203.0.113.11']] });
  const home = wire(new Response(null, { status: 301, headers: { location: '/v2/balance' } }), new Response('balance 120'));
  const followed = await actionExecutor(declaring(ORIGIN), { openKey, send: home.send, resolve: moved.resolve })(request());
  assert.equal(codeOf(followed), 200);
  assert.equal(home.calls[1]?.pinned.address, '203.0.113.11');
});

test('A NAME THAT DOES NOT RESOLVE IS UNAVAILABLE, not refused, so the ladder tries it again later', async () => {
  const net = wire(new Response('never'));
  const failing: Resolve = async () => {
    throw Object.assign(new Error('getaddrinfo ENOTFOUND api.example.test'), { code: ['EN', 'OTFOUND'].join('') });
  };
  const gone = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send, resolve: failing })(request());
  assert.equal(codeOf(gone), 'PULL_PROVIDER_UNAVAILABLE');
  assert.match(fixOf(gone), /could not be reached/);

  const empty = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send, resolve: names({}).resolve })(request());
  assert.equal(codeOf(empty), 'PULL_PROVIDER_UNAVAILABLE');
  assert.equal(net.calls.length, 0);
});

test('A REDIRECT TO ANOTHER HOST IS REFUSED, and one to the same origin is followed', async () => {
  const away = wire(new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.test/steal' } }));
  const refused = await actionExecutor(declaring(ORIGIN), { openKey, send: away.send, resolve: publicNames().resolve })(request());
  assert.equal(codeOf(refused), 'PULL_ORIGIN_REFUSED');
  assert.equal(away.calls.length, 1, 'the redirect was followed');

  const home = wire(new Response(null, { status: 301, headers: { location: '/v2/balance' } }), new Response('balance 120'));
  const followed = await actionExecutor(declaring(ORIGIN), { openKey, send: home.send, resolve: publicNames().resolve })(request());
  assert.equal(codeOf(followed), 200);
  assert.equal(home.calls[1]?.url, `${ORIGIN}/v2/balance`);
  assert.equal(followed.requests, 2);

  const loop = wire(new Response(null, { status: 302, headers: { location: '/again' } }));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: loop.send, resolve: publicNames().resolve })(request())), 'PULL_REQUEST_REFUSED');
  assert.equal(loop.calls.length, 4);
});

test('AN ANSWER OVER THE CAP IS REFUSED, whether it says so up front or streams past it', async () => {
  const said = wire(new Response('0123456789', { headers: { 'content-length': '10' } }));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: said.send, resolve: publicNames().resolve })(request({ maxBytes: 5 }))), 'PULL_REQUEST_REFUSED');

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 4; i++) controller.enqueue(new TextEncoder().encode('abc'));
      controller.close();
    },
  });
  const quiet = wire(new Response(stream));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: quiet.send, resolve: publicNames().resolve })(request({ maxBytes: 8 }))), 'PULL_REQUEST_REFUSED');
});

test('A PROVIDER THAT DOES NOT ANSWER IN TIME, or cannot be reached, is unavailable', async () => {
  const hang: Send = (_url, init) =>
    new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  const late = await actionExecutor(declaring(ORIGIN), { openKey, send: hang, resolve: publicNames().resolve })(request({ timeoutMs: 20 }));
  assert.equal(codeOf(late), 'PULL_PROVIDER_UNAVAILABLE');
  assert.match(fixOf(late), /did not answer/);

  /* A name service that never answers is the same ten seconds, not a hang. */
  const silent: Resolve = () => new Promise(() => undefined);
  const unanswered = await actionExecutor(declaring(ORIGIN), { openKey, send: hang, resolve: silent })(request({ timeoutMs: 20 }));
  assert.match(fixOf(unanswered), /did not answer/);

  const down: Send = async () => {
    throw new TypeError('fetch failed');
  };
  const gone = await actionExecutor(declaring(ORIGIN), { openKey, send: down, resolve: publicNames().resolve })(request());
  assert.match(fixOf(gone), /could not be reached/);
});

test('A KEY THIS HOST CANNOT OPEN SENDS NOTHING', async () => {
  const net = wire(new Response('never'));
  const answer = await actionExecutor(declaring(ORIGIN), { openKey: async () => null, send: net.send, resolve: publicNames().resolve })(request());
  assert.equal(codeOf(answer), 'WRONG_KEY');
  assert.equal(net.calls.length, 0);
});

test('ON A REAL RECORD, A REFUSED ADDRESS IS ONE FAILURE ON THE RUN EVENT, with its sentence, and pauses nothing', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 15, 12)) });
  const bound = api.kernel.bindGrant(
    { label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
    'p_1',
  );
  assert.ok(bound.ok);
  const installed = await api.kernel.install([
    { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
    {
      id: 'ingest.balance',
      kind: 'ingest',
      body: {
        ingest: 'balance',
        channel: 'poll',
        url: `${ORIGIN}/v1/balance`,
        every: '1h',
        grant: 'example read',
        extract: { what: { after: 'balance ' } },
        writes: { register: 'notes' },
      } as never,
    },
  ]);
  assert.ok(installed.ok);

  const net = wire(new Response('never'));
  let opened = 0;
  const execute = actionExecutor(api, {
    openKey: async () => (opened++, 'sk-example-123'),
    send: net.send,
    resolve: names({ 'api.example.test': ['192.168.0.7'] }).resolve,
  });
  const run = await api.kernel.runActions(execute);

  assert.equal(run.refused, 1);
  assert.equal(run.paused, 0);
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0);
  const event = sql.one<{ to_v: string; note: string }>("SELECT to_v, note FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1");
  const said = JSON.parse(event?.to_v ?? '{}') as { outcome?: string; usage?: { failures?: number; requests?: number } };
  assert.equal(said.outcome, 'refused');
  assert.equal(said.usage?.failures, 1);
  assert.equal(said.usage?.requests, 0);
  assert.match(event?.note ?? '', /192\.168\.0\.7, which is a private address/);
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'poll' AND key = 'balance'")?.state, 'pending');
});

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** A record with one hourly `poll` to ORIGIN that sends the key called "example read". */
async function pollingRecord() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 15, 12)) });
  assert.ok(
    api.kernel.bindGrant(
      { label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
      'p_1',
    ).ok,
  );
  const installed = await api.kernel.install([
    { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
    {
      id: 'ingest.balance',
      kind: 'ingest',
      body: { ingest: 'balance', channel: 'poll', url: `${ORIGIN}/v1/balance`, every: '1h', grant: 'example read', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
    },
  ]);
  assert.ok(installed.ok);
  return { sql, api };
}

test('A HELD RUN SENDS NOTHING: no name resolved, no key opened, no request, and its event carries the sentence', async () => {
  const { sql, api } = await pollingRecord();
  const net = wire(new Response('never'));
  const dns = publicNames();
  let opened = 0;
  const inner = actionExecutor(api, { openKey: async () => (opened++, 'sk-example-123'), send: net.send, resolve: dns.resolve });
  const asked: string[] = [];
  const say = 'balance is waiting until 1 October. This record has used 15,000 runs for September.';
  const run = await api.kernel.runActions(holding(inner, REC, (record, action) => (asked.push(`${record} ${action}`), { until: Date.UTC(2026, 9, 1), say })));

  assert.equal(run.held, 1);
  assert.deepEqual(asked, [`${REC} balance`]);
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0);
  assert.deepEqual(dns.asked, []);
  assert.deepEqual(run.usage.map((u) => u.usage), [{ runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1, cpu_ms: 0 }]);
  assert.equal(sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1")?.note, say);

  /* AND WHAT THE PASS METERED GOES TO THE LEDGER, run by run, in order. */
  const metered: string[] = [];
  await meterPass((record, m) => void metered.push(`${record} ${m.ingest} ${m.outcome}`), REC, run.usage);
  assert.deepEqual(metered, [`${REC} balance held`]);
});

test('A SELF-HOST IS NEVER HELD: its record goes on the selfhost plan at the first pass, whatever the Directory had', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-plan-'));
  const running = await start({ file: join(dir, 'record.brain'), directory: join(dir, 'directory.sqlite'), port: 0, host: '127.0.0.1', pollMs: 0, actions: {} });
  try {
    const person = running.directory.person$('ada@example.com', 'Ada');
    assert.ok(person.ok);
    const made = await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' } });
    assert.ok(made.ok);
    /* PROVISIONED AS THE WORKER WOULD, on the hosted plan, and a month's allowance already used. */
    assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
    const full = { runs: 15_000, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0 };
    assert.ok(running.directory.meter(REC, { event: 'e_month', at: new Date().toISOString(), ingest: 'balance', scope: 'global', usage: full }).ok);
    assert.notEqual(running.directory.mayRun(REC, 'balance'), null, 'a hosted record at its allowance is held');

    await running.poll();
    assert.equal(running.directory.mayRun(REC, 'balance'), null);
    const today = new Date().toISOString().slice(0, 10);
    const usage = running.directory.usage(person.value.id, { from: today, to: today });
    assert.ok(usage.ok);
    assert.deepEqual(usage.value.records.map((r) => [r.record, r.plan]), [[REC, 'selfhost']]);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── a retry that is not a second call ──────────────────────────────────── */

/**
 * THE SAME TWO RULES THE WORKER ASSERTS, held here so the hosts cannot drift. The ladder itself, the cap and the
 * reclaimed lease are the record's and are asserted once, on the Worker.
 */

test('ONLY A CALL CARRIES AN IDEMPOTENCY KEY, and it is the outbox id; a poll and a pull carry none', async () => {
  const seen: (string | undefined)[] = [];
  const stub = idempotentCalls(async (r) => (seen.push(r.headers[IDEMPOTENCY_KEY]), { status: 200, body: '', bytes: 0, ms: 1, requests: 1 }));

  await stub(request({ channel: 'call', method: 'POST', job: 'o_7' }));
  await stub(request({ channel: 'poll', job: 'o_8' }));
  await stub(request({ channel: 'pull', job: 'o_9' }));
  assert.deepEqual(seen, ['o_7', undefined, undefined]);
});

test('A CALL CARRIES ITS KEY THROUGH THE SOCKET, and one that never answers says it may have landed', async () => {
  const net = wire(new Response('accepted', { status: 202 }));
  const sent = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send, resolve: publicNames().resolve })(
    request({ channel: 'call', method: 'POST', job: 'o_7' }),
  );
  assert.equal(codeOf(sent), 202);
  assert.equal(new Headers(net.calls[0]?.init.headers).get(IDEMPOTENCY_KEY), 'o_7');

  /* NOTHING CAME BACK, so the record cannot say whether the call landed, and the sentence says exactly that. */
  const hang: Send = (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  const late = await actionExecutor(declaring(ORIGIN), { openKey, send: hang, resolve: publicNames().resolve })(
    request({ channel: 'call', method: 'POST', job: 'o_7', timeoutMs: 20 }),
  );
  assert.equal(codeOf(late), 'PULL_PROVIDER_UNAVAILABLE');
  assert.ok(fixOf(late).endsWith(MAY_HAVE_LANDED), `the sentence did not say the call may have landed: ${fixOf(late)}`);

  /* AND A POLL THAT NEVER ANSWERS DOES NOT SAY IT, because a GET has nothing to have landed. */
  const poll = await actionExecutor(declaring(ORIGIN), { openKey, send: hang, resolve: publicNames().resolve })(request({ timeoutMs: 20 }));
  assert.doesNotMatch(fixOf(poll), /idempotency key/);
});

/* ── the operator's switch, `BRAINDOG_OUTBOUND` (`49 §5.24`) ──────────────── */

const NOON = Date.UTC(2026, 8, 15, 12);

test('THE SWITCH IS OFF UNLESS THE OPERATOR SAYS ON, and a value that is neither is no guess', () => {
  assert.equal(outboundOf(undefined), 'off');
  assert.equal(outboundOf(''), 'off');
  assert.equal(outboundOf(' OFF '), 'off');
  assert.equal(outboundOf('on'), 'on');
  assert.equal(outboundOf('On'), 'on');
  for (const wrong of ['yes', '1', 'true', 'enabled']) assert.equal(outboundOf(wrong), null, wrong);
});

test('THE HELD SENTENCE NAMES THE SWITCH AND NOTHING A PERSON SHOULD NOT READ: no key, address, file or dash', () => {
  assert.equal(OUTBOUND_OFF, 'This server does not send requests. Its operator can switch that on.');
  assert.doesNotMatch(OUTBOUND_OFF, /BRAINDOG_|https?:|\/|\d+\.\d+|[\u2013\u2014]/);
});

test('OFF, AN ADD-ON ACTION THAT CALLS OUT STILL INSTALLS AND IS HELD WITH THE SENTENCE: no name resolved, no key opened, nothing sent', async () => {
  /* INSTALLED HERE, by the same `install` an add-on's diff goes through: the switch changes nothing about installing. */
  const { sql, api } = await pollingRecord();
  const net = wire(new Response('balance 9'));
  const dns = publicNames();
  let opened = 0;
  const inner = actionExecutor(api, { openKey: async () => (opened++, 'sk-example-123'), send: net.send, resolve: dns.resolve });
  const run = await api.kernel.runActions(holding(inner, REC, outboundHeld(() => NOON)));

  assert.equal(run.held, 1);
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0);
  assert.deepEqual(dns.asked, []);
  assert.equal(sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1")?.note, OUTBOUND_OFF);
  /* HELD, NOT PAUSED AND NOT DROPPED: it is offered again a day on, and nothing about the action is lost. */
  const row = sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'poll' AND key = 'balance'");
  assert.equal(row?.state, 'pending');
  assert.equal(row?.due_at, new Date(NOON + OUTBOUND_HELD_MS).toISOString());
});

/** A record with a register and `scripts` installed, each due now: the same path an add-on's script takes. */
async function scriptedRecord(scripts: { name: string; source: string; egress: string[] }[]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOON) });
  const installed = await api.kernel.install([
    { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
    ...scripts.map((s) => ({
      id: `script.${s.name}`,
      kind: 'script' as const,
      body: { script: s.name, runs: { every: '1h' }, egress: s.egress, keys: [], reads: [], writes: ['notes'], source: s.source } as never,
    })),
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  /* DUE NOW RATHER THAN AT ITS JITTER (`firstDueMs`). */
  sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script'", new Date(NOON - 1_000).toISOString());
  const outcome = (name: string) => {
    const event = sql.one<{ note: string; to_v: string }>('SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1', `declaration:script.${name}`);
    return { note: event?.note, outcome: (JSON.parse(event?.to_v ?? '{}') as { outcome?: string }).outcome, said: event?.to_v ?? '' };
  };
  const notes = () => sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'notes'").map((r) => (JSON.parse(r.fields) as { what: string }).what);
  return { sql, api, outcome, notes };
}

const fetching = (origin: string) => `export default async function run(ctx) {
  const r = await ctx.fetch(${JSON.stringify(origin)} + '/v1/balance');
  ctx.write('notes', { what: 'fetched ' + (await r.text()) });
}`;
const local = `export default async function run(ctx) { ctx.write('notes', { what: 'counted at home' }); }`;

test('OFF, A SCRIPT THAT FETCHES IS HELD WITH THE SENTENCE AND WRITES NOTHING, and one that only writes runs as before', async () => {
  const r = await scriptedRecord([
    { name: 'balance', source: fetching(ORIGIN), egress: [ORIGIN] },
    { name: 'tally', source: local, egress: [] },
  ]);
  const net = wire(new Response('balance 9'));
  const dns = publicNames();
  const script = scriptSandbox(r.api, { openKey, send: net.send, resolve: dns.resolve, now: () => NOON, outbound: 'off' });
  await r.api.kernel.runActions(holding(actionExecutor(r.api, { openKey, send: net.send, resolve: dns.resolve }), REC, outboundHeld(() => NOON)), { script });

  assert.deepEqual([r.outcome('balance').note, r.outcome('balance').outcome], [OUTBOUND_OFF, 'held']);
  assert.equal(net.calls.length, 0);
  assert.deepEqual(dns.asked, []);
  assert.equal(r.outcome('tally').outcome, 'ok', r.outcome('tally').note);
  assert.deepEqual(r.notes(), ['counted at home']);
  assert.equal(
    r.sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'script' AND key = 'balance'")?.due_at,
    new Date(NOON + OUTBOUND_HELD_MS).toISOString(),
  );
});

test('ON, A SCRIPT RUNS AND SENDS, and one aimed at a name that resolves to 127.0.0.1 is refused before anything is sent', async () => {
  const INSIDE = 'https://inside.example.test';
  const r = await scriptedRecord([
    { name: 'balance', source: fetching(ORIGIN), egress: [ORIGIN] },
    { name: 'sneak', source: fetching(INSIDE), egress: [INSIDE] },
  ]);
  const net = wire(new Response('balance 9'));
  const dns = names({ 'api.example.test': [PUBLIC], 'inside.example.test': ['127.0.0.1'] });
  const script = scriptSandbox(r.api, { openKey, send: net.send, resolve: dns.resolve, now: () => NOON, outbound: 'on' });
  await r.api.kernel.runActions(actionExecutor(r.api, { openKey, send: net.send, resolve: dns.resolve }), { script });

  /* THE ONE THAT RAN WENT TO THE ADDRESS THAT WAS CHECKED, and only it was sent. */
  assert.deepEqual(net.calls.map((c) => [c.url, c.pinned.address]), [[`${ORIGIN}/v1/balance`, PUBLIC]]);
  assert.equal(r.outcome('balance').outcome, 'ok', r.outcome('balance').note);
  assert.deepEqual(r.notes(), ['fetched balance 9']);
  /* THE FENCE IS THE SAME WITH THE SWITCH ON: asked, refused, never sent, and never the held sentence. */
  assert.ok(dns.asked.includes('inside.example.test'));
  const sneak = r.outcome('sneak');
  assert.notEqual(sneak.outcome, 'held');
  assert.notEqual(sneak.outcome, 'ok');
  assert.notEqual(sneak.note, OUTBOUND_OFF);
  /* THE RUN'S LOG CARRIES THE FENCE'S OWN SENTENCE, the one a `call` gets. */
  assert.match(sneak.said, /resolves to 127\.0\.0\.1, which is a loopback address, so nothing was sent/);
});

test('ON, AN ADD-ON ACTION AIMED AT A NAME THAT RESOLVES TO 127.0.0.1 IS REFUSED, and the switch makes no exception to the fence', async () => {
  const { sql, api } = await pollingRecord();
  const net = wire(new Response('never'));
  let opened = 0;
  const execute = actionExecutor(api, { openKey: async () => (opened++, 'sk-example-123'), send: net.send, resolve: names({ 'api.example.test': ['127.0.0.1'] }).resolve });
  const run = await api.kernel.runActions(execute);

  assert.equal(run.refused, 1);
  assert.equal(run.held, 0);
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0);
  const note = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1")?.note ?? '';
  assert.match(note, /resolves to 127\.0\.0\.1, which is a loopback address, so nothing was sent/);
  assert.notEqual(note, OUTBOUND_OFF);
});

test('THE PUBLIC ADD-ON REGISTRY IS READ WITH THE SWITCH OFF: it answers to BRAINDOG_KENNEL alone', async () => {
  const was = process.env.BRAINDOG_OUTBOUND;
  process.env.BRAINDOG_OUTBOUND = 'off';
  try {
    const asked: string[] = [];
    const fetch = async (url: string) => (asked.push(url), new Response('{"id":"check"}', { status: 200 }));
    const answer = await kennelAnswer('GET', `${KENNEL_BASE}packs/check/1.0.0.pack.json`, undefined, { kennel: undefined, fetch, now: () => NOON });
    assert.equal(answer.status, 200);
    assert.deepEqual(asked, ['https://brain.dog/api/kennel/v1/packs/check/1.0.0.pack.json']);
    /* AND ITS OWN SWITCH IS THE ONE THAT STOPS IT, whatever outbound says. */
    assert.equal(kennelBase('off'), null);
    process.env.BRAINDOG_OUTBOUND = 'on';
    assert.equal((await kennelAnswer('GET', `${KENNEL_BASE}packs/check/1.0.0.pack.json`, undefined, { kennel: 'off', fetch, now: () => NOON })).status, 404);
    assert.equal(asked.length, 1);
  } finally {
    if (was === undefined) delete process.env.BRAINDOG_OUTBOUND;
    else process.env.BRAINDOG_OUTBOUND = was;
  }
});
