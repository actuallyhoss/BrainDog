/**
 * The Worker's executor for scheduled actions, the one the record's alarm hands `runActions`.
 *
 * THE SELF-HOST'S RULES OVER `fetch`, asserted one door at a time: https to a declared origin and nothing else, a
 * literal private address refused, a redirect only to the same origin, a timeout, a size cap, and the key opened
 * from the Worker key store only when `KEK` is bound. Unbound, an action that names a key sends nothing and its run
 * event says why. `send` stands in for `fetch`; the root key and the value are made in memory per test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ActionAnswer, ActionRequest } from '@braindog/kernel';
import { ACTION_TIMEOUT_MS } from '@braindog/kernel';
import { ok } from '@braindog/ports';
import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { createDirectory } from '@braindog/record/directory';

import { ALARM_RUNS, NO_KEY_STORE, REDIRECT_HOPS, actionExecutor, holding, keyOpener, meterPass, type OpenKey, type Send } from '../src/actions.ts';
import { servesAccount } from '../src/route.ts';
import { keyStoreOf, recordKeys, unwrap, type KeyStore, type WrappedKey } from '../src/keys.ts';

const ORIGIN = 'https://api.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

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
const fixOf = (a: ActionAnswer): string => ('refused' in a ? a.refused.fix : '');
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const hex = (n: number): string => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString('hex');

test('IT SENDS TO A DECLARED ORIGIN, with the key as a bearer, and follows no redirect on its own', async () => {
  const net = wire(new Response('balance 120'));
  const answer = await actionExecutor(declaring(ORIGIN), { openKey, send: net.send })(request());

  assert.deepEqual(answer, { status: 200, body: 'balance 120', bytes: 11, ms: answer.ms, requests: 1 });
  assert.equal(net.calls[0]?.init.redirect, 'manual');
  assert.ok(net.calls[0]?.init.signal, 'the request had no timeout');
  assert.equal(new Headers(net.calls[0]?.init.headers).get('authorization'), 'Bearer sk-example-123');
  assert.doesNotMatch(JSON.stringify(answer), /sk-example-123/);
});

test('AN UNDECLARED ORIGIN, PLAIN HTTP AND A LITERAL PRIVATE ADDRESS ARE REFUSED BEFORE ANYTHING IS SENT', async () => {
  const net = wire(new Response('never'));
  assert.equal(codeOf(await actionExecutor(declaring(), { openKey, send: net.send })(request())), 'PULL_ORIGIN_REFUSED');
  assert.equal(
    codeOf(await actionExecutor(declaring('http://api.example.test'), { openKey, send: net.send })(request({ url: 'http://api.example.test/v1', origin: 'http://api.example.test' }))),
    'PULL_ORIGIN_REFUSED',
  );

  let opened = 0;
  const counting: OpenKey = async () => (opened++, 'sk-example-123');
  /* Written as `URL` writes an origin, which is how a declaration's origin reaches the executor: `[::ffff:127.0.0.1]`
     is `[::ffff:7f00:1]` by then. */
  for (const written of ['https://127.0.0.1', 'https://10.0.0.5', 'https://169.254.169.254', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://localhost', 'https://metadata.google.internal']) {
    const origin = new URL(written).origin;
    const answer = await actionExecutor(declaring(origin), { openKey: counting, send: net.send })(request({ url: `${origin}/v1`, origin }));
    assert.equal(codeOf(answer), 'PULL_ORIGIN_REFUSED', origin);
    assert.match(fixOf(answer), /is a private or local address, so nothing was sent\.$/);
  }
  assert.equal(net.calls.length, 0);
  assert.equal(opened, 0, 'a key was opened for an address that is never sent to');
});

test('A REDIRECT TO ANOTHER HOST IS REFUSED, one to the same origin is followed, and a fourth is refused', async () => {
  const away = wire(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: away.send })(request())), 'PULL_ORIGIN_REFUSED');
  assert.equal(away.calls.length, 1);

  const home = wire(new Response(null, { status: 307, headers: { location: '/v2/balance' } }), new Response('balance 120'));
  const followed = await actionExecutor(declaring(ORIGIN), { openKey, send: home.send })(request());
  assert.equal(codeOf(followed), 200);
  assert.equal(home.calls[1]?.url, `${ORIGIN}/v2/balance`);

  const loop = wire(new Response(null, { status: 302, headers: { location: '/again' } }));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: loop.send })(request())), 'PULL_REQUEST_REFUSED');
  assert.equal(loop.calls.length, REDIRECT_HOPS + 1);
});

