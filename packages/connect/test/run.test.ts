/**
 * The run, end to end, over a memory `Http` — and mostly the ways it ends badly.
 *
 * THE OUTCOME IS THE ASSERTION AND NOT THE ROWS. Every one of the five means a different repair,
 * and the expensive mistakes are all folds: a connector paused through a provider's bad afternoon,
 * a dead credential retried for a week, a half-fetched day written as though it were a whole one.
 * So each case here asserts the outcome, the ack, the cursor and what reached the record — because
 * three of those four can be right while the fourth quietly loses a day of somebody's revenue.
 *
 * AND `runPull` MUST NOT THROW. A host draining five leased rows concurrently cannot have one
 * connector's refusal take the other four with it, so every provider behaviour in here is asserted
 * as a returned `PullResult` rather than as a rejection.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readRows, UNPARSEABLE } from '@braindog/extract';
import type { Clock, Http, HttpInit } from '@braindog/ports';

import {
  runPull,
  seal,
  type ConnectDeps, type Cursor, type Extraction, type ExtractFn, type IngestDecl, type OutboxRow,
  type PullFinish, type PullPage, type PullPayload, type Sealed, type WrappedDek,
} from '../src/index.ts';

import { kekOf, storeOf, wrapDek } from './grants.ts';

const BASE = 'https://api.example.com';
const RECORD = 'rec_9fK2';
const CAIRO = 'Africa/Cairo';
const NOW = Date.parse('2026-01-20T09:00:00Z');
const SLOT = '2026-01-20T08:00:00Z';

const utf8 = new TextEncoder();

/* ── The provider ────────────────────────────────────────────────────────────────────────────── */

type Answer = { status?: number; body?: unknown; headers?: Record<string, string>; throws?: string };
type Call = { url: URL; init: HttpInit };

/**
 * One scripted answer per call, in order.
 *
 * A SCRIPT AND NOT A HANDLER, because what a test is usually asserting is how MANY calls were made:
 * one token step for a four-page run, no call at all for a window with nothing in it. A handler
 * that answered the same body forever would pass both of those without being asked.
 */
const provider = (answers: Answer[], seen: Call[] = []): Http => {
  let i = 0;
  return {
    fetch: (url, init) => {
      seen.push({ url, init });
      const answer = answers[i] ?? answers.at(-1) ?? {};
      i += 1;
      if (answer.throws !== undefined) {
        const e = new Error(answer.throws);
        e.name = answer.throws;
        return Promise.reject(e);
      }
      return Promise.resolve(
        new Response(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {}), {
          status: answer.status ?? 200,
          headers: { 'content-type': 'application/json', ...answer.headers },
        }),
      );
    },
  };
};

const NO_HTTP: Http = {
  fetch: (url) => {
    throw new assert.AssertionError({ message: `a request was made and none was wanted: ${url.href}` });
  },
};

/* ── The record ──────────────────────────────────────────────────────────────────────────────── */

type Written = { pages: PullPage[]; ack: { state: 'done' | 'failed'; result?: PullFinish; error?: string } | null };

const recorder = (): { api: ConnectDeps['record']; wrote: Written } => {
  const wrote: Written = { pages: [], ack: null };
  return {
    wrote,
    api: {
      applyPull: (args) => {
        wrote.pages.push(args);
        return Promise.resolve({ wrote: args.rows.length, kept: 0 });
      },
      ackOutbox: (_id, state, result, error) => {
        assert.equal(wrote.ack, null, 'a run acked its row twice');
        wrote.ack = { state, ...(result === undefined ? {} : { result }), ...(error === undefined ? {} : { error }) };
        return Promise.resolve();
      },
    },
  };
};

/* ── The extractor ───────────────────────────────────────────────────────────────────────────── */

/** `43`'s extractor, stubbed: every element of `items` is a row, as it came. */
const extract: ExtractFn = (_decl, raw): Extraction => {
  const body = JSON.parse(raw.body) as { items?: Record<string, unknown>[] };
  const rows = (body.items ?? []).map((item) => ({
    fields: item as Extraction['rows'][number]['fields'],
    confidence: (item.at === undefined ? 'needs-review' : 'exact') as 'exact' | 'needs-review',
    outcome: {},
  }));
  return { rows, confidence: 'exact' };
};

