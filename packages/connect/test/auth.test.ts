/**
 * The eight kinds, byte for byte, and the three ways a sealed grant refuses to move.
 *
 * THE HEADER IS ASSERTED EXACTLY AND NOT MATCHED LOOSELY. `Bearer  x` with two spaces, a `Basic`
 * built over base64url, a SigV4 `SignedHeaders` in the wrong order — every one of those is a
 * request a provider answers 401 to, and every one of them passes a test that checks the header is
 * "present" or "contains the token". So each case here spells the whole value.
 *
 * AND THE SEALING IS TESTED BY MOVING IT. A wrapping that is not bound is a wrapping that can be
 * moved, so the tests that matter are the three moves: another record, another grant id, another
 * version. None of them is checked by a line of code — the decryption simply does not succeed — and
 * a test is the only way to know that is still true.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Clock, Http, HttpInit, Key, KeyStore } from '@braindog/ports';

import {
  applyAuth, b64url, openSealed, PullError, seal, tokenStep, unb64url,
  type AuthDecl, type FetchDecl, type Grant, type ResolvedRequest, type Sealed, type WrappedDek,
} from '../src/index.ts';

/* The key store and the wrapped DEK are shared with `run.test.ts` — one wrapping, one AAD. */
import { kekOf, storeOf, wrapDek } from './grants.ts';

const utf8 = new TextEncoder();
const BASE = 'https://api.example.com';
const RECORD = 'rec_9fK2';

const refusal = async (fn: () => unknown): Promise<PullError> => {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof PullError, `threw something that is not a PullError: ${String(e)}`);
    return e;
  }
  throw new assert.AssertionError({ message: 'nothing was thrown, and a refusal was wanted' });
};

/* ── The stubs ───────────────────────────────────────────────────────────────────────────────── */

const clockAt = (iso: string): Clock => ({ now: () => Date.parse(iso) });

/** The clock every case that does not care about time shares, so a header is reproducible. */
const CLOCK = clockAt('2015-08-30T12:36:00Z');

type Seen = { url: URL; init: HttpInit };

const httpSaying = (status: number, body: unknown, seen: Seen[] = []): Http => ({
  fetch: (url, init) => {
    seen.push({ url, init });
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  },
});

/** An `Http` that must not be called, which is most of the eight kinds. */
const NO_HTTP: Http = {
  fetch: () => {
    throw new assert.AssertionError({ message: 'this kind made a network call and none of them should' });
  },
};

const deps = (http: Http = NO_HTTP, clock: Clock = CLOCK) => ({ http, clock });

/** The instant `CLOCK` reads, for the half of the surface that takes one rather than a port. */
const NOW = Date.parse('2015-08-30T12:36:00Z');

/* ── The eight kinds ─────────────────────────────────────────────────────────────────────────── */

const decl = (auth: AuthDecl): FetchDecl => ({ base: BASE, path: '/v1/things', auth, schedule: { every: '1h' } });

const grantOf = (fields: Record<string, string>): Grant => ({ id: 'grant_1', version: 3, fields });

const request = (over: Partial<ResolvedRequest> = {}): ResolvedRequest => ({
  url: new URL(`${BASE}/v1/things`),
  method: 'GET',
  headers: { accept: 'application/json' },
  ...over,
});

test('none sets nothing at all', async () => {
  const out = await applyAuth(decl({ kind: 'none' }), grantOf({}), request(), null, NOW);
  assert.deepEqual(out.headers, { accept: 'application/json' });
  assert.deepEqual(await tokenStep(decl({ kind: 'none' }), grantOf({}), deps()), { token: null, rotatedRefreshToken: null });
});

/* SIX OF THE EIGHT MAKE NO REQUEST AT ALL, and the `Http` that throws on use is what says so. A
   token step that ran for a static bearer would double every run's request count silently. */
