/**
 * The five answers, told apart without a socket.
 *
 * THE SUBJECT IS THAT THEY ARE FIVE. A screen that reports one failure for four different repairs
 * is the defect this whole file exists to stop, and the only way that stays true is if something
 * asserts the four are distinguishable rather than merely spelled differently once.
 *
 * DRIVEN THROUGH AN INJECTED `fetch`, so there is no port to bind and no server to start. The real
 * server IS driven, from a scratch script against a self-host on a spare port, and that is where
 * the wire shapes below came from: every body in this file is one a running `apps/selfhost`
 * actually sent, copied off the wire rather than imagined.
 *
 * `origin` IS PASSED EXPLICITLY EVERYWHERE. It defaults to the page's, and under `node --test`
 * there is no page — so a test that let it default would be asserting on `null` and would change
 * meaning the day this file ran in a browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { attempt } from './connect.ts';

const HERE = 'https://brain.dog';

/** A `fetch` that answers one thing, and records what it was asked. */
function answering(res: () => Response) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const doFetch = ((url: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers ?? {}).entries()),
    });
    return Promise.resolve(res());
  }) as unknown as typeof globalThis.fetch;
  return { doFetch, seen };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** What `apps/selfhost` answered a good bearer with, byte for byte apart from the instant. */
const BOOT = {
  ok: true,
  value: {
    registers: [
      { id: 'obligations', name: 'Obligations', count: 12 },
      { id: 'people', name: 'People', count: 5 },
    ],
    now: '2026-09-10T11:01:12.514Z',
  },
};

/** And what it answered a wrong one with, at 401. */
const NO = {
  ok: false,
  refusal: { code: 'UNAUTHORIZED', fix: 'This record does not know that credential.', at: 'authorization' },
};

/* ── 1 · the base is not a URL ───────────────────────────────────────────── */

test('AN ADDRESS THAT IS NOT ONE IS SAID TO BE THAT, AND NOTHING IS SENT', async () => {
  const { doFetch, seen } = answering(() => json(200, BOOT));
  const out = await attempt('brain dog', '', doFetch, HERE);
  assert.equal(out.kind, 'not-an-address');
  assert.equal(out.refusal.code, 'VALUE_MALFORMED');
  assert.equal(out.refusal.at, 'base');
  assert.equal(seen.length, 0, 'a request went out for an address that cannot be one');
});

test('an empty field is not an address either', async () => {
  const { doFetch } = answering(() => json(200, BOOT));
  assert.equal((await attempt('   ', '', doFetch, HERE)).kind, 'not-an-address');
});

test('a scheme that reaches no record is refused before the socket', async () => {
  const { doFetch, seen } = answering(() => json(200, BOOT));
  assert.equal((await attempt('file:///c/records/record.dog', '', doFetch, HERE)).kind, 'not-an-address');
  assert.equal(seen.length, 0);
});

/* ── 2 · nothing answered ────────────────────────────────────────────────── */

test('A SOCKET THAT FAILS IS SILENCE, AND SILENCE NAMES THE ADDRESS', async () => {
  const doFetch = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof globalThis.fetch;
  const out = await attempt('http://127.0.0.1:9', '', doFetch, 'http://127.0.0.1:9');
  assert.equal(out.kind, 'silent');
  assert.equal(out.refusal.code, 'UNREACHABLE');
  assert.match(out.refusal.fix, /127\.0\.0\.1:9/);
});

test('and silence from another address says so, because that reason is invisible', async () => {
  const doFetch = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof globalThis.fetch;
  const out = await attempt('http://127.0.0.1:8787', '', doFetch, HERE);
  assert.equal(out.kind, 'silent');
  assert.match(out.also ?? '', /served from https:\/\/brain\.dog/);
});

test('a host that answers nothing at all is timed out rather than waited on', async () => {
  const late = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const doFetch = (() => Promise.reject(late)) as unknown as typeof globalThis.fetch;
  const out = await attempt('http://127.0.0.1:8787', '', doFetch, 'http://127.0.0.1:8787');
  assert.equal(out.kind, 'silent');
  assert.match(out.also ?? '', /eight seconds/);
});