/* ── The job ─────────────────────────────────────────────────────────────────────────────────── */

const clockAt = (ms: number): Clock => ({ now: () => ms });

const registerDecl = (over: Partial<IngestDecl['fetch']> = {}): IngestDecl => ({
  id: 'acme-orders',
  fetch: {
    base: BASE,
    path: '/v1/orders',
    auth: { kind: 'none' },
    schedule: { every: '1h' },
    page: { kind: 'page_number', param: 'page' },
    read: { rows: 'items' },
    ...over,
  },
  writes: { register: 'orders' },
});

const seriesDecl = (over: Partial<IngestDecl['fetch']> = {}): IngestDecl => ({
  id: 'acme-revenue',
  fetch: {
    base: BASE,
    path: '/v1/revenue',
    auth: { kind: 'none' },
    schedule: { every: '1h' },
    window: { grain: 'day', start: '2026-01-18' },
    page: { kind: 'page_number', param: 'page' },
    read: { rows: 'items' },
    ...over,
  },
  writes: { series: 'revenue', kind: 'flow', unit: 'money.EGP' },
});

const jobOf = (
  decl: IngestDecl,
  over: Partial<PullPayload> = {},
  leasedUntil = new Date(NOW + 300_000).toISOString(),
): OutboxRow<'pull.fetch'> => ({
  id: 'ob_1',
  kind: 'pull.fetch',
  leased_until: leasedUntil,
  attempts: 0,
  payload: {
    ingest: decl.id,
    decl,
    declaration_version: 1,
    grant: null,
    dek: null,
    record: { id: RECORD, tz: CAIRO },
    cursor: { watermark: null },
    slot: SLOT,
    ...over,
  },
});

const depsOf = (http: Http, over: Partial<ConnectDeps> = {}): { deps: ConnectDeps; wrote: Written } => {
  const { api, wrote } = recorder();
  return {
    wrote,
    deps: {
      http,
      clock: clockAt(NOW),
      record: api,
      keys: storeOf({}),
      extract,
      currencies: { EGP: { exponent: 2 } },
      lookup: () => [],
      ...over,
    },
  };
};

const row = (at: string, value: number): Record<string, unknown> => ({ at, value });

/* ── A run that works ────────────────────────────────────────────────────────────────────────── */

test('three pages of a register are written as they land, and the run ends ok', async () => {
  const seen: Call[] = [];
  const { deps, wrote } = depsOf(
    provider(
      [
        { body: { items: [row('2026-01-19T10:00:00Z', 1), row('2026-01-19T11:00:00Z', 2)] } },
        { body: { items: [row('2026-01-19T12:00:00Z', 3)] } },
        { body: { items: [] } },
      ],
      seen,
    ),
  );
  const out = await runPull(jobOf(registerDecl()), deps);

  assert.equal(out.outcome, 'ok');
  assert.equal(out.pages, 3);
  assert.equal(out.rows, 3);
  assert.equal(out.points, 0);
  assert.equal(wrote.ack?.state, 'done');

  /* THE PAGE PARAMETER MOVES AND THE PATH DOES NOT. */
  assert.deepEqual(seen.map((c) => c.url.searchParams.get('page')), ['1', '2', '3']);

  /* EACH PAGE IS WRITTEN AS IT LANDS, with the cursor it moves TO and not the one it was got at. */
  assert.deepEqual(wrote.pages.map((p) => p.n), [1, 2, 3]);
  assert.deepEqual(wrote.pages.map((p) => p.rows.length), [2, 1, 0]);
  assert.deepEqual(wrote.pages[0]?.cursor.window?.page, { kind: 'page_number', value: 2 });
  assert.equal(wrote.pages[2]?.cursor.window?.page, null);

  /* AND THE BODY IS NOT KEPT FOR A PAGE THAT PASSED — the sha and the byte count are. */
  assert.equal(wrote.pages[0]?.raw.body, null);
  assert.equal(wrote.pages[0]?.raw.state, 'matched');
  assert.match(wrote.pages[0]?.raw.sha256 ?? '', /^[0-9a-f]{64}$/u);
  assert.ok((out.bytes ?? 0) > 0);

  /* THE NEXT SLOT IS THE FIRST ONE THAT HAS NOT HAPPENED YET, and the due instant is jittered past
     it. The 08:00 slot ran at 09:00, so 09:00 is behind this run and the next one is 10:00. */
  const finish = wrote.ack?.result;
  assert.equal(finish?.slot, '2026-01-20T10:00:00Z');
  assert.ok(Date.parse(finish?.due_at ?? '') >= Date.parse(finish?.slot ?? ''));
});