test('only the two exchanging kinds reach the network for a token', async () => {
  const { pem } = await pemOf();
  for (const [auth, fields] of [
    [{ kind: 'bearer', grant: 'g' }, { token: 't' }],
    [{ kind: 'basic', grant: 'g' }, { username: 'a', password: 'b' }],
    [{ kind: 'header', grant: 'g', name: 'X-Key' }, { token: 't' }],
    [{ kind: 'query_param', grant: 'g', name: 'k' }, { token: 't' }],
    [{ kind: 'jwt_rs256', grant: 'g', mode: 'present', aud: 'a' }, { private_key: pem, iss: 'i' }],
    [{ kind: 'aws_sigv4', grant: 'g', region: 'r', service: 's' }, AWS_GRANT.fields],
  ] as [AuthDecl, Record<string, string>][])
    assert.deepEqual(await tokenStep(decl(auth), grantOf(fields), deps()), { token: null, rotatedRefreshToken: null }, auth.kind);
});

test('bearer is one space and the token', async () => {
  const out = await applyAuth(decl({ kind: 'bearer', grant: 'g' }), grantOf({ token: 'sk_live_42' }), request(), null, NOW);
  assert.equal(out.headers.authorization, 'Bearer sk_live_42');
});

/* BASE64 AND NOT BASE64URL. `Authorization: Basic` is defined over the standard alphabet with
   padding, and a password with the right bytes in it produces a `+` or a `/` — which base64url
   writes as `-` and `_`, and the provider decodes to something else entirely. */
test('basic is standard base64 of user:pass, padding and all', async () => {
  const out = await applyAuth(
    decl({ kind: 'basic', grant: 'g' }),
    grantOf({ username: 'ada', password: 'pw?>?>' }),
    request(),
    null,
    NOW,
  );
  assert.equal(out.headers.authorization, `Basic ${btoa('ada:pw?>?>')}`);
  assert.ok(out.headers.authorization.includes('+') || out.headers.authorization.includes('/'));
});

test('header uses the declared name and the grant token', async () => {
  const out = await applyAuth(
    decl({ kind: 'header', grant: 'g', name: 'X-Api-Key' }),
    grantOf({ token: 'k_77' }),
    request(),
    null,
    NOW,
  );
  assert.equal(out.headers['X-Api-Key'], 'k_77');
  assert.equal(out.headers.authorization, undefined);
});

/* `header` IS THE KIND THAT COULD SET ANY HEADER, so it is the kind the reserved list exists for.
   `name: Cookie` is a connector setting a cookie on somebody else's domain; `name: Authorization`
   is `bearer` written the long way round, past every check that reads the kind. */
test('header refuses a reserved name, and every one of them', async () => {
  for (const name of ['Cookie', 'Authorization', 'Host', 'Content-Length', 'Referer', 'Origin', 'X-Forwarded-For']) {
    const no = await refusal(() =>
      applyAuth(decl({ kind: 'header', grant: 'g', name }), grantOf({ token: 'k' }), request(), null, NOW));
    assert.equal(no.code, 'PULL_REQUEST_REFUSED', name);
    assert.equal(no.at, 'fetch.auth.name', name);
  }
});

test('query_param appends and does not replace what the path already carried', async () => {
  const out = await applyAuth(
    decl({ kind: 'query_param', grant: 'g', name: 'api_key' }),
    grantOf({ token: 'k/77' }),
    request({ url: new URL(`${BASE}/v1/things?since=2026-01-01`) }),
    null,
    NOW,
  );
  assert.equal(out.url.searchParams.get('since'), '2026-01-01');
  assert.equal(out.url.searchParams.get('api_key'), 'k/77');
  assert.equal(out.url.href, `${BASE}/v1/things?since=2026-01-01&api_key=k%2F77`);
});

/* A MISSING FIELD IS A CREDENTIAL FAULT AND NOT AN EMPTY HEADER. `Bearer ` with nothing after it is
   a 401 an hour later that points at the provider; the refusal points at the grant. */
test('a grant missing the field it needs is refused before the request is made', async () => {
  for (const [auth, fields] of [
    [{ kind: 'bearer', grant: 'g' }, {}],
    [{ kind: 'bearer', grant: 'g' }, { token: '' }],
    [{ kind: 'basic', grant: 'g' }, { username: 'ada' }],
  ] as [AuthDecl, Record<string, string>][]) {
    const no = await refusal(() => applyAuth(decl(auth), grantOf(fields), request(), null, NOW));
    assert.equal(no.code, 'PULL_AUTH_REJECTED');
  }
});

