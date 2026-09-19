/**
 * What an answer means, and the two single requests.
 *
 * THE TABLE IS THE TEST. Four outcomes, and every one of them is a different repair — pause the
 * connector, wait for the ladder, send it to review, or read the body. A status mapped one row
 * across is a connector paused through a provider's bad afternoon, or a dead credential retried
 * every fifteen minutes for a week, and neither shows up as a failure anywhere. So the mapping is
 * asserted status by status rather than sampled.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Clock, Http } from '@braindog/ports';

import {
  classify, classifyBody, portFault, probe, proveScopes, PullError, retryAfterMs,
  type AuthDecl, type FetchDecl, type Grant, type Window,
} from '../src/index.ts';

const BASE = 'https://api.example.com';
const TZ = 'Africa/Cairo';
const NOW = Date.parse('2026-01-01T12:00:00Z');
const CLOCK: Clock = { now: () => NOW };
const WINDOW: Window = { since: Date.parse('2026-01-01T00:00:00Z'), until: Date.parse('2026-01-02T00:00:00Z') };

const refusal = async (fn: () => unknown): Promise<PullError> => {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof PullError, `threw something that is not a PullError: ${String(e)}`);
    return e;
  }
  throw new assert.AssertionError({ message: 'nothing was thrown, and a refusal was wanted' });
};

const decl = (over: Partial<FetchDecl> = {}): FetchDecl => ({
  base: BASE,
  path: '/v1/things',
  auth: { kind: 'none' },
  schedule: { every: '1h' },
  ...over,
});

const answer = (status: number, headers: Record<string, string> = {}) => ({ status, headers: new Headers(headers) });

/* ── Retry-After ─────────────────────────────────────────────────────────────────────────────── */

test('Retry-After is read in both forms a provider may send it', () => {
  assert.equal(retryAfterMs('120', NOW), 120_000);
  assert.equal(retryAfterMs('  120  ', NOW), 120_000);
  /* RFC 9110 ALLOWS AN HTTP-DATE, and a parser that read only the integer would call this absent
     and come back in two minutes into a limit with an hour left on it. */
  assert.equal(retryAfterMs('Thu, 01 Jan 2026 13:00:00 GMT', NOW), 3_600_000);
  assert.equal(retryAfterMs(null, NOW), null);
  assert.equal(retryAfterMs('', NOW), null);
  assert.equal(retryAfterMs('soon', NOW), null);
});

/* CAPPED, AND NEVER NEGATIVE. An uncapped header is the provider deciding how long this record's
   connector sleeps; a skewed clock putting the date behind us is not a negative wait. */
test('a Retry-After is capped at six hours and floored at none', () => {
  assert.equal(retryAfterMs('86400', NOW), 6 * 3_600_000);
  assert.equal(retryAfterMs('Fri, 02 Jan 2026 12:00:00 GMT', NOW), 6 * 3_600_000);
  assert.equal(retryAfterMs('Thu, 01 Jan 2026 11:00:00 GMT', NOW), 0);
});

/* ── classify ────────────────────────────────────────────────────────────────────────────────── */

const code = (status: number, over: Partial<FetchDecl> = {}, headers: Record<string, string> = {}): string =>
  ((): string => {
    try {
      classify(decl(over), answer(status, headers), NOW, 'fetch');
      return 'ok';
    } catch (e) {
      return e instanceof PullError ? e.code : `threw ${String(e)}`;
    }
  })();

test('every status reaches exactly one of the four repairs', () => {
  for (const status of [200, 201, 204, 299]) assert.equal(code(status), 'ok', String(status));
  /* A REDIRECT IS NOT FOLLOWED. The adapter is `redirect: 'manual'`, so a 3xx arrives intact, and a
     connector that followed one would be a connector whose destination the declaration does not
     fix — the SSRF the origin check exists for, arriving by the door it does not cover. */
  for (const status of [301, 302, 307, 308]) assert.equal(code(status), 'PULL_ORIGIN_REFUSED', String(status));
  for (const status of [401, 403]) assert.equal(code(status), 'PULL_AUTH_REJECTED', String(status));
  for (const status of [400, 404, 405, 409, 422]) assert.equal(code(status), 'PULL_REQUEST_REFUSED', String(status));
  for (const status of [500, 502, 503, 504]) assert.equal(code(status), 'PULL_PROVIDER_UNAVAILABLE', String(status));
});