test('AN ANSWER OVER THE CAP IS REFUSED, and a provider that is late or down is unavailable', async () => {
  const said = wire(new Response('0123456789', { headers: { 'content-length': '10' } }));
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: said.send })(request({ maxBytes: 5 }))), 'PULL_REQUEST_REFUSED');

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 4; i++) controller.enqueue(utf8('abc'));
      controller.close();
    },
  });
  assert.equal(codeOf(await actionExecutor(declaring(ORIGIN), { openKey, send: wire(new Response(stream)).send })(request({ maxBytes: 8 }))), 'PULL_REQUEST_REFUSED');

  const hang: Send = (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
  const late = await actionExecutor(declaring(ORIGIN), { openKey, send: hang })(request({ timeoutMs: 20 }));
  assert.equal(codeOf(late), 'PULL_PROVIDER_UNAVAILABLE');
  assert.match(fixOf(late), /did not answer/);

  const down: Send = async () => {
    throw new TypeError('fetch failed');
  };
  assert.match(fixOf(await actionExecutor(declaring(ORIGIN), { openKey, send: down })(request())), /could not be reached/);
});

test('UNBOUND, AN ACTION THAT NAMES A KEY SENDS NOTHING AND SAYS WHY; one that names none is sent', async () => {
  const api = { kernel: {} } as never;
  assert.equal(keyOpener(api, undefined), null);
  assert.equal(keyOpener(api, ''), null);

  const net = wire(new Response('ok'));
  const refused = await actionExecutor(declaring(ORIGIN), { openKey: null, send: net.send })(request());
  assert.equal(codeOf(refused), 'WRONG_KEY');
  assert.equal(fixOf(refused), `${NO_KEY_STORE} "example read" was not opened and nothing was sent.`);
  assert.equal(net.calls.length, 0);

  const bare = await actionExecutor(declaring(ORIGIN), { openKey: null, send: net.send })(request({ grant: null }));
  assert.equal(codeOf(bare), 200);
  assert.equal(new Headers(net.calls[0]?.init.headers).get('authorization'), null);
});

/** A sealed grant as `openGrant` answers it, sealed the way `47 §4.6` says, by this test and not by the code under it. */
async function sealedFor(store: KeyStore, recordKey: WrappedKey, value: string) {
  const dek = await unwrap(store, REC, 'record', recordKey);
  assert.ok(dek);
  const base = await crypto.subtle.importKey('raw', dek, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8('g_1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = `${REC}:g_1:1`;
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(aad) }, key, utf8(value)));
  return { id: 'g_1', key: { wrapped: recordKey.wrapped, nonce: recordKey.nonce, kek_id: recordKey.kek_id }, nonce, aad, ciphertext };
}

test('BOUND, THE KEY IS OPENED FROM THE WORKER KEY STORE, and a root key that is not the record’s opens nothing', async () => {
  const kek = hex(32);
  const store = (await keyStoreOf(kek)) ?? assert.fail('no store');
  const keys = await recordKeys(store, REC);
  const value = `bd_fake_action_value_${hex(16)}`;
  const sealed = await sealedFor(store, keys.record, value);
  const asked: { id: string; kek_id?: string | undefined }[] = [];
  const api = {
    kernel: {
      identity: () => ({ id: REC }),
      openGrant: (args: { id: string; kek_id?: string }) => (asked.push(args), ok(sealed)),
    },
  } as never;

  const open = keyOpener(api, kek) ?? assert.fail('bound, and no opener');
  assert.equal(await open({ id: 'g_1', label: 'example read' }), value);
  assert.deepEqual(asked, [{ id: 'g_1', kek_id: (await store.current()).kekId }]);

  const net = wire(new Response('ok'));
  await actionExecutor(declaring(ORIGIN), { openKey: open, send: net.send })(request());
  assert.equal(new Headers(net.calls[0]?.init.headers).get('authorization'), `Bearer ${value}`);

  assert.equal(await (keyOpener(api, hex(32)) ?? assert.fail())({ id: 'g_1', label: 'example read' }), null, 'another root key opened it');
  assert.equal(await (keyOpener(api, 'not a key') ?? assert.fail())({ id: 'g_1', label: 'example read' }), null);
  const refusing = { kernel: { identity: () => ({ id: REC }), openGrant: () => ({ ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'gone' } }) } } as never;
  assert.equal(await (keyOpener(refusing, kek) ?? assert.fail())({ id: 'g_1', label: 'example read' }), null);
});