test('a window with nothing complete in it is ok and asks the provider for nothing', async () => {
  /* Caught up to the start of today in Cairo: there is no whole day left to read. */
  const cursor: Cursor = { watermark: '2026-01-19T22:00:00Z' };
  const { deps, wrote } = depsOf(NO_HTTP);
  const out = await runPull(jobOf(seriesDecl(), { cursor }), deps);

  assert.equal(out.outcome, 'ok');
  assert.equal(out.pages, 0);
  assert.equal(out.window, null);
  assert.deepEqual(wrote.pages, []);
  assert.equal(wrote.ack?.state, 'done');
});

/* ── A series is reduced once, at the end ────────────────────────────────────────────────────── */

test('a series buffers its rows and writes its points only when the window completed', async () => {
  const { deps, wrote } = depsOf(
    provider([
      { body: { items: [row('2026-01-18T10:00:00Z', 100), row('2026-01-18T20:00:00Z', 250)] } },
      { body: { items: [row('2026-01-19T10:00:00Z', 5)] } },
      { body: { items: [] } },
    ]),
  );
  const out = await runPull(jobOf(seriesDecl()), deps);

  assert.equal(out.outcome, 'ok');
  assert.equal(out.points, 2);
  /* NOT ONE ROW WENT TO THE RECORD PER PAGE. A bucket split across a page boundary, written twice,
     is a `flow` whose second write overwrites the first with the smaller number. */
  assert.deepEqual(wrote.pages.map((p) => p.rows.length), [0, 0, 0]);

  const points = wrote.ack?.result?.points ?? [];
  assert.deepEqual(points.map((p) => [p.at, p.value]), [['2026-01-18', 350], ['2026-01-19', 5]]);

  /* AND THE WATERMARK STOPS AT THE START OF TODAY IN CAIRO, never inside a day still filling. */
  assert.equal(out.cursor.watermark, '2026-01-19T22:00:00Z');
  assert.equal(out.cursor.window, undefined);
});

test('a series cut short by max_pages writes no points and starts the window again from page one', async () => {
  const { deps, wrote } = depsOf(
    provider([{ body: { items: [row('2026-01-18T10:00:00Z', 100)] } }]),
  );
  const out = await runPull(jobOf(seriesDecl({ limits: { max_pages: 2 } })), deps);

  assert.equal(out.outcome, 'partial');
  assert.equal(out.pages, 2);
  assert.equal(out.points, 0);
  assert.deepEqual(wrote.ack?.result?.points, []);
  /* PAGE ONE, NOT PAGE THREE. The buffer that would have made the buckets whole went out of scope
     with the run that held it, so resuming would write two pages of a day as though they were it. */
  assert.equal(out.cursor.window?.page, null);
  assert.equal(out.cursor.window?.n, 0);
  assert.equal(out.cursor.watermark, null);
  assert.equal(wrote.ack?.state, 'done');
  assert.ok(Date.parse(wrote.ack?.result?.due_at ?? '') - NOW <= 60_000);
});

test('a register cut short by max_pages resumes where it stopped', async () => {
  const { deps } = depsOf(provider([{ body: { items: [row('2026-01-18T10:00:00Z', 1)] } }]));
  const out = await runPull(jobOf(registerDecl({ limits: { max_pages: 2 } })), deps);

  assert.equal(out.outcome, 'partial');
  assert.deepEqual(out.cursor.window?.page, { kind: 'page_number', value: 3 });
  assert.equal(out.cursor.window?.n, 2);
  assert.equal(out.cursor.window?.rows, 2);
});