/* ── oauth2_refresh ──────────────────────────────────────────────────────────────────────────── */

const REFRESH: AuthDecl = {
  kind: 'oauth2_refresh',
  grant: 'g',
  token_url: 'https://auth.example.com/oauth/token',
  scope: 'read:things',
};

const REFRESH_GRANT = grantOf({ refresh_token: 'rt_old', client_id: 'cid', client_secret: 'cs' });

test('a refresh posts a form and carries the access token, never the refresh one', async () => {
  const seen: Seen[] = [];
  const step = await tokenStep(decl(REFRESH), REFRESH_GRANT, deps(httpSaying(200, { access_token: 'at_new', expires_in: 3600 }, seen)));
  const out = await applyAuth(decl(REFRESH), REFRESH_GRANT, request(), step.token, NOW);

  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url.href, 'https://auth.example.com/oauth/token');
  assert.equal(seen[0]?.init.method, 'POST');
  assert.equal(seen[0]?.init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(
    seen[0]?.init.body,
    'grant_type=refresh_token&refresh_token=rt_old&client_id=cid&client_secret=cs&scope=read%3Athings',
  );
  assert.equal(out.headers.authorization, 'Bearer at_new');
  assert.equal(step.rotatedRefreshToken, null);
});

/* AND IT IS THE STEP THAT COSTS A REQUEST, so the page loop must not be able to make one. `applyAuth`
   takes the token and no `Http` at all: forty pages of a rotating connector used to mint thirty-nine
   refresh tokens and throw away all but the last, which was also the only one that still worked. */
test('applying a refreshed credential to forty pages makes no further requests', async () => {
  const step = await tokenStep(decl(REFRESH), REFRESH_GRANT, deps(httpSaying(200, { access_token: 'at_new' })));
  for (let page = 0; page < 40; page += 1) {
    const out = await applyAuth(decl(REFRESH), REFRESH_GRANT, request(), step.token, NOW);
    assert.equal(out.headers.authorization, 'Bearer at_new');
  }
});

/* AND A PAGE APPLIED WITHOUT ONE IS A REFUSAL, not a request with no credential on it. */
test('presenting a token the step never fetched is refused', async () => {
  const no = await refusal(() => applyAuth(decl(REFRESH), REFRESH_GRANT, request(), null, NOW));
  assert.equal(no.code, 'PULL_AUTH_REJECTED');
  assert.equal(no.at, 'fetch.auth');
});

/* THE PROVIDER THAT ROTATES HAS ALREADY INVALIDATED THE OLD TOKEN. Dropping the new one is a
   connector that works for exactly one run and then pauses on a credential nobody touched. */
test('a rotated refresh token comes back, and an unchanged one does not', async () => {
  const rotated = await tokenStep(decl(REFRESH), REFRESH_GRANT, deps(httpSaying(200, { access_token: 'at_new', refresh_token: 'rt_new' })));
  assert.equal(rotated.rotatedRefreshToken, 'rt_new');

  const same = await tokenStep(decl(REFRESH), REFRESH_GRANT, deps(httpSaying(200, { access_token: 'at_new', refresh_token: 'rt_old' })));
  assert.equal(same.rotatedRefreshToken, null);
});

/* 401 AND 403 ARE THE CREDENTIAL; EVERYTHING ELSE IS THE PROVIDER. One pauses the connector until a
   person reconnects it, the other waits for the next attempt, and folding them together gets both
   wrong: a connector paused through an outage, or a dead token retried on a ladder forever. */
test('the token step tells a rejected credential from a provider having a bad day', async () => {
  for (const status of [401, 403]) {
    const no = await refusal(() => tokenStep(decl(REFRESH), REFRESH_GRANT, deps(httpSaying(status, {}))));
    assert.equal(no.code, 'PULL_AUTH_REJECTED', String(status));
    assert.equal(no.at, 'fetch.auth.token_url');
  }
  for (const status of [429, 500, 502, 503]) {
    const no = await refusal(() => tokenStep(decl(REFRESH), REFRESH_GRANT, deps(httpSaying(status, {}))));
    assert.equal(no.code, 'PULL_PROVIDER_UNAVAILABLE', String(status));
  }
  const shape = await refusal(() =>
    tokenStep(decl(REFRESH), REFRESH_GRANT, deps(httpSaying(200, { token: 'wrong key' }))));
  assert.equal(shape.code, 'PULL_SHAPE_MISMATCH');
});

