/**
 * The request half: what a placeholder becomes, and every way a value could take a request somewhere
 * it was not declared to go.
 *
 * MOST OF THIS FILE IS THE SECOND KIND. A connector runs unattended, against somebody else's system,
 * with a credential attached, and the value substituted into its path came out of a database — so
 * the interesting cases are not `{grant.account}` reading `acme`, they are `{grant.account}` reading
 * `../admin`, `//evil.example`, `%2e%2e%2fadmin` and a whole URL. `47 §9`'s property test fuzzes that
 * space at a thousand runs; the table here is its floor and the thing that fails first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  expect, matchesCond, PullError, resolveRequest,
  type Expect, type FetchDecl, type Grant, type Json, type PageState, type Scalar, type Window,
} from '../src/index.ts';

const BASE = 'https://api.example.com';
const TZ = 'Africa/Cairo';

const WINDOW: Window = {
  since: Date.parse('2026-01-01T00:00:00.000Z'),
  until: Date.parse('2026-01-01T22:00:00.000Z'),
};

const GRANT: Grant = {
  id: 'gr_1',
  version: 1,
  fields: { account: 'acme', zone: 'z_9', token: 'sk_live_dont_print_me', client_id: 'cid_7' },
};

const decl = (over: Partial<FetchDecl> = {}): FetchDecl => ({
  base: BASE,
  path: '/v1/x',
  auth: { kind: 'bearer', grant: 'gr_1' },
  schedule: { every: '1h' },
  ...over,
});

const resolve = (over: Partial<FetchDecl> = {}, page: PageState | null = null, probe: Record<string, Scalar> = {}) =>
  resolveRequest(decl(over), page, GRANT, probe, WINDOW, TZ);

/** The code a refusal carried, so a test asserts the code rather than a message. */
const refusal = (fn: () => unknown): PullError => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof PullError, `threw something that is not a PullError: ${String(e)}`);
    return e;
  }
  throw new assert.AssertionError({ message: 'nothing was thrown, and a refusal was wanted' });
};

/* ── Substitution ────────────────────────────────────────────────────────────────────────────── */

test('a grant field lands in the path', () => {
  assert.equal(resolve({ path: '/v1/{grant.account}/x' }).url.pathname, '/v1/acme/x');
});

test('the two instants format five ways, and the day is the record’s day and not UTC’s', () => {
  const at = (path: string) => resolve({ path }).url.pathname;
  assert.equal(at('/{since:epoch_s}'), '/1767225600');
  assert.equal(at('/{since:epoch_ms}'), '/1767225600000');
  assert.equal(at('/{since}'), '/2026-01-01T00%3A00%3A00.000Z');
  assert.equal(at('/{since:date}'), '/2026-01-01');
  /* 22:00 UTC is already the next day in Cairo, which is the whole reason `tz` is threaded through
     this function rather than assumed. A window asked for in UTC days would fetch the wrong day
     every evening and look completely normal doing it. */
  assert.equal(at('/{until:date}'), '/2026-01-02');
});

test('a page value is the paginator’s, and there is no page without one', () => {
  assert.equal(resolve({ path: '/p/{page}' }, { kind: 'page_number', value: 3 }).url.pathname, '/p/3');
  assert.equal(refusal(() => resolve({ path: '/p/{page}' })).code, 'PULL_REQUEST_REFUSED');
  /* `link_header` REPLACES THE WHOLE URL, so a number is not a thing it has. */
  assert.equal(refusal(() => resolve({ path: '/p/{page}' }, { kind: 'link_header', url: 'https://x' })).code, 'PULL_REQUEST_REFUSED');
});

test('a probe value lands, and one the probe never read is refused rather than emptied', () => {
  assert.equal(resolve({ path: '/s/{probe.site}' }, null, { site: 'oxbow' }).url.pathname, '/s/oxbow');
  const no = refusal(() => resolve({ path: '/s/{probe.missing}' }, null, { site: 'oxbow' }));
  assert.equal(no.code, 'PULL_REQUEST_REFUSED');
  assert.equal(no.at, 'fetch.path');
});

/* THE ONE THAT IS ABOUT THE CREDENTIAL. `47 §4.6` closes the secret field names per auth kind, and
   the refusal happens before a request is built — not before it is sent, before it is BUILT, so the
   token never reaches a string that could be logged. */