test('a half-finished window is resumed exactly and never recomputed', async () => {
  const seen: Call[] = [];
  const cursor: Cursor = {
    watermark: null,
    window: { since: '2026-01-18T00:00:00Z', until: '2026-01-19T00:00:00Z', page: { kind: 'page_number', value: 7 }, n: 6, rows: 11 },
  };
  const { deps } = depsOf(provider([{ body: { items: [] } }], seen));
  const out = await runPull(jobOf(registerDecl(), { cursor }), deps);

  assert.equal(seen[0]?.url.searchParams.get('page'), '7');
  assert.equal(out.pages, 7);
  assert.deepEqual(out.window, { since: '2026-01-18T00:00:00Z', until: '2026-01-19T00:00:00Z' });
});

/* ── The paginators, end to end ──────────────────────────────────────────────────────────────── */

/* THE PAGINATOR'S OWN PARAMETER IS WHAT MAKES A SECOND PAGE A SECOND PAGE. Without it every kind
   asks for page one until `max_pages` — which a register deduplicates into silence and a `flow`
   series adds up forty times. So each kind is asserted by the URLs it actually produced. */

test('a cursor paginator carries the value it read off the last body', async () => {
  const seen: Call[] = [];
  const decl = registerDecl({
    page: { kind: 'cursor_param', param: 'starting_after', from: 'items[-1].id', more: { path: 'has_more', is: true } },
  });
  const { deps } = depsOf(
    provider(
      [
        { body: { has_more: true, items: [{ id: 'ch_1', ...row('2026-01-19T10:00:00Z', 1) }] } },
        { body: { has_more: false, items: [{ id: 'ch_2', ...row('2026-01-19T11:00:00Z', 2) }] } },
      ],
      seen,
    ),
  );
  const out = await runPull(jobOf(decl), deps);

  assert.equal(out.outcome, 'ok');
  assert.deepEqual(seen.map((c) => c.url.searchParams.get('starting_after')), [null, 'ch_1']);
  assert.equal(out.pages, 2);
});

test('a link-header paginator goes where the provider pointed, and only inside the base', async () => {
  const seen: Call[] = [];
  const decl = registerDecl({ page: { kind: 'link_header', stop_when: { param: 'results', is: 'false' } } });
  const { deps } = depsOf(
    provider(
      [
        { body: { items: [row('2026-01-19T10:00:00Z', 1)] }, headers: { link: `<${BASE}/v1/orders?c=abc>; rel="next"; results="true"` } },
        { body: { items: [row('2026-01-19T11:00:00Z', 2)] }, headers: { link: `<${BASE}/v1/orders?c=xyz>; rel="next"; results="false"` } },
      ],
      seen,
    ),
  );
  const out = await runPull(jobOf(decl), deps);

  assert.equal(out.outcome, 'ok');
  assert.deepEqual(seen.map((c) => c.url.href), [`${BASE}/v1/orders`, `${BASE}/v1/orders?c=abc`]);
  /* THE VALUE AND NOT THE PRESENCE: the second page carries a `next` link and still stops. */
  assert.equal(out.pages, 2);
});

test('a link to somewhere else is refused rather than followed', async () => {
  const decl = registerDecl({ page: { kind: 'link_header', stop_when: { param: 'results', is: 'false' } } });
  const { deps } = depsOf(
    provider([{ body: { items: [] }, headers: { link: '<https://evil.example/v1/orders>; rel="next"' } }]),
  );
  const out = await runPull(jobOf(decl), deps);

  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_ORIGIN_REFUSED');
  assert.equal(out.error?.at, 'fetch.page');
});

test('an offset paginator stops on a short page', async () => {
  const seen: Call[] = [];
  const decl = registerDecl({ page: { kind: 'offset', param: 'offset', size: 2 } });
  const { deps } = depsOf(
    provider(
      [
        { body: { items: [row('2026-01-19T10:00:00Z', 1), row('2026-01-19T11:00:00Z', 2)] } },
        { body: { items: [row('2026-01-19T12:00:00Z', 3)] } },
      ],
      seen,
    ),
  );
  const out = await runPull(jobOf(decl), deps);

  assert.deepEqual(seen.map((c) => c.url.searchParams.get('offset')), ['0', '2']);
  assert.equal(out.rows, 3);
  assert.equal(out.outcome, 'ok');
});

/* ── The four ways a provider ends a run ─────────────────────────────────────────────────────── */