test('a token endpoint that is not https is refused rather than called', async () => {
  const no = await refusal(() =>
    tokenStep(decl({ ...REFRESH, token_url: 'http://auth.example.com/oauth/token' }), REFRESH_GRANT, deps()));
  assert.equal(no.code, 'PULL_REQUEST_REFUSED');
});

/* ── jwt_rs256 ───────────────────────────────────────────────────────────────────────────────── */

const pemOf = async (): Promise<{ pem: string; verify: Key }> => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let b64 = '';
  for (const b of pkcs8) b64 += String.fromCharCode(b);
  const body = (btoa(b64).match(/.{1,64}/gu) ?? []).join('\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, verify: pair.publicKey };
};

const partOf = (jwt: string, i: number): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(unb64url(jwt.split('.')[i] ?? ''))) as Record<string, unknown>;

test('a present-mode assertion is an RS256 JWT the public half verifies', async () => {
  const { pem, verify } = await pemOf();
  const out = await applyAuth(
    decl({ kind: 'jwt_rs256', grant: 'g', mode: 'present', aud: 'https://api.example.com/', ttl_s: 900 }),
    grantOf({ private_key: pem, iss: 'brain@example.iam', kid: 'k1' }),
    request(),
    null,
    NOW,
  );

  const jwt = (out.headers.authorization ?? '').replace('Bearer ', '');
  assert.deepEqual(partOf(jwt, 0), { alg: 'RS256', typ: 'JWT', kid: 'k1' });
  assert.deepEqual(partOf(jwt, 1), {
    iss: 'brain@example.iam',
    aud: 'https://api.example.com/',
    iat: 1_440_938_160,
    exp: 1_440_939_060,
  });

  const [head, claims, sig] = jwt.split('.');
  assert.ok(
    await crypto.subtle.verify('RSASSA-PKCS1-v1_5', verify, unb64url(sig ?? ''), utf8.encode(`${head}.${claims}`)),
    'the signature does not verify under the key that made it',
  );
});

test('exchange mode posts the assertion and presents what comes back', async () => {
  const { pem } = await pemOf();
  const seen: Seen[] = [];
  const exchange = decl({
    kind: 'jwt_rs256', grant: 'g', mode: 'exchange', aud: 'https://oauth2.example.com/token',
    token_url: 'https://oauth2.example.com/token', scope: 'read',
  });
  const grant = grantOf({ private_key: pem, iss: 'brain@example.iam' });
  const step = await tokenStep(exchange, grant, deps(httpSaying(200, { access_token: 'at_exchanged' }, seen)));
  const out = await applyAuth(exchange, grant, request(), step.token, NOW);
  assert.equal(out.headers.authorization, 'Bearer at_exchanged');
  assert.ok(seen[0]?.init.body?.startsWith('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='));
  assert.equal(partOf(String(seen[0]?.init.body).split('assertion=')[1] ?? '', 1).scope, 'read');
});

test('a grant whose private key is not a PEM is a credential fault and not a crash', async () => {
  const auth: AuthDecl = { kind: 'jwt_rs256', grant: 'g', mode: 'present', aud: 'a' };
  for (const key of ['not a key at all', '-----BEGIN PRIVATE KEY-----\nbm90IGEga2V5\n-----END PRIVATE KEY-----']) {
    const no = await refusal(() => applyAuth(decl(auth), grantOf({ private_key: key, iss: 'i' }), request(), null, NOW));
    assert.equal(no.code, 'PULL_AUTH_REJECTED');
  }
});

/* ── aws_sigv4 ───────────────────────────────────────────────────────────────────────────────── */