/* 429 IS THE ONE 4xx THAT MEANS "COME BACK LATER" rather than "you asked wrongly". Sending it to
   review would park a working connector on somebody's desk over a limit that clears itself. */
test('a rate limit is the provider and not the declaration, declared or not', () => {
  assert.equal(code(429), 'PULL_PROVIDER_UNAVAILABLE');
});

test('a rate limit carries its notBefore, and only when the declaration honours it', () => {
  const honour = decl({ on_error: { honour: 'retry_after' } });
  const no = ((): PullError => {
    try {
      classify(honour, answer(429, { 'retry-after': '90' }), NOW, 'fetch');
    } catch (e) {
      return e as PullError;
    }
    throw new assert.AssertionError({ message: 'a 429 was not refused' });
  })();
  assert.equal(no.notBefore, NOW + 90_000);
});

/* `25 §6` IS WHAT LETS A DECLARATION SAY SO, AND A HARD-CODED TABLE COULD NOT. A provider that
   answers 404 for an empty range has not failed, and one that answers 200 with an `errors` array
   has. Both are the declaration's to state. */
test('the declaration can move a status into either bucket', () => {
  assert.equal(code(404, { on_error: { error_when: [{ status_in: [404] }] } }), 'PULL_PROVIDER_UNAVAILABLE');
  assert.equal(code(503, { on_error: { fatal_when: [{ status_in: [503] }] } }), 'PULL_REQUEST_REFUSED');
  /* AND fatal_when IS READ FIRST, so a status in both is the declaration's louder statement. */
  assert.equal(
    code(429, { on_error: { error_when: [{ status_in: [429] }], fatal_when: [{ status_in: [429] }] } }),
    'PULL_REQUEST_REFUSED',
  );
});

test('an honoured Retry-After on a declared error status is carried too', () => {
  const on = decl({ on_error: { error_when: [{ status_in: [418] }], honour: 'retry_after' } });
  try {
    classify(on, answer(418, { 'retry-after': '30' }), NOW, 'fetch');
    assert.fail('418 was not refused');
  } catch (e) {
    assert.equal((e as PullError).notBefore, NOW + 30_000);
  }
});

/* ── classifyBody ────────────────────────────────────────────────────────────────────────────── */

/* CLOUDFLARE'S GRAPHQL ANSWERS 200 WITH AN `errors` ARRAY. A run that read the status alone would
   write an empty page and move its cursor past a window it never fetched. */
test('a 200 with an errors array is the provider being unavailable', () => {
  const on = decl({ on_error: { error_when: [{ path: 'errors', present: true }] } });
  classifyBody(on, { data: { x: 1 } }, 200, WINDOW, TZ, 'fetch.on_error');
  assert.throws(
    () => classifyBody(on, { errors: [{ message: 'nope' }] }, 200, WINDOW, TZ, 'fetch.on_error'),
    (e: unknown) => e instanceof PullError && e.code === 'PULL_PROVIDER_UNAVAILABLE',
  );
});

test('a body-path fatal_when goes to review rather than onto the ladder', () => {
  const on = decl({ on_error: { fatal_when: [{ path: 'error.type', is: 'invalid_request_error' }] } });
  assert.throws(
    () => classifyBody(on, { error: { type: 'invalid_request_error' } }, 200, WINDOW, TZ, 'fetch.on_error'),
    (e: unknown) => e instanceof PullError && e.code === 'PULL_REQUEST_REFUSED',
  );
});

/* ── the port's own refusals ─────────────────────────────────────────────────────────────────── */

const named = (name: string): Error => Object.assign(new Error('refused by the adapter'), { name });