test('401 pauses the connector, leaves the cursor alone and acks done', async () => {
  const { deps, wrote } = depsOf(provider([{ status: 401, body: { message: 'bad credentials' } }]));
  const out = await runPull(jobOf(registerDecl()), deps);

  assert.equal(out.outcome, 'paused');
  assert.equal(out.error?.code, 'PULL_AUTH_REJECTED');
  assert.equal(out.cursor.watermark, null);
  assert.equal(out.cursor.window, undefined);
  /* DONE AND NOT FAILED. The record pauses the row; the ladder must not retry a dead credential. */
  assert.equal(wrote.ack?.state, 'done');
  assert.equal(wrote.ack?.result?.due_at, null);
});

test('500 fails, keeps the pages that landed and hands the ladder the row', async () => {
  const { deps, wrote } = depsOf(
    provider([{ body: { items: [row('2026-01-19T10:00:00Z', 1)] } }, { status: 503, body: {} }]),
  );
  const out = await runPull(jobOf(registerDecl()), deps);

  assert.equal(out.outcome, 'failed');
  assert.equal(out.error?.code, 'PULL_PROVIDER_UNAVAILABLE');
  assert.equal(out.pages, 1);
  assert.deepEqual(out.cursor.window?.page, { kind: 'page_number', value: 2 });
  assert.equal(wrote.ack?.state, 'failed');
  assert.equal(wrote.ack?.error, 'PULL_PROVIDER_UNAVAILABLE');
});

test('429 carries Retry-After through to the ladder, capped and absolute', async () => {
  const { deps } = depsOf(provider([{ status: 429, body: {}, headers: { 'retry-after': '120' } }]));
  const out = await runPull(jobOf(registerDecl()), deps);

  assert.equal(out.outcome, 'failed');
  assert.equal(out.error?.notBefore, NOW + 120_000);
});

test('a redirect is refused rather than followed, and goes to review', async () => {
  const { deps, wrote } = depsOf(provider([{ status: 302, body: {}, headers: { location: 'https://evil.example/' } }]));
  const out = await runPull(jobOf(registerDecl()), deps);

  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_ORIGIN_REFUSED');
  assert.equal(wrote.ack?.state, 'done');
});

test('a transport fault the port named is the provider, and one it did not is this build', async () => {
  const { deps } = depsOf(provider([{ throws: 'Timeout' }]));
  assert.equal((await runPull(jobOf(registerDecl()), deps)).error?.code, 'PULL_PROVIDER_UNAVAILABLE');

  const { deps: other } = depsOf(provider([{ throws: 'TypeError' }]));
  await assert.rejects(() => runPull(jobOf(registerDecl()), other), /TypeError/u);
});

/* ── The declaration being wrong ─────────────────────────────────────────────────────────────── */

test('a body that is not the declared shape goes to review with the path on it', async () => {
  const { deps, wrote } = depsOf(provider([{ body: { data: [] } }]));
  const out = await runPull(jobOf(registerDecl()), deps);

  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_SHAPE_MISMATCH');
  assert.equal(out.error?.at, 'fetch.read.rows');
  assert.deepEqual(wrote.pages, []);
  assert.equal(wrote.ack?.state, 'done');
});

test('a body that is not JSON at all is the same refusal', async () => {
  const { deps } = depsOf(provider([{ body: '<html>maintenance</html>' }]));
  const out = await runPull(jobOf(registerDecl()), deps);
  assert.equal(out.error?.code, 'PULL_SHAPE_MISMATCH');
  assert.equal(out.outcome, 'review');
});

/* ── `expect:` ───────────────────────────────────────────────────────────────────────────────── */

test('a review-grade expect keeps the body for a person and moves no cursor', async () => {
  const decl = registerDecl({ expect: [{ path: 'object', is: 'list' }] });
  const { deps, wrote } = depsOf(provider([{ body: { object: 'error', items: [] } }]));
  const out = await runPull(jobOf(decl), deps);

  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_EXPECT_FAILED');
  assert.equal(out.error?.at, 'object');
  assert.equal(out.cursor.window, undefined);

  /* THE PAGE IS KEPT WHOLE, because somebody is going to have to look at it. */
  assert.equal(wrote.pages.length, 1);
  assert.equal(wrote.pages[0]?.raw.state, 'review');
  assert.equal(wrote.pages[0]?.raw.reason, 'object');
  assert.ok((wrote.pages[0]?.raw.body ?? '').includes('error'));
  assert.deepEqual(wrote.pages[0]?.rows, []);
});