const SIGV4: AuthDecl = { kind: 'aws_sigv4', grant: 'g', region: 'us-east-1', service: 'service' };
const AWS_GRANT = grantOf({
  access_key_id: 'AKIDEXAMPLE',
  secret_access_key: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
});

/**
 * AWS'S OWN `get-vanilla` VECTOR, WHICH SIGNS EXACTLY THE HEADER SET `47 §4.5` FIXES.
 *
 * A signer tested only against itself is a signer that reproduces its own mistake for ever. This is
 * the one case here whose expected value comes from outside the repository, and it is the reason
 * the others can be structural.
 */
test('the AWS get-vanilla vector signs byte for byte', async () => {
  const out = await applyAuth(
    decl(SIGV4),
    AWS_GRANT,
    request({ url: new URL('https://example.amazonaws.com/'), headers: {} }),
    null,
    Date.parse('2015-08-30T12:36:00Z'),
  );
  assert.equal(out.headers['x-amz-date'], '20150830T123600Z');
  assert.equal(
    out.headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
      'SignedHeaders=host;x-amz-date, ' +
      'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  );
});

test('a session token is signed as well as sent, or the signature is over the wrong header set', async () => {
  const out = await applyAuth(
    decl(SIGV4),
    grantOf({ ...AWS_GRANT.fields, session_token: 'st_1' }),
    request({ url: new URL('https://example.amazonaws.com/'), headers: {} }),
    null,
    NOW,
  );
  assert.equal(out.headers['x-amz-security-token'], 'st_1');
  assert.ok(out.headers.authorization?.includes('SignedHeaders=host;x-amz-date;x-amz-security-token'));
});

/* A SIGNATURE THAT DOES NOT MOVE WITH THE REQUEST IS NOT A SIGNATURE. Each of these changes one
   thing the canonical request is built from, and each must change the hex. */
test('the signature covers the method, the path, the query and the body', async () => {
  const sign = async (over: Partial<ResolvedRequest>): Promise<string> =>
    String(
      (await applyAuth(decl(SIGV4), AWS_GRANT, request({ url: new URL('https://example.amazonaws.com/'), headers: {}, ...over }), null, NOW))
        .headers.authorization,
    ).split('Signature=')[1] ?? '';

  const base = await sign({});
  assert.equal(await sign({}), base, 'the same request signed twice gave two signatures');
  for (const [what, over] of [
    ['the method', { method: 'POST' as const }],
    ['the path', { url: new URL('https://example.amazonaws.com/things') }],
    ['the query', { url: new URL('https://example.amazonaws.com/?a=1') }],
    ['the body', { method: 'POST' as const, body: '{"a":1}' }],
  ] as [string, Partial<ResolvedRequest>][])
    assert.notEqual(await sign(over), base, `${what} did not change the signature`);
});

/* ── The sealed grant ────────────────────────────────────────────────────────────────────────── */

const sealed = async (): Promise<{ store: KeyStore; dek: WrappedDek; open: Sealed }> => {
  const kek = await kekOf();
  const store = storeOf({ kek_1: kek });
  const dek = await wrapDek(kek, 'kek_1', RECORD);
  const open = await seal(utf8.encode('rt_secret'), 'grant_1', 4, dek, RECORD, store);
  return { store, dek, open };
};

test('what seal wrote, openSealed reads', async () => {
  const { store, dek, open } = await sealed();
  assert.equal(open.grant_id, 'grant_1');
  assert.equal(open.version, 4);
  assert.equal(open.kek_id, 'kek_1');
  assert.equal(unb64url(open.nonce).length, 12, 'a nonce is twelve bytes');
  assert.equal(new TextDecoder().decode(await openSealed(open, dek, RECORD, store)), 'rt_secret');
});

/* A FRESH NONCE EVERY TIME. AES-GCM with a repeated nonce under one key leaks the XOR of the two
   plaintexts and the authentication key with it — the one way to use this cipher that is worse than
   not using it. Two seals of one value must not produce one ciphertext. */
test('two seals of the same bytes are two different ciphertexts', async () => {
  const kek = await kekOf();
  const store = storeOf({ kek_1: kek });
  const dek = await wrapDek(kek, 'kek_1', RECORD);
  const a = await seal(utf8.encode('rt'), 'grant_1', 4, dek, RECORD, store);
  const b = await seal(utf8.encode('rt'), 'grant_1', 4, dek, RECORD, store);
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

/* THE ROOT KEY ROTATING IS AN OPERATIONAL EVENT WITH A REPAIR, so it is a code and a sentence and
   not a stack trace in a queue consumer. */
test('a kek_id this host does not hold is WRONG_KEY and says what to do', async () => {
  const { store, dek, open } = await sealed();
  const no = await refusal(() => openSealed(open, { ...dek, kek_id: 'kek_gone' }, RECORD, store));
  assert.equal(no.code, 'WRONG_KEY');
  assert.match(no.fix, /re-wrap the connector key/u);
});

/**
 * THE THREE MOVES, AND NONE OF THEM IS A CHECK SOMEBODY HAD TO REMEMBER TO WRITE.
 *
 * A wrapping that is not bound is a wrapping that can be moved, and the interesting move is not an
 * attacker's — it is a migration that copies a blob into the wrong row, and a connector that then
 * authenticates to one provider with another's credential. The record, the grant and the version
 * are all in the additional data, so each move fails to decrypt rather than opening as somebody
 * else's secret.
 */
test('a sealed grant moved to another record, grant or version does not open', async () => {
  const { store, dek, open } = await sealed();
  const kek = await kekOf();
  const elsewhere = storeOf({ kek_1: kek });

  await assert.rejects(() => openSealed(open, dek, 'rec_OTHER', store), 'it opened under another record');
  await assert.rejects(() => openSealed({ ...open, grant_id: 'grant_2' }, dek, RECORD, store), 'it opened under another grant');
  await assert.rejects(() => openSealed({ ...open, version: 5 }, dek, RECORD, store), 'it opened at another version');
  const otherDek = await wrapDek(kek, 'kek_1', RECORD);
  await assert.rejects(() => openSealed(open, otherDek, RECORD, elsewhere), 'it opened under another root key');
});

/* `47 §9`: the rotation, end to end. The run opens version 3, the provider hands back a new token,
   and what goes to the record is sealed at version 4 and opens to the new one. */
test('a rotated refresh token seals at version + 1 and reads back as the new token', async () => {
  const kek = await kekOf();
  const store = storeOf({ kek_1: kek });
  const dek = await wrapDek(kek, 'kek_1', RECORD);
  const grant = grantOf({ refresh_token: 'rt_old', client_id: 'cid', client_secret: 'cs' });

  const step = await tokenStep(decl(REFRESH), grant, deps(httpSaying(200, { access_token: 'at', refresh_token: 'rt_new' })));
  assert.equal(step.rotatedRefreshToken, 'rt_new');

  const next = await seal(utf8.encode(step.rotatedRefreshToken ?? ''), grant.id, grant.version + 1, dek, RECORD, store);
  assert.equal(next.version, 4);
  assert.equal(new TextDecoder().decode(await openSealed(next, dek, RECORD, store)), 'rt_new');
  /* AND THE OLD VERSION IS NOT WHAT IT OPENS AT, which is the point of the version being in the AAD:
     a replay of the previous sealed row is a replay of a token the provider has already retired. */
  await assert.rejects(() => openSealed({ ...next, version: 3 }, dek, RECORD, store));
});

/* ── The one value that leaves ───────────────────────────────────────────────────────────────── */

/* THE SECRET IS NOT IN THE MESSAGE. `30 §6` says a refusal carries a sentence a person can act on,
   and a sentence carrying the credential is a credential in every log that ever prints one. */
test('no refusal repeats the secret it was holding', async () => {
  const no = await refusal(() =>
    applyAuth(
      decl({ kind: 'header', grant: 'g', name: 'Cookie' }),
      grantOf({ token: 'sk_live_DO_NOT_PRINT' }),
      request(),
      null,
      NOW,
    ));
  assert.ok(!no.message.includes('sk_live_DO_NOT_PRINT'), no.message);
  assert.ok(!no.fix.includes('sk_live_DO_NOT_PRINT'));
});