test('ONE ALARM STAYS INSIDE THE INVOCATION CEILINGS: 800 subrequests and ten minutes', () => {
  assert.ok(ALARM_RUNS * (1 + REDIRECT_HOPS) <= 800);
  assert.ok(ALARM_RUNS * ACTION_TIMEOUT_MS <= 600_000);
});

test('ON A REAL RECORD WITH NO KEY STORE, THE RUN EVENT SAYS WHY IN ONE SENTENCE, and nothing is sent', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 15, 12)) });
  assert.ok(
    api.kernel.bindGrant(
      { label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
      'p_1',
    ).ok,
  );
  assert.ok(
    (
      await api.kernel.install([
        { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
        {
          id: 'ingest.balance',
          kind: 'ingest',
          body: { ingest: 'balance', channel: 'poll', url: `${ORIGIN}/v1/balance`, every: '1h', grant: 'example read', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
        },
      ])
    ).ok,
  );

  const net = wire(new Response('never'));
  const execute = actionExecutor(() => api.kernel.actionOrigins(), { openKey: keyOpener(api, undefined), send: net.send });
  const run = await api.kernel.runActions(execute, { limit: ALARM_RUNS });

  assert.equal(run.ran, 1);
  assert.equal(net.calls.length, 0);
  const event = sql.one<{ note: string; to_v: string }>("SELECT note, to_v FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1");
  assert.match(event?.note ?? '', /no key store yet, so the key "example read" was not opened and nothing was sent/);
  assert.equal((JSON.parse(event?.to_v ?? '{}') as { usage?: { requests?: number } }).usage?.requests, 0);
});

test('THE LEDGER: a pass is counted in the Directory once however often it is reported, and a held run sends nothing', async () => {
  const clock = fixedClock(Date.UTC(2026, 8, 15, 12));
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok(
    api.kernel.bindGrant(
      { label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
      'p_1',
    ).ok,
  );
  assert.ok(
    (
      await api.kernel.install([
        { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
        {
          id: 'ingest.balance',
          kind: 'ingest',
          body: { ingest: 'balance', channel: 'poll', url: `${ORIGIN}/v1/balance`, every: '1h', grant: 'example read', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
        },
      ])
    ).ok,
  );
  /* THE DIRECTORY THE Directory$ OBJECT HOLDS, called directly where the alarm calls it over RPC. */
  const directory = createDirectory(openSqlite(), clock);
  const person = directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  assert.ok(directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  const mayRun = (record: string, action: string) => directory.mayRun(record, action);
  const meter = (record: string, run: Parameters<typeof directory.meter>[1]) => directory.meter(record, run);

  const net = wire(async () => new Response('balance 42'));
  const inner = actionExecutor(declaring(ORIGIN), { openKey, send: net.send });
  const first = await api.kernel.runActions(holding(inner, REC, mayRun), { limit: ALARM_RUNS });
  assert.equal(net.calls.length, 1);
  assert.equal(first.usage.length, 1);
  await meterPass(meter, REC, first.usage);
  await meterPass(meter, REC, first.usage);
  const used = directory.usage(person.value.id, { from: '2026-09-15', to: '2026-09-15' });
  assert.ok(used.ok);
  assert.equal(used.value.totals.runs, 1);
  assert.equal(used.value.totals.requests, 1);

  /* AT THE HOSTED ALLOWANCE, the next run is held: nothing sent, and the event says until when. */
  const full = { runs: 15_000, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0 };
  assert.ok(directory.meter(REC, { event: 'e_month', at: new Date(clock.now()).toISOString(), ingest: 'other', scope: 'global', usage: full }).ok);
  clock.advance(2 * 3_600_000);
  const second = await api.kernel.runActions(holding(inner, REC, mayRun), { limit: ALARM_RUNS });
  assert.equal(second.held, 1);
  assert.equal(net.calls.length, 1);
  assert.match(sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1")?.note ?? '', /^balance is waiting until 1 October/);
  await meterPass(meter, REC, second.usage);
  const after = directory.usage(person.value.id, { from: '2026-09-15', to: '2026-09-15' });
  assert.ok(after.ok);
  assert.equal(after.value.totals.held, 1);
  assert.equal(after.value.totals.runs, 15_001);
});

test('/account/* IS THE WORKER’S, in front of the assets, and nothing that only starts with the word', () => {
  for (const path of ['/account/usage', '/account', '//account/usage']) assert.equal(servesAccount(path), true, `${path} is not served`);
  for (const path of ['/accounts', '/api/account', '/r/account', '/']) assert.equal(servesAccount(path), false, `${path} was claimed`);
});