test('a fail-grade expect counts against the ladder and keeps no body', async () => {
  const decl = registerDecl({ expect: [{ path: 'object', is: 'list', on_fail: 'fail' }] });
  const { deps, wrote } = depsOf(provider([{ body: { object: 'error', items: [] } }]));
  const out = await runPull(jobOf(decl), deps);

  assert.equal(out.outcome, 'failed');
  assert.equal(wrote.ack?.state, 'failed');
  /* A BODY WE ARE ABOUT TO FETCH AGAIN IN TWO MINUTES IS NOT EVIDENCE. */
  assert.deepEqual(wrote.pages, []);
});

test('a warn-grade expect is collected and the run carries on', async () => {
  const decl = registerDecl({ expect: [{ path: 'sampled', is: false, on_fail: 'warn' }] });
  const { deps, wrote } = depsOf(provider([{ body: { sampled: true, items: [] } }]));
  const out = await runPull(jobOf(decl), deps);

  assert.equal(out.outcome, 'ok');
  assert.equal(out.warnings.length, 1);
  assert.equal(out.warnings[0]?.at, 'sampled');
  assert.equal(wrote.ack?.result?.warnings.length, 1);
});

/* ── The lease ───────────────────────────────────────────────────────────────────────────────── */

test('a run that is already past its lease edge asks for nothing and keeps its window', async () => {
  const past = new Date(NOW + 1_000).toISOString();
  const { deps, wrote } = depsOf(NO_HTTP);
  const out = await runPull(jobOf(registerDecl(), {}, past), deps);

  assert.equal(out.outcome, 'failed');
  assert.equal(out.error?.code, 'PULL_LEASE_EDGE');
  assert.equal(out.pages, 0);
  assert.equal(wrote.ack?.state, 'failed');
  /* THE PAGE IT STOPPED ON IS KEPT, so the ladder's first retry resumes rather than restarts. */
  assert.deepEqual(out.cursor.window?.page, { kind: 'page_number', value: 1 });
});

/* ── The credential ──────────────────────────────────────────────────────────────────────────── */

const sealedGrant = async (
  fields: Record<string, string>,
  version = 3,
): Promise<{ grant: Sealed; dek: WrappedDek; keys: ConnectDeps['keys'] }> => {
  const kek = await kekOf();
  const keys = storeOf({ kek_1: kek });
  const dek = await wrapDek(kek, 'kek_1', RECORD);
  const grant = await seal(utf8.encode(JSON.stringify(fields)), 'grant_1', version, dek, RECORD, keys);
  return { grant, dek, keys };
};

test('the token step runs once for the whole run and not once per page', async () => {
  const seen: Call[] = [];
  const { grant, dek, keys } = await sealedGrant({
    refresh_token: 'rt_old', client_id: 'cid', client_secret: 'shh-do-not-log-me',
  });
  const decl = registerDecl({
    auth: { kind: 'oauth2_refresh', grant: 'acme', token_url: `${BASE}/oauth/token` },
  });
  const { deps, wrote } = depsOf(
    provider(
      [
        { body: { access_token: 'at_1', refresh_token: 'rt_new' } },
        { body: { items: [row('2026-01-19T10:00:00Z', 1)] } },
        { body: { items: [] } },
      ],
      seen,
    ),
    { keys },
  );
  const out = await runPull(jobOf(decl, { grant, dek }), deps);

  assert.equal(out.outcome, 'ok');
  assert.equal(seen.filter((c) => c.url.pathname === '/oauth/token').length, 1);
  assert.deepEqual(
    seen.filter((c) => c.url.pathname === '/v1/orders').map((c) => c.init.headers.authorization),
    ['Bearer at_1', 'Bearer at_1'],
  );

  /* THE ROTATED TOKEN IS RESEALED AT VERSION + 1 AND RIDES THE ACK, because it is now the only one
     that works: a provider that rotates on every refresh has retired `rt_old` already. */
  const rotated = wrote.ack?.result?.rotated_grant;
  assert.equal(rotated?.version, 4);
  assert.equal(rotated?.grant_id, 'grant_1');
  assert.notEqual(rotated?.ciphertext, grant.ciphertext);
});