test('a placeholder naming the secret is refused, and a non-secret field of the same grant is not', () => {
  const no = refusal(() => resolve({ path: '/v1/{grant.token}' }));
  assert.equal(no.code, 'PULL_REQUEST_REFUSED');
  assert.equal(no.at, 'fetch.path');
  assert.ok(!no.message.includes('sk_live'), 'the refusal repeated the secret it refused');
  assert.equal(resolve({ path: '/v1/{grant.client_id}' }).url.pathname, '/v1/cid_7');
});

test('a grant field this grant does not hold is refused rather than substituted empty', () => {
  assert.equal(refusal(() => resolve({ path: '/v1/{grant.nope}' })).code, 'PULL_REQUEST_REFUSED');
});

test('anything that is not exactly the grammar is text', () => {
  /* A GRAPHQL BODY HAS TO SURVIVE THIS. Braces are its syntax, and a renderer that rewrote them
     would break the one connector shape the spec names twice. */
  const body = {
    query: 'query { viewer { zones(filter: {zoneTag: "{grant.zone}"}) } }',
    /* NEARLY A PLACEHOLDER IS NOT ONE: a space inside the braces, a name nothing knows, a format
       that is not one of the five. Each is left exactly as written. */
    nearly: '{ since } {siince} {since:week} {grant.Zone}',
  };
  const out = JSON.parse(resolve({ method: 'POST', body }).body ?? '') as Record<string, string>;
  assert.equal(out.query, 'query { viewer { zones(filter: {zoneTag: "z_9"}) } }');
  assert.equal(out.nearly, '{ since } {siince} {since:week} {grant.Zone}');
});

test('a body leaf that is exactly one integer placeholder is a JSON number', () => {
  const body = { limit: '{page:int}', label: 'page {page:int}' };
  const out = JSON.parse(resolve({ method: 'POST', body }, { kind: 'page_number', value: 3 }).body ?? '') as Record<string, unknown>;
  assert.equal(out.limit, 3);
  assert.equal(out.label, 'page 3');
});

test('a body only goes with POST', () => {
  assert.equal(refusal(() => resolve({ body: { a: '1' } })).at, 'fetch.body');
});

/* ── Headers ─────────────────────────────────────────────────────────────────────────────────── */

test('a header value is substituted raw, because a header is not a URL', () => {
  const { headers } = resolve({ headers: { 'Stripe-Account': '{grant.account}', 'X-Window': '{since}' } });
  assert.equal(headers['Stripe-Account'], 'acme');
  assert.equal(headers['X-Window'], '2026-01-01T00:00:00.000Z');
});

/* `Authorization` IS SET IN ONE PLACE AND THAT PLACE IS `applyAuth`. A declaration that spells it is
   a declaration putting a credential in a file, which `42 §4` refuses at install — and this refuses
   again at run, because between the two sits a database. */
test('the reserved header names are refused, by name and by prefix, whatever their case', () => {
  for (const name of ['Authorization', 'authorization', 'Cookie', 'Host', 'Content-Length', 'Referer', 'Origin', 'X-Forwarded-For'])
    assert.equal(refusal(() => resolve({ headers: { [name]: 'x' } })).at, `fetch.headers.${name}`, name);
  assert.equal(resolve({ headers: { 'X-Api-Key': 'x' } }).headers['X-Api-Key'], 'x');
});

test('a header value outside visible ASCII is refused rather than encoded', () => {
  const grant: Grant = { ...GRANT, fields: { ...GRANT.fields, account: 'acmé' } };
  const no = refusal(() => resolveRequest(decl({ headers: { 'X-A': '{grant.account}' } }), null, grant, {}, WINDOW, TZ));
  assert.equal(no.code, 'PULL_REQUEST_REFUSED');
  /* And the same value in a path is fine, because a path has one encoding and everyone agrees on it. */
  assert.equal(resolveRequest(decl({ path: '/{grant.account}' }), null, grant, {}, WINDOW, TZ).url.pathname, '/acm%C3%A9');
});

/* ── Query ───────────────────────────────────────────────────────────────────────────────────── */

test('an array repeats the key, and the key is encoded too', () => {
  const { url } = resolve({ query: { 'expand[]': ['a', 'b'], limit: 100 } });
  assert.equal(url.search, '?expand%5B%5D=a&expand%5B%5D=b&limit=100');
});