/* ── 3 · the host answered and refused the credential ────────────────────── */

test('A REFUSED CREDENTIAL IS THE RECORD OWN SENTENCE, NOT ONE OF OURS', async () => {
  const { doFetch } = answering(() => json(401, NO));
  const out = await attempt('http://127.0.0.1:8790', 'wrong.wrong', doFetch, 'http://127.0.0.1:8790');
  assert.equal(out.kind, 'refused');
  assert.equal(out.refusal.code, 'UNAUTHORIZED');
  assert.equal(out.refusal.fix, 'This record does not know that credential.');
});

test('the contract also allows a 401 with no body, and that is still the credential', async () => {
  // `30 §6`: "401 with an empty body for UNAUTHORIZED". Parsing first would call this not a record.
  const { doFetch } = answering(() => new Response('', { status: 401 }));
  const out = await attempt('http://127.0.0.1:8790', 'wrong.wrong', doFetch, 'http://127.0.0.1:8790');
  assert.equal(out.kind, 'refused');
  assert.equal(out.refusal.code, 'UNAUTHORIZED');
});

test('and a credential offered to a host that wants none is told what that looks like', async () => {
  const { doFetch } = answering(() => json(401, NO));
  const out = await attempt('http://127.0.0.1:8791', 'anything', doFetch, 'http://127.0.0.1:8791');
  assert.match(out.kind !== 'reached' ? (out.also ?? '') : '', /started without a key/);
});

test('no such clause when nothing was offered, because then it is not the explanation', async () => {
  const { doFetch } = answering(() => json(401, NO));
  const out = await attempt('http://127.0.0.1:8790', '', doFetch, 'http://127.0.0.1:8790');
  assert.equal(out.kind, 'refused');
  assert.equal(out.also, undefined);
});

/* ── 4 · something answered and it is not a record ───────────────────────── */

test('A 200 THAT IS NOT A RECORD IS NOT A SIGN-IN', async () => {
  const { doFetch } = answering(() => json(200, { ok: true, value: { hello: 'world' } }));
  const out = await attempt('http://127.0.0.1:3000', '', doFetch, 'http://127.0.0.1:3000');
  assert.equal(out.kind, 'not-a-record');
  assert.match(out.refusal.fix, /127\.0\.0\.1:3000/);
});

test('a page of HTML is not a record either', async () => {
  const { doFetch } = answering(() => new Response('<!doctype html><title>nginx</title>', { status: 200 }));
  assert.equal((await attempt('http://127.0.0.1:80', '', doFetch, HERE)).kind, 'not-a-record');
});

test('a register list that is the wrong shape is not a record', async () => {
  const { doFetch } = answering(() => json(200, { ok: true, value: { registers: ['obligations'], now: 'now' } }));
  assert.equal((await attempt('http://127.0.0.1:8790', '', doFetch, HERE)).kind, 'not-a-record');
});

test('a host with a route table and no boot in it is something else at that address', async () => {
  const { doFetch } = answering(() =>
    json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called boot.' } }),
  );
  const out = await attempt('http://127.0.0.1:8790', '', doFetch, HERE);
  assert.equal(out.kind, 'not-a-record', 'a missing boot is not a credential problem');
});

/* ── 5 · reached ─────────────────────────────────────────────────────────── */

test('A RECORD ANSWERS WITH ITS REGISTERS, ITS ROWS AND ITS OWN DAY', async () => {
  const { doFetch, seen } = answering(() => json(200, BOOT));
  const out = await attempt('http://127.0.0.1:8790', 'rec_1.secret', doFetch, 'http://127.0.0.1:8790');
  assert.equal(out.kind, 'reached');
  assert.equal(out.kind === 'reached' && out.registers, 2);
  assert.equal(out.kind === 'reached' && out.rows, 17);
  assert.equal(out.kind === 'reached' && out.now, '2026-09-10T11:01:12.514Z');
  assert.equal(out.kind === 'reached' && out.credentialed, true);
  assert.equal(seen[0]?.url, 'http://127.0.0.1:8790/api/boot');
  assert.equal(seen[0]?.headers['authorization'], 'Bearer rec_1.secret');
});