test('nothing a grant holds appears in the result, in a page, or in the ack', async () => {
  const secret = 'shh-do-not-log-me';
  const { grant, dek, keys } = await sealedGrant({ token: secret });
  const decl = registerDecl({ auth: { kind: 'bearer', grant: 'acme' } });
  const { deps, wrote } = depsOf(
    provider([{ body: { items: [row('2026-01-19T10:00:00Z', 1)] } }, { body: { items: [] } }]),
    { keys },
  );
  const out = await runPull(jobOf(decl, { grant, dek }), deps);

  assert.equal(out.outcome, 'ok');
  for (const [what, json] of [['the result', JSON.stringify(out)], ['the ack', JSON.stringify(wrote)]] as const)
    assert.ok(!json.includes(secret), `${what} carried the grant's secret`);
});

test('a root key that rotated under a sealed grant is failed and marks nothing stale', async () => {
  const { grant, dek } = await sealedGrant({ token: 'tok' });
  const decl = registerDecl({ auth: { kind: 'bearer', grant: 'acme' } });
  /* The store no longer holds `kek_1`: the key was rotated and the grant has not been re-wrapped. */
  const { deps, wrote } = depsOf(NO_HTTP, { keys: storeOf({}) });
  const out = await runPull(jobOf(decl, { grant, dek }), deps);

  assert.equal(out.outcome, 'failed');
  assert.equal(out.error?.code, 'WRONG_KEY');
  assert.equal(wrote.ack?.state, 'failed');
  assert.equal(out.cursor.window, undefined);
  /* AND NOT THE PROVIDER'S FAULT: the credential is untouched, so nothing here pauses it. */
  assert.notEqual(out.outcome, 'paused');
});

test('a job whose declaration needs a credential and carries none is not a crash', async () => {
  const decl = registerDecl({ auth: { kind: 'bearer', grant: 'acme' } });
  const { deps } = depsOf(NO_HTTP);
  const out = await runPull(jobOf(decl), deps);

  assert.equal(out.outcome, 'paused');
  assert.equal(out.error?.at, 'grant');
});

/* ── What the record is told ─────────────────────────────────────────────────────────────────── */

test('a row the extractor could not read is counted and never written', async () => {
  const { deps, wrote } = depsOf(
    provider([{ body: { items: [row('2026-01-19T10:00:00Z', 1), { value: 2 }] } }, { body: { items: [] } }]),
  );
  const out = await runPull(jobOf(registerDecl()), deps);

  assert.equal(out.outcome, 'ok');
  assert.equal(wrote.ack?.result?.needs_review, 1);
});

test('the sealed grant opens to exactly what was sealed, and the run reads it', async () => {
  const { grant, dek, keys } = await sealedGrant({ token: 'tok_7' });
  const seen: Call[] = [];
  const decl = registerDecl({ auth: { kind: 'bearer', grant: 'acme' } });
  const { deps } = depsOf(provider([{ body: { items: [] } }], seen), { keys });
  await runPull(jobOf(decl, { grant, dek }), deps);

  assert.equal(seen[0]?.init.headers.authorization, 'Bearer tok_7');
});

/* ── A page that is not JSON ──────────────────────────────────────────────────────── */

/** `43`'s reader, wired for real: this is the one the host hands down for the four other formats. */
const csvExtract: ExtractFn = (decl, raw): Extraction => {
  const out = readRows(raw.body, 'csv', decl.fetch?.read ?? {});
  if (out === UNPARSEABLE) return { rows: [], confidence: 'needs-review' };
  return {
    rows: out.map((item) => ({ fields: item as Extraction['rows'][number]['fields'], confidence: 'exact', outcome: {} })),
    confidence: 'exact',
  };
};

const ORDERS_CSV = `id,at,value
o_1,2026-01-19T10:00:00Z,1
o_2,2026-01-19T11:00:00Z,2
`;

/** A LAST PAGE WITH ITS HEADER AND NOTHING UNDER IT, which is how a CSV export says *no more*. */
const HEADER_ONLY_CSV = `id,at,value
`;