test('a query value is substituted and encoded', () => {
  assert.equal(resolve({ query: { start: '{since:date}', who: '{grant.account}' } }).url.search, '?start=2026-01-01&who=acme');
});

/* ── The origin, which is the check the whole file is for ────────────────────────────────────── */

/**
 * THE TABLE. Each row is a grant value somebody could put in a connector's account field, and the
 * only two acceptable answers are `PULL_ORIGIN_REFUSED` or a URL still on `base`. A third answer —
 * a request to somewhere else — is the vulnerability, and it would look exactly like a working
 * connector until the day it did not.
 */
test('no substituted value takes a request off its origin', () => {
  const escapes = [
    '../admin',
    '../../../../etc/passwd',
    '..%2fadmin',
    '%2e%2e%2fadmin',
    '/../admin',
    '..\\admin',
    '//evil.example/x',
    '@evil.example',
    'https://evil.example/x',
    'x?a=b#c',
    'x:8080',
    'acme/../../admin',
  ];
  for (const account of escapes) {
    const grant: Grant = { ...GRANT, fields: { ...GRANT.fields, account } };
    let url: URL | null = null;
    try {
      url = resolveRequest(decl({ path: '/v1/{grant.account}/x' }), null, grant, {}, WINDOW, TZ).url;
    } catch (e) {
      assert.ok(e instanceof PullError, account);
      assert.equal(e.code, 'PULL_ORIGIN_REFUSED', account);
      continue;
    }
    assert.equal(url.origin, BASE, account);
    assert.ok(!url.pathname.split('/').includes('..'), account);
  }
});

test('a traversal that only exists once decoded is still a traversal', () => {
  const grant: Grant = { ...GRANT, fields: { ...GRANT.fields, account: '../admin' } };
  const no = refusal(() => resolveRequest(decl({ path: '/v1/{grant.account}/x' }), null, grant, {}, WINDOW, TZ));
  assert.equal(no.code, 'PULL_ORIGIN_REFUSED');
});

test('the method defaults to GET and the base is not rewritten', () => {
  const { url, method } = resolve();
  assert.equal(method, 'GET');
  assert.equal(url.href, 'https://api.example.com/v1/x');
});

/* ── expect ──────────────────────────────────────────────────────────────────────────────────── */

const BODY: Json = {
  object: 'list',
  start: '2025-02-27',
  has_more: false,
  meta: { sampled: true },
  data: [{ status: 'ok' }, { status: 'ok' }, { status: 'pending' }],
};

const checked = (...e: Expect[]) => expect(decl({ expect: e }), BODY, WINDOW, TZ);

/* THE CLAMP. npm answers a window it chose rather than the one it was asked for, and the only thing
   that catches it is comparing the answer's `start` with the request's `{since:date}` — which is why
   `eq` substitutes and `is` does not. */
test('eq substitutes the literal, so a server that moved the window is caught', () => {
  const out = checked({ path: 'start', eq: '{since:date}' });
  assert.equal(out.ok, false);
  assert.ok(!out.ok && out.failed.found === '2025-02-27');
  assert.ok(!out.ok && out.failed.wanted === '2026-01-01');
  assert.ok(!out.ok && out.severity === 'review');
});

test('is compares a bare literal, braces and all', () => {
  assert.equal(checked({ path: 'object', is: 'list' }).ok, true);
  assert.equal(checked({ path: 'object', is: 'set' }).ok, false);
  assert.equal(checked({ path: 'has_more', is: false }).ok, true);
});

test('a list is implicitly all, and the element named is the one that failed', () => {
  const out = checked({ path: 'data[].status', is: 'ok' });
  assert.equal(out.ok, false);
  assert.ok(!out.ok && out.failed.found === 'pending');
});

test('a warning does not stop the page, and is carried to the finish', () => {
  const out = checked({ path: 'meta.sampled', is_not: true, on_fail: 'warn' });
  assert.equal(out.ok, true);
  assert.deepEqual(out.warnings.map((w) => w.at), ['meta.sampled']);
});

test('present and absent are about the step, not about the value', () => {
  assert.equal(checked({ path: 'meta.sampled', present: true }).ok, true);
  assert.equal(checked({ path: 'meta.nope', absent: true }).ok, true);
  assert.equal(checked({ path: 'meta.nope', present: true }).ok, false);
});