test('A HOST THAT WANTS NO TOKEN IS REACHED WITH AN EMPTY FIELD, AND NO HEADER IS SENT', async () => {
  // `server.ts`: anything presented that is not the one shared secret is 401, and with no secret
  // set that is everything — so an empty `Authorization:` would lock the supported configuration.
  const { doFetch, seen } = answering(() => json(200, BOOT));
  const out = await attempt('http://127.0.0.1:8791', '   ', doFetch, 'http://127.0.0.1:8791');
  assert.equal(out.kind, 'reached');
  assert.equal(out.kind === 'reached' && out.credentialed, false, 'the screen has to say which door opened');
  assert.equal(seen[0]?.headers['authorization'], undefined);
});

test('a record with no registers yet is a record', async () => {
  const { doFetch } = answering(() => json(200, { ok: true, value: { registers: [], now: '2026-09-10T11:01:12.655Z' } }));
  const out = await attempt('http://127.0.0.1:8791', '', doFetch, HERE);
  assert.equal(out.kind, 'reached');
  assert.equal(out.kind === 'reached' && out.registers, 0);
  assert.equal(out.kind === 'reached' && out.rows, 0);
});

/* ── the address, as the client spells it ────────────────────────────────── */

test('a trailing slash is the same address, and a path is kept', async () => {
  const { doFetch, seen } = answering(() => json(200, BOOT));
  await attempt('http://127.0.0.1:8790/', '', doFetch, HERE);
  await attempt('https://brain.dog/records/one/', '', doFetch, HERE);
  assert.equal(seen[0]?.url, 'http://127.0.0.1:8790/api/boot');
  assert.equal(seen[1]?.url, 'https://brain.dog/records/one/api/boot');
});

test('THE TOKEN NEVER REACHES THE ADDRESS', async () => {
  const { doFetch, seen } = answering(() => json(200, BOOT));
  await attempt('http://127.0.0.1:8790', 'rec_1.secret', doFetch, HERE);
  assert.ok(!(seen[0]?.url ?? '').includes('secret'), 'a credential in a URL is a credential in history');
});

/* ── the promise the whole file rests on ─────────────────────────────────── */

test('NOTHING THROWS, WHATEVER COMES BACK', async () => {
  const shapes: (() => Response)[] = [
    () => new Response('', { status: 500 }),
    () => json(503, { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'Every owner is suspended.' } }),
    () => json(200, { ok: false }),
    () => json(200, null),
    () => new Response('not json', { status: 200 }),
  ];
  for (const shape of shapes) {
    const { doFetch } = answering(shape);
    const out = await attempt('http://127.0.0.1:8790', '', doFetch, HERE);
    assert.ok(['refused', 'not-a-record'].includes(out.kind), `${out.kind} is not one of the five`);
  }
});

test('the four failures are four different sentences', async () => {
  const said = new Set<string>();
  const bad = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof globalThis.fetch;
  const cases: Promise<unknown>[] = [
    attempt('nonsense', '', answering(() => json(200, BOOT)).doFetch, HERE),
    attempt('http://127.0.0.1:9', '', bad, HERE),
    attempt('http://127.0.0.1:8790', 'x', answering(() => json(401, NO)).doFetch, HERE),
    attempt('http://127.0.0.1:3000', '', answering(() => json(200, { ok: true, value: 1 })).doFetch, HERE),
  ];
  for (const one of cases) {
    const out = (await one) as Awaited<ReturnType<typeof attempt>>;
    assert.notEqual(out.kind, 'reached');
    if (out.kind !== 'reached') said.add(out.refusal.fix);
  }
  assert.equal(said.size, 4, 'two of the four failures say the same thing, which is the defect');
});