test('A CSV PAGE REACHES THE RECORD, and until now it was refused before anybody read a byte of it', async () => {
  /* `42 §4.7` has given `fetch.read` a `format` since it was written, and every path here parsed
     the body as JSON at step 6.5. So a connector declared `csv` — the format banks and payroll
     providers export — failed on its first page with a shape fault naming the read. */
  const seen: Call[] = [];
  const { deps, wrote } = depsOf(
    provider(
      [{ body: ORDERS_CSV }, { body: HEADER_ONLY_CSV }],
      seen,
    ),
    { extract: csvExtract },
  );
  const out = await runPull(jobOf(registerDecl({ read: { format: 'csv' } })), deps);

  assert.equal(out.outcome, 'ok');
  assert.equal(seen.length, 2, 'a csv page did not paginate');
  assert.deepEqual(
    wrote.pages.flatMap((page) => page.rows.map((r) => r.fields)),
    [
      { id: 'o_1', at: '2026-01-19T10:00:00Z', value: '1' },
      { id: 'o_2', at: '2026-01-19T11:00:00Z', value: '2' },
    ],
  );
  /* THE SECOND PAGE IS WHAT ENDS THE RUN, and it ends it on the extraction's count rather than on a
     list read out of a document, because a CSV has no document to read one out of. */
  assert.equal(wrote.ack?.result?.outcome, 'ok');
});

test('AND A CSV BODY THE PROVIDER BROKE IS A PAGE WITH NO ROWS, not a run that threw', async () => {
  const { deps, wrote } = depsOf(provider([{ body: '<!doctype html><title>maintenance</title>' }]), {
    extract: csvExtract,
  });
  const out = await runPull(jobOf(registerDecl({ read: { format: 'csv' }, page: { kind: 'none' } })), deps);

  assert.equal(out.outcome, 'ok');
  assert.deepEqual(wrote.pages[0]?.rows, []);
});

test('AND A FORTY-PAGE RUN FINISHES IN UNDER TWO SECONDS, which is the ceiling an invocation is held to', async () => {
  /**
   * `47 §5.5`, verbatim: *"The fixtures test (§9) asserts a forty-page run over the memory `Http`
   * completes in under 2 s of wall time on the CI runner; the 300 s budget is the table in §7."*
   *
   * FORTY PAGES THAT END BECAUSE THE PROVIDER RAN OUT, NOT BECAUSE THE CEILING CAUGHT THEM.
   * `max_pages` defaults to 40, so forty answers against the default stops on the ceiling — outcome
   * `partial`, cursor kept, retry in a minute — and the test would be timing the ceiling rather
   * than the work. `max_pages: 50` is legal (`§4.1`, 1–50) and the fortieth answer is empty, so
   * forty requests are made and the loop ends on the data.
   */
  const page = (n: number, rows: number): { items: Record<string, unknown>[] } => ({
    items: Array.from({ length: rows }, (_, i) => ({ id: `o_${n}_${i}`, at: '2026-01-19T12:00:00Z', value: 100 + i })),
  });
  const answers: Answer[] = Array.from({ length: 40 }, (_, i) => ({ body: page(i + 1, i === 39 ? 0 : 50) }));

  const seen: Call[] = [];
  const { deps, wrote } = depsOf(provider(answers, seen));
  const decl = registerDecl({ limits: { max_pages: 50, rows_per_run: 5_000 } });

  const started = performance.now();
  const out = await runPull(jobOf(decl), deps);
  const ms = performance.now() - started;

  /* THE WORK IS ASSERTED BEFORE THE CLOCK IS READ, and that order is the whole discipline of a
     performance test: its failure mode is silence rather than red. `@braindog/extract`'s HTML
     benchmark came in at 6 ms against a 300 ms target and looked like good news; the format was
     named `html` instead of `html_table`, so the reader fell through to XML and returned one row
     with no fields. All three of these hold before the number below means anything. */
  assert.equal(seen.length, 40, 'forty pages were not fetched');
  assert.equal(out.outcome, 'ok', 'the run did not finish on the data');
  assert.equal(
    wrote.pages.reduce((n, p) => n + p.rows.length, 0),
    39 * 50,
    'the rows of thirty-nine full pages did not reach the record',
  );

  assert.ok(ms < 2_000, `a forty-page run took ${Math.round(ms)} ms, and §5.5 allows 2,000`);
});