test('the three string operators are byte-wise and only over a string', () => {
  assert.equal(checked({ path: 'start', starts: '2025' }).ok, true);
  assert.equal(checked({ path: 'start', ends: '27' }).ok, true);
  assert.equal(checked({ path: 'start', contains: '02-27' }).ok, true);
  /* A NUMBER THAT READS AS ONE IS NOT ONE. `contains: "fals"` over `false` the boolean is a shape
     question dressed as a string question. */
  assert.equal(checked({ path: 'has_more', contains: 'fals' }).ok, false);
});

/* `25 §5.1`'s OWN EXAMPLE, `starts: "{since:date}"`, which read bare could never match: Plausible echoes its range
   as instants, and the check is whether the first one starts on the day the window asked for. */
test('the three string operators substitute the literal, as eq does', () => {
  const echoed = { query: { date_range: ['2026-01-01T00:00:00+02:00', '2026-01-02T00:00:00+02:00'] } };
  const range = (e: Expect) => expect(decl({ expect: [e] }), echoed, WINDOW, TZ);
  assert.equal(range({ path: 'query.date_range[0]', starts: '{since:date}' }).ok, true);
  assert.equal(range({ path: 'query.date_range[0]', contains: '{since:date}T' }).ok, true);
  assert.equal(range({ path: 'query.date_range[1]', starts: '{until:date}' }).ok, true);
  /* A window that moved fails, and says the day it wanted rather than the placeholder. */
  const moved = expect(decl({ expect: [{ path: 'query.date_range[0]', starts: '{since:date}' }] }), echoed, { ...WINDOW, since: Date.parse('2025-12-30T22:00:00.000Z') }, TZ);
  assert.equal(moved.ok, false);
  assert.ok(!moved.ok && moved.failed.wanted === 'something starting "2025-12-31"');
  /* A brace group that is no placeholder is still literal text. */
  assert.equal(expect(decl({ expect: [{ path: 'q', contains: '{x}' }] }), { q: 'a {x} b' }, WINDOW, TZ).ok, true);
});

test('len_lte and len_gte read a string or a list and nothing else', () => {
  assert.equal(checked({ path: 'data', len_lte: 3 }).ok, true);
  assert.equal(checked({ path: 'data', len_gte: 4 }).ok, false);
  assert.equal(checked({ path: 'start', len_lte: 10 }).ok, true);
  assert.equal(checked({ path: 'has_more', len_gte: 1 }).ok, false);
});

/* THE CAP IS `where:`'s AND IT IS LINT'S RULE, asserted here because a 41-byte literal that reached
   run time would be a `declare` that stopped checking, and this is the second place it shows. */
test('a string literal over forty bytes is refused', () => {
  assert.equal(refusal(() => checked({ path: 'start', contains: 'x'.repeat(41) })).code, 'PULL_REQUEST_REFUSED');
  assert.equal(checked({ path: 'start', contains: 'x'.repeat(40) }).ok, false);
});

test('the first review stops the run of checks and the warnings before it survive', () => {
  const out = checked(
    { path: 'meta.sampled', is_not: true, on_fail: 'warn' },
    { path: 'object', is: 'set' },
    { path: 'start', is: 'never reached' },
  );
  assert.equal(out.ok, false);
  assert.ok(!out.ok && out.failed.at === 'object');
  assert.equal(out.warnings.length, 1);
});

test('a page with nothing expected of it passes', () => {
  assert.deepEqual(expect(decl(), BODY, WINDOW, TZ), { ok: true, warnings: [] });
});

/* ── on_error ────────────────────────────────────────────────────────────────────────────────── */

test('a status list and a body path are the two kinds of error condition', () => {
  assert.equal(matchesCond({ status_in: [429, 503] }, 429, BODY, WINDOW, TZ), true);
  assert.equal(matchesCond({ status_in: [429, 503] }, 200, BODY, WINDOW, TZ), false);
  /* Cloudflare answers 200 with an `errors` key, which is the case a status list cannot see. */
  assert.equal(matchesCond({ path: 'errors', present: true }, 200, { errors: [{ m: 'no' }] }, WINDOW, TZ), true);
  assert.equal(matchesCond({ path: 'errors', present: true }, 200, BODY, WINDOW, TZ), false);
});