test('the four adapter faults reach the two codes they mean', () => {
  assert.equal(portFault(named('PrivateRange'), 'fetch')?.code, 'PULL_ORIGIN_REFUSED');
  assert.equal(portFault(named('TooLarge'), 'fetch')?.code, 'PULL_REQUEST_REFUSED');
  assert.equal(portFault(named('Timeout'), 'fetch')?.code, 'PULL_PROVIDER_UNAVAILABLE');
  assert.equal(portFault(named('Network'), 'fetch')?.code, 'PULL_PROVIDER_UNAVAILABLE');
  /* ANYTHING ELSE IS A DEFECT AND NOT A PROVIDER BEHAVIOUR, so it is `null` here and rethrown. */
  assert.equal(portFault(named('TypeError'), 'fetch'), null);
  assert.equal(portFault('a string', 'fetch'), null);
});

/* ── probe ───────────────────────────────────────────────────────────────────────────────────── */

type Seen = { url: URL; headers: Record<string, string> };

const httpSaying = (status: number, body: unknown, seen: Seen[] = [], headers: Record<string, string> = {}): Http => ({
  fetch: (url, init) => {
    seen.push({ url, headers: init.headers });
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
    );
  },
});

const GRANT: Grant = { id: 'g', version: 1, fields: { token: 'sk_1' } };
const PROBE = { path: '/v1/account', read: { account: 'id', currency: 'settings.currency' } };

test('a declaration with no probe makes no request at all', async () => {
  const seen: Seen[] = [];
  assert.deepEqual(await probe(decl(), GRANT, null, { http: httpSaying(200, {}, seen), clock: CLOCK }), {});
  assert.equal(seen.length, 0);
});

test('a probe reads the named paths and nothing else', async () => {
  const seen: Seen[] = [];
  const out = await probe(
    decl({ probe: PROBE, auth: { kind: 'bearer', grant: 'g' } }),
    GRANT,
    null,
    { http: httpSaying(200, { id: 'acct_7', settings: { currency: 'egp' }, secret: 'x' }, seen), clock: CLOCK },
  );
  assert.deepEqual(out, { account: 'acct_7', currency: 'egp' });
  assert.equal(seen[0]?.url.href, `${BASE}/v1/account`);
  assert.equal(seen[0]?.headers.authorization, 'Bearer sk_1');
});

/* A HEADER WITH A PLACEHOLDER IN IT HAS NOTHING TO BECOME, because a probe has no window. Sending
   it would put the literal text `{since:date}` on the wire; dropping every header would lose
   `Stripe-Version`, which a probe needs as much as a page does. */
test('a probe sends the headers that need no window and leaves the rest', async () => {
  const seen: Seen[] = [];
  await probe(
    decl({ probe: PROBE, headers: { 'Stripe-Version': '2026-08-26.dahlia', 'X-Since': '{since:date}' } }),
    GRANT,
    null,
    { http: httpSaying(200, { id: 'a', settings: { currency: 'e' } }, seen), clock: CLOCK },
  );
  assert.equal(seen[0]?.headers['Stripe-Version'], '2026-08-26.dahlia');
  assert.equal(seen[0]?.headers['X-Since'], undefined);
});

/* `{probe.account}` THAT QUIETLY BECAME THE EMPTY STRING is a request to the wrong account's
   endpoint, answered 200 and written to the record. The path that did not read names itself. */
test('a probe path that does not read is refused, by name', async () => {
  const no = await refusal(() =>
    probe(decl({ probe: PROBE }), GRANT, null, { http: httpSaying(200, { id: 'acct_7' }), clock: CLOCK }));
  assert.equal(no.code, 'PULL_SHAPE_MISMATCH');
  assert.equal(no.at, 'fetch.probe.read.currency');
});

test('a probe that reads a list or an object is refused, because a placeholder is one value', async () => {
  for (const settings of [{ currency: ['egp'] }, { currency: { code: 'egp' } }]) {
    const no = await refusal(() =>
      probe(decl({ probe: PROBE }), GRANT, null, { http: httpSaying(200, { id: 'a', settings }), clock: CLOCK }));
    assert.equal(no.at, 'fetch.probe.read.currency');
  }
});

test('a probe classifies its own answer like any other', async () => {
  const at401 = await refusal(() =>
    probe(decl({ probe: PROBE }), GRANT, null, { http: httpSaying(401, {}), clock: CLOCK }));
  assert.equal(at401.code, 'PULL_AUTH_REJECTED');
  assert.equal(at401.at, 'fetch.probe');

  const notJson = await refusal(() =>
    probe(decl({ probe: PROBE }), GRANT, null, { http: httpSaying(200, '<html>nope</html>'), clock: CLOCK }));
  assert.equal(notJson.code, 'PULL_SHAPE_MISMATCH');
});

/* THE SAME TWO CHECKS `resolveRequest` MAKES, and not a weaker pair beside them. A probe path is a
   literal that lint has already read, which is exactly the argument that would leave this one
   trusting a value — and a weaker check beside the real one becomes the only one somebody reads. */
test('a probe path that leaves base is refused before it is sent', async () => {
  for (const path of ['https://evil.example/v1/account', '@evil.example/v1/account', '../../admin', '%2e%2e%2fadmin']) {
    const seen: Seen[] = [];
    const no = await refusal(() =>
      probe(decl({ probe: { path, read: {} } }), GRANT, null, { http: httpSaying(200, {}, seen), clock: CLOCK }));
    assert.equal(no.code, 'PULL_ORIGIN_REFUSED', path);
    assert.equal(seen.length, 0, `${path} was sent anyway`);
  }
});

/* ── proveScopes ─────────────────────────────────────────────────────────────────────────────── */

const BEARER: AuthDecl = { kind: 'bearer', grant: 'g', require_scopes: ['repo:read', 'issues:read'] };

test('a provider that states its scopes is held to require_scopes', async () => {
  const deps = (scopes: string) => ({
    http: httpSaying(200, {}, [], { 'x-oauth-scopes': scopes }),
    clock: CLOCK,
  });
  assert.deepEqual(await proveScopes(decl({ auth: BEARER, probe: PROBE }), GRANT, deps('repo:read, issues:read, gist')), {
    ok: true,
    proven: ['repo:read', 'issues:read', 'gist'],
    status: 200,
  });
  const short = await proveScopes(decl({ auth: BEARER, probe: PROBE }), GRANT, deps('repo:read'));
  assert.equal(short.ok, false);
  assert.deepEqual(short.proven, ['repo:read']);
});

/* A PROVIDER THAT STATES NOTHING HAS NOT REFUSED. `proven: null` with a 200 binds, and the screen
   says the token may do more than read — which is true. Failing here would make every provider but
   two unusable, which is a scope check that costs more than it proves. */
test('a provider that states nothing binds, and says so by answering null', async () => {
  const out = await proveScopes(
    decl({ auth: BEARER, probe: PROBE }),
    GRANT,
    { http: httpSaying(200, {}), clock: CLOCK },
  );
  assert.deepEqual(out, { ok: true, proven: null, status: 200 });
});

/* A STATUS IS A NUMBER AND NOT A THROW. 401 here is the answer the bind screen exists to show. */
test('a rejected credential comes back as a status rather than a refusal', async () => {
  const out = await proveScopes(
    decl({ auth: BEARER, probe: PROBE }),
    GRANT,
    { http: httpSaying(403, { message: 'Bad credentials' }), clock: CLOCK },
  );
  assert.deepEqual(out, { ok: false, proven: null, status: 403 });
});

test('with no probe declared it calls page one, and the credential goes on it', async () => {
  const seen: Seen[] = [];
  const out = await proveScopes(
    decl({ auth: BEARER, page: { kind: 'page_number', param: 'page' } }),
    GRANT,
    { http: httpSaying(200, {}, seen, { 'x-accepted-github-permissions': 'contents=read' }), clock: CLOCK },
  );
  /* PAGE ONE AS A PAGE-ONE REQUEST, paginator parameter and all — the question being asked is
     whether the provider will answer this credential the thing the run will actually ask for. */
  assert.equal(seen[0]?.url.href, `${BASE}/v1/things?page=1`);
  assert.equal(seen[0]?.headers.authorization, 'Bearer sk_1');
  assert.deepEqual(out.proven, ['contents=read']);
});

test('a declaration with no require_scopes still reports what the provider stated', async () => {
  const out = await proveScopes(
    decl({ auth: { kind: 'bearer', grant: 'g' }, probe: PROBE }),
    GRANT,
    { http: httpSaying(200, {}, [], { 'x-oauth-scopes': 'gist' }), clock: CLOCK },
  );
  assert.deepEqual(out, { ok: true, proven: ['gist'], status: 200 });
});
