/**
 * The nine APIs of `25 §4`, each run end to end in its own provider's shape. `47 §9`.
 *
 * WHAT IS COPIED AND WHAT IS INVENTED. The bodies are invented, which `§9` asks for: no figure here is
 * anybody's traffic or revenue. What is copied from the providers is the SHAPE — npm's `start` echo,
 * GitHub's opaque `after` cursor in a `Link` that names a different path from the one requested, Stripe's
 * `object: list` envelope with lower-case currencies, Cloudflare's `"errors": null` on success, Plausible's
 * `results[].dimensions`, PostHog's positional rows, GA4's string metric values and `YYYYMMDD` dates,
 * Sentry's `Link` that always carries a `next` and says `results="false"` on it, and Vercel keying the next
 * page off the last row. The shape is the part that catches a wrong answer, so it is the part kept honest.
 *
 * THE REAL EXTRACTOR READS EVERY PAGE. A stub that copied rows through would let a fixture pass with a
 * `map:` no provider could satisfy, so each declaration carries the `map:` a person would install, and
 * `43`'s `extract` reads it. A field the shape cannot reach comes back `missing`, and a test says so.
 *
 * WHERE A FIXTURE DEPARTS FROM `47 §9`'s TABLE, IT SAYS WHY BESIDE IT: Vercel's register (there is no cumulative
 * figure in a list of deployments). Cloudflare's `error_when` departed too until the table took `len_gte: 1`, since
 * `present: true` fires on every success. Everything else is the table's row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extract as extractReal, parseDate, type Declaration, type ExtractCtx } from '@braindog/extract';
import type { Clock, Http, HttpInit, Key } from '@braindog/ports';

import {
  runPull,
  seal,
  unb64url,
  type ConnectDeps,
  type Extraction,
  type ExtractFn,
  type IngestDecl,
  type MetricPoint,
  type OutboxRow,
  type PullFinish,
  type PullPage,
  type PullPayload,
  type Sealed,
  type WrappedDek,
} from '../src/index.ts';

import { kekOf, storeOf, wrapDek } from './grants.ts';

const NOW = Date.parse('2026-01-20T09:00:00Z');
const SLOT = '2026-01-20T08:00:00Z';
const RECORD = 'rec_9fK2';
/** Eleven in the morning in Cairo, so "today" is the 20th and the last whole day is the 19th. */
const CAIRO = 'Africa/Cairo';

const utf8 = new TextEncoder();

/* ── The provider ────────────────────────────────────────────────────────────────────────────── */

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> };
type Call = { url: URL; init: HttpInit };

/**
 * One scripted answer per call, in order, and every call recorded.
 *
 * A SCRIPT AND NOT A HANDLER, because half of what these assert is how many calls were made: one token
 * exchange for the whole run, no request at all for a refused declaration, and no third page after Sentry
 * said there were no results. A handler answering the same body for ever would pass all three.
 */
const provider = (answers: Answer[], seen: Call[]): Http => {
  let i = 0;
  return {
    fetch: (url, init) => {
      seen.push({ url, init });
      const answer = answers[i] ?? answers.at(-1) ?? {};
      i += 1;
      return Promise.resolve(
        new Response(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {}), {
          status: answer.status ?? 200,
          headers: { 'content-type': 'application/json', ...answer.headers },
        }),
      );
    },
  };
};

/* ── The extractor ───────────────────────────────────────────────────────────────────────────── */

/** `43 §4.5`'s `map:`, which connect's `IngestDecl` does not name because connect never reads it. */
type MapDecl = NonNullable<Declaration['map']>;
type Fixture = IngestDecl & { map: MapDecl };

/**
 * `43`'s extractor, wired the way a host wires it: the currency exponents and the day reader added to the
 * context connect hands down.
 *
 * THE CASTS ARE THE PACKAGE BOUNDARY, as in `run.test.ts`: connect declares the declaration and the arrival
 * structurally (`47 §13` D1), so the same fields carry two names the compiler cannot be told are one.
 */
const extract: ExtractFn = (decl, raw, ctx) =>
  extractReal(decl as unknown as Declaration, raw, {
    ...ctx,
    exponent: (code: string) => ctx.currencies[code]?.exponent ?? 2,
    day: (text: string, format: string) => parseDate(text, format) ?? null,
  } as unknown as ExtractCtx) as unknown as Extraction;

/* ── The record ──────────────────────────────────────────────────────────────────────────────── */

type Wrote = { pages: PullPage[]; ack: { state: 'done' | 'failed'; result?: PullFinish } | null };

type Keys = ConnectDeps['keys'];

const depsOf = (http: Http, keys: Keys = storeOf({})): { deps: ConnectDeps; wrote: Wrote } => {
  const wrote: Wrote = { pages: [], ack: null };
  return {
    wrote,
    deps: {
      http,
      clock: { now: () => NOW } satisfies Clock,
      keys,
      extract,
      currencies: { USD: { exponent: 2 }, EGP: { exponent: 2 } },
      lookup: () => [],
      record: {
        applyPull: (page) => {
          wrote.pages.push(page);
          return Promise.resolve({ wrote: page.rows.length, kept: 0 });
        },
        ackOutbox: (_id, state, result) => {
          assert.equal(wrote.ack, null, 'a run acked its row twice');
          wrote.ack = { state, ...(result === undefined ? {} : { result }) };
          return Promise.resolve();
        },
      },
    },
  };
};

/* ── The credential ──────────────────────────────────────────────────────────────────────────── */

type Sealing = { grant: Sealed; dek: WrappedDek; keys: Keys };

/** A grant sealed under a real DEK, so the run opens it the way a host's would. */
const sealedGrant = async (fields: Record<string, string>): Promise<Sealing> => {
  const kek = await kekOf();
  const keys = storeOf({ kek_1: kek });
  const dek = await wrapDek(kek, 'kek_1', RECORD);
  const grant = await seal(utf8.encode(JSON.stringify(fields)), 'grant_1', 1, dek, RECORD, keys);
  return { grant, dek, keys };
};

const jobOf = (decl: Fixture, sealing?: Sealing): OutboxRow<'pull.fetch'> => ({
  id: 'ob_1',
  kind: 'pull.fetch',
  leased_until: new Date(NOW + 300_000).toISOString(),
  attempts: 0,
  payload: {
    ingest: decl.id,
    decl,
    declaration_version: 1,
    grant: sealing?.grant ?? null,
    dek: sealing?.dek ?? null,
    record: { id: RECORD, tz: CAIRO },
    cursor: { watermark: null },
    slot: SLOT,
  } satisfies PullPayload,
});

/** One run, against one script, with one sealed grant or none. */
const run = async (
  decl: Fixture,
  answers: Answer[],
  fields?: Record<string, string>,
): Promise<{ out: Awaited<ReturnType<typeof runPull>>; wrote: Wrote; seen: Call[] }> => {
  const seen: Call[] = [];
  const sealing = fields === undefined ? undefined : await sealedGrant(fields);
  const { deps, wrote } = depsOf(provider(answers, seen), sealing?.keys);
  const out = await runPull(jobOf(decl, sealing), deps);
  return { out, wrote, seen };
};

/** A series' points, as they ride the ack. */
const pointsOf = (wrote: Wrote): MetricPoint[] => wrote.ack?.result?.points ?? [];

const point = (series: string, at: string, value: number): MetricPoint =>
  ({ series, grain: 'day', at, value, unit: 'count', n: null });

/** `YYYY-MM-DD`, `n` days on. */
const dayAfter = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ═══ npm downloads · none, a date range in the path, an `expect:` on the echo, `flow` ═══════════ */

/**
 * `25 §4`'s first finding: npm answers a range it did not ask for, with a 200. Requested
 * `2024-01-01:2026-08-27`, it answered `"start":"2025-02-27"`, eighteen months, no warning. `expect:` exists
 * because of this response.
 */
const NPM: Fixture = {
  id: 'npm-downloads',
  fetch: {
    base: 'https://api.npmjs.org',
    path: '/downloads/range/{since:date}:{until:date}/braindog',
    auth: { kind: 'none' },
    schedule: { every: '24h' },
    /* `range/a:b` INCLUDES `b`, so `{until:date}` is the window's last day and not today. */
    window: { grain: 'day', start: '2026-01-13', end: 'inclusive' },
    page: { kind: 'none' },
    expect: [{ path: 'start', eq: '{since:date}' }, { path: 'end', eq: '{until:date}' }],
    read: { format: 'json', rows: 'downloads' },
  },
  map: {
    at: { path: 'day', type: 'day' },
    value: { path: 'downloads', type: 'int' },
  },
  writes: { series: 'npm-downloads', kind: 'flow', unit: 'count' },
};

const NPM_COUNTS = [12, 30, 7, 0, 41, 18, 9];

/** npm's own key order: the list first, then the range it actually served. */
const npmBody = (start: string, end: string, counts: number[]): unknown => ({
  downloads: counts.map((downloads, i) => ({ downloads, day: dayAfter(start, i) })),
  start,
  end,
  package: 'braindog',
});

test('npm: one request for the window, seven days, seven points, and the watermark at the start of today', async () => {
  const { out, wrote, seen } = await run(NPM, [{ body: npmBody('2026-01-13', '2026-01-19', NPM_COUNTS) }]);

  assert.equal(out.outcome, 'ok', out.error?.fix);
  /* THE WINDOW IS CAIRO'S WEEK, and npm's range includes its end, so the last day asked for is yesterday. Asked
     for `2026-01-20`, which is the exclusive end, npm served today too, unfinished, on every run. */
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url.href, 'https://api.npmjs.org/downloads/range/2026-01-13:2026-01-19/braindog');
  assert.equal(seen[0]?.init.headers.authorization, undefined, 'an unauthenticated API was sent a credential');

  /* A ZERO npm REPORTED IS A ZERO WRITTEN. Absence is the gap; a measured zero is a point. */
  assert.deepEqual(
    pointsOf(wrote),
    NPM_COUNTS.map((n, i) => point('npm-downloads', dayAfter('2026-01-13', i), n)),
  );
  assert.equal(out.points, 7);
  /* A series writes its page raw and its rows as points, never as register rows. */
  assert.deepEqual(wrote.pages[0]?.rows, []);
  assert.equal(wrote.pages[0]?.raw.state, 'matched');
  assert.deepEqual(out.cursor, { watermark: '2026-01-19T22:00:00Z' });
});

test('npm: a clamped range is a review with the body kept, no points, and a cursor that has not moved', async () => {
  const CLAMPED: Fixture = { ...NPM, fetch: { ...NPM.fetch, window: { grain: 'day', start: '2024-01-01', end: 'inclusive' } } };
  /* ASKED FOR TWO YEARS, ANSWERED EIGHTEEN MONTHS, STATUS 200. */
  const { out, wrote, seen } = await run(CLAMPED, [{ body: npmBody('2024-07-20', '2026-01-19', [3, 5, 4]) }]);

  assert.equal(seen[0]?.url.pathname, '/downloads/range/2024-01-01:2026-01-19/braindog');
  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_EXPECT_FAILED');
  /* WHAT THE SERVER SAID AND WHAT THE WINDOW ASKED, which is the whole of the sentence a person reads. */
  assert.equal(out.error?.at, 'start');
  assert.equal(out.error?.found, '2024-07-20');
  assert.equal(out.error?.wanted, '2024-01-01');

  /* THE CURSOR DOES NOT MOVE — `25 §5.1`'s load-bearing half. A watermark moved past a clamped answer is
     eighteen months nobody will ever ask for again. */
  assert.deepEqual(out.cursor, { watermark: null });
  assert.deepEqual(pointsOf(wrote), []);
  assert.equal(wrote.ack?.state, 'done');

  assert.equal(wrote.pages.length, 1);
  assert.equal(wrote.pages[0]?.raw.state, 'review');
  assert.equal(wrote.pages[0]?.raw.reason, 'start');
  assert.equal((JSON.parse(wrote.pages[0]?.raw.body ?? 'null') as { start: string }).start, '2024-07-20');
  assert.deepEqual(wrote.pages[0]?.rows, []);
});

/* ═══ GitHub traffic · bearer, a `Link` with an opaque cursor, `unique` ═════════════════════════ */

/**
 * GITHUB'S `Link` NAMES A DIFFERENT PATH FROM THE ONE ASKED, `/repositories/<id>/…` for `/repos/<owner>/…`,
 * and carries an opaque base64 `after` cursor. Building `?page=2` breaks it; the only correct move is to take
 * the URL verbatim, and the assertion below is on the whole `href` for that reason.
 *
 * `stop_when` IS REQUIRED BY THE GRAMMAR AND GITHUB NEVER SENDS IT. The plain rule — no `next`, no page — is
 * what ends this one.
 *
 * THE TRAFFIC ENDPOINT ITSELF ANSWERS ITS FOURTEEN DAYS IN ONE PAGE. The `Link` below is the shape GitHub's
 * cursor-paged endpoints send, put on it so the paginator `47 §9` names for this row has something to follow.
 */
const GITHUB: Fixture = {
  id: 'github-traffic',
  fetch: {
    base: 'https://api.github.com',
    path: '/repos/{grant.owner}/{grant.repo}/traffic/views',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    query: { per: 'day' },
    auth: { kind: 'bearer', grant: 'github-read', require_scopes: ['repo'] },
    schedule: { every: '24h' },
    window: { grain: 'day', start: '2026-01-13' },
    source_retention: '14d',
    page: { kind: 'link_header', stop_when: { param: 'results', is: 'false' } },
    read: { format: 'json', rows: 'views' },
  },
  map: {
    at: { path: 'timestamp', type: 'instant' },
    value: { path: 'uniques', type: 'int' },
  },
  writes: { series: 'github-visitors', kind: 'unique', unit: 'count' },
};

const GITHUB_GRANT = { token: 'ghp_fixtureTokenNotReal', owner: 'sami', repo: 'braindog' };
const GITHUB_NEXT =
  'https://api.github.com/repositories/48127465/traffic/views?per=day&after=Y3Vyc29yOnYyOpK5MjAyNi0wMS0xNlQwMDowMDowMFrOAAFS4w%3D%3D';
const GITHUB_FIRST = 'https://api.github.com/repositories/48127465/traffic/views?per=day';

const view = (day: string, count: number, uniques: number): Record<string, unknown> =>
  ({ timestamp: `${day}T00:00:00Z`, count, uniques });

test('GitHub: the next page is the Link taken verbatim, the credential goes with it, and a day seen twice keeps its later count', async () => {
  const { out, wrote, seen } = await run(
    GITHUB,
    [
      {
        headers: { link: `<${GITHUB_NEXT}>; rel="next", <${GITHUB_FIRST}>; rel="first"` },
        body: {
          count: 31,
          uniques: 11,
          views: [view('2026-01-13', 5, 2), view('2026-01-14', 9, 4), view('2026-01-15', 6, 3), view('2026-01-16', 7, 4)],
        },
      },
      {
        headers: { link: `<${GITHUB_FIRST}>; rel="prev", <${GITHUB_FIRST}>; rel="first"` },
        /* AND IF THE DAY THE CURSOR SAT ON COMES BACK AT THE TOP OF THE NEXT PAGE, CORRECTED, the later one
           stands: a visitor count is a reading. A `flow` would have added the two and said nine. */
        body: {
          count: 27,
          uniques: 14,
          views: [view('2026-01-16', 8, 5), view('2026-01-17', 11, 6), view('2026-01-18', 2, 1), view('2026-01-19', 14, 7)],
        },
      },
    ],
    GITHUB_GRANT,
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.url.href, 'https://api.github.com/repos/sami/braindog/traffic/views?per=day');
  assert.equal(seen[1]?.url.href, GITHUB_NEXT, 'the next page was rebuilt rather than taken from the Link');
  for (const call of seen) {
    assert.equal(call.init.headers.authorization, 'Bearer ghp_fixtureTokenNotReal');
    assert.equal(call.init.headers['X-GitHub-Api-Version'], '2022-11-28');
    assert.equal(call.init.headers.Accept, 'application/vnd.github+json');
  }

  /* UNIQUES AND NOT VIEWS: the map named the field, and the count beside it is a different number. */
  assert.deepEqual(pointsOf(wrote), [
    point('github-visitors', '2026-01-13', 2),
    point('github-visitors', '2026-01-14', 4),
    point('github-visitors', '2026-01-15', 3),
    point('github-visitors', '2026-01-16', 5),
    point('github-visitors', '2026-01-17', 6),
    point('github-visitors', '2026-01-18', 1),
    point('github-visitors', '2026-01-19', 7),
  ]);
  assert.equal(out.rows, 8);
});

test('GitHub: a Link that points at another host is refused, not followed, and nothing is written', async () => {
  const foreign = GITHUB_NEXT.replace('https://api.github.com/', 'https://api.github.com.evil.example/');
  const { out, wrote, seen } = await run(
    GITHUB,
    [
      {
        headers: { link: `<${foreign}>; rel="next"` },
        body: { count: 5, uniques: 2, views: [view('2026-01-13', 5, 2)] },
      },
    ],
    GITHUB_GRANT,
  );

  /* SSRF BY RESPONSE (`47 §8`): the one paginator that follows an address it did not build is held to the
     same origin as the one it did. The token never travelled to the foreign host. */
  assert.equal(seen.length, 1);
  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_ORIGIN_REFUSED');
  assert.equal(out.error?.at, 'fetch.page');
  assert.equal(wrote.ack?.state, 'done');
  assert.deepEqual(wrote.pages, [], 'a page was written whose next link was refused');
  assert.deepEqual(pointsOf(wrote), []);
  assert.deepEqual(out.cursor, { watermark: null });
});

/* ═══ Stripe · bearer, `starting_after ← data[-1].id`, `expect: object is list`, a register ════════ */

const STRIPE: Fixture = {
  id: 'stripe-ledger',
  fetch: {
    base: 'https://api.stripe.com',
    path: '/v1/balance_transactions',
    auth: { kind: 'bearer', grant: 'stripe-read', require_scopes: ['balance_transaction_source_read'] },
    headers: { 'Stripe-Version': '2025-09-30.clover' },
    query: {
      limit: 100,
      'created[gte]': '{since:epoch_s}',
      'created[lt]': '{until:epoch_s}',
      'expand[]': ['data.source'],
    },
    schedule: { every: '24h', at: '04:10', tz: 'record', jitter: 'auto' },
    window: { grain: 'day', start: '2026-01-19', lookback: '2d', max_span: '31d' },
    source_retention: '90d',
    page: { kind: 'cursor_param', param: 'starting_after', from: 'data[-1].id', more: { path: 'has_more', is: true } },
    expect: [{ path: 'object', is: 'list' }],
    read: { format: 'json', rows: 'data' },
    limits: { response_bytes: 2_000_000, rows_per_run: 5000, max_pages: 40, timeout: '6s' },
    on_error: { error_when: [{ status_in: [429, 500, 502, 503, 504] }], honour: 'retry_after' },
  },
  map: {
    id: { path: 'id', type: 'text' },
    at: { path: 'created', type: 'instant', from: 'epoch_s' },
    amount: { path: ['amount', 'currency'], type: 'money', minor: true },
    kind: { path: 'type', type: 'enum', values: ['charge', 'payment', 'refund', 'payout'], other: 'other' },
  },
  writes: { register: 'ledger', confidence: 'exact' },
};

/** Cairo's 19 January, as the epoch seconds Stripe's `created` filter takes. */
const STRIPE_SINCE = 1_768_773_600;
const STRIPE_UNTIL = 1_768_860_000;

/** What a balance transaction's `type` is, by position: mostly charges, with the three that are not. */
const kindAt = (i: number): string =>
  i % 25 === 7 ? 'payout' : i % 25 === 13 ? 'refund' : i % 25 === 19 ? 'adjustment' : 'charge';

/**
 * Stripe's balance transaction, newest first, with `source` expanded because the query asked for it.
 *
 * `currency` IS LOWER CASE, as Stripe sends it. The `map:` reads it as the code, so `usd` must come out `USD`.
 * `amount` is already minor units, which is what `minor: true` says.
 */
const balanceTransaction = (i: number): Record<string, unknown> => {
  const kind = kindAt(i);
  const created = STRIPE_UNTIL - 1 - i * 300;
  const gross = 1000 + ((i * 137) % 9000);
  const amount = kind === 'payout' ? -50_000 : kind === 'refund' ? -gross : kind === 'adjustment' ? -1500 : gross;
  const fee = kind === 'charge' ? Math.round(gross * 0.029) + 30 : 0;
  const source =
    kind === 'payout'
      ? { id: `po_1Qx${i.toString(36).padStart(4, '0')}`, object: 'payout', amount: 50_000, currency: 'usd', status: 'paid' }
      : { id: `ch_3Qx${i.toString(36).padStart(4, '0')}`, object: 'charge', amount: gross, currency: 'usd', paid: true };
  return {
    id: `txn_3Qx${i.toString(36).padStart(4, '0')}Lg9fixture`,
    object: 'balance_transaction',
    amount,
    available_on: created + 2 * 86_400,
    created,
    currency: 'usd',
    description: kind === 'charge' ? `Invoice BD-${1000 + i}` : null,
    exchange_rate: null,
    fee,
    fee_details: fee === 0 ? [] : [{ amount: fee, application: null, currency: 'usd', description: 'Stripe processing fees', type: 'stripe_fee' }],
    net: amount - fee,
    reporting_category: kind === 'payout' ? 'payout' : kind === 'refund' ? 'refund' : kind === 'adjustment' ? 'other_adjustment' : 'charge',
    source,
    status: i < 40 ? 'pending' : 'available',
    type: kind,
  };
};

const LEDGER = Array.from({ length: 250 }, (_, i) => balanceTransaction(i));
const LEDGER_IDS = LEDGER.map((row) => row.id as string);

const stripeList = (from: number, to: number, hasMore: boolean): unknown => ({
  object: 'list',
  data: LEDGER.slice(from, to),
  has_more: hasMore,
  url: '/v1/balance_transactions',
});

test('Stripe: three pages, 250 rows, each page written with its id and the cursor it moved to', async () => {
  const { out, wrote, seen } = await run(
    STRIPE,
    [{ body: stripeList(0, 100, true) }, { body: stripeList(100, 200, true) }, { body: stripeList(200, 250, false) }],
    { token: 'rk_test_fixtureNotReal' },
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(out.pages, 3);
  assert.equal(out.rows, 250);
  assert.equal(seen.length, 3, 'has_more false did not end the run');

  /* THE FIRST REQUEST, WHOLE. The window as epoch seconds, `expand[]` repeated as Stripe spells it, and no
     cursor yet, because there is no row to take one from. */
  assert.equal(
    seen[0]?.url.href,
    `https://api.stripe.com/v1/balance_transactions?limit=100&created%5Bgte%5D=${STRIPE_SINCE}&created%5Blt%5D=${STRIPE_UNTIL}&expand%5B%5D=data.source`,
  );
  /* AND THE NEXT TWO ASK BY THE LAST ROW OF THE PAGE BEFORE. */
  assert.equal(seen[1]?.url.searchParams.get('starting_after'), LEDGER_IDS[99]);
  assert.equal(seen[2]?.url.searchParams.get('starting_after'), LEDGER_IDS[199]);
  assert.equal(seen[2]?.url.searchParams.getAll('starting_after').length, 1, 'the cursor was repeated rather than replaced');
  for (const call of seen) {
    assert.equal(call.init.headers.authorization, 'Bearer rk_test_fixtureNotReal');
    assert.equal(call.init.headers['Stripe-Version'], '2025-09-30.clover');
  }

  /* `applyPull` THREE TIMES, EVERY ROW CARRYING THE `dedupe: [id]` FIELD, and every id once. */
  assert.deepEqual(wrote.pages.map((p) => p.rows.length), [100, 100, 50]);
  const ids = wrote.pages.flatMap((p) => p.rows.map((r) => r.fields.id));
  assert.deepEqual(ids, LEDGER_IDS);

  /* THE CURSOR A PAGE IS WRITTEN WITH IS THE ONE IT MOVED TO, so a run cut short after page two resumes at
     page three rather than fetching page two again. */
  assert.deepEqual(wrote.pages.map((p) => p.cursor.window?.page ?? null), [
    { kind: 'cursor_param', value: LEDGER_IDS[99] },
    { kind: 'cursor_param', value: LEDGER_IDS[199] },
    null,
  ]);
  assert.deepEqual(wrote.pages.map((p) => [p.cursor.window?.n, p.cursor.window?.rows]), [[1, 100], [2, 200], [3, 250]]);
  assert.deepEqual(out.cursor, { watermark: '2026-01-19T22:00:00Z' });

  /* WHAT THE MAP MADE OF STRIPE'S ROW: lower-case `usd` as the code, epoch seconds as an instant, and a type
     outside the list kept as `other` — at `proposed`, because somebody chose that for the row. */
  const rows = wrote.pages.flatMap((p) => p.rows);
  assert.deepEqual(rows[0]?.fields, {
    id: LEDGER_IDS[0],
    at: new Date((STRIPE_UNTIL - 1) * 1000).toISOString(),
    amount: { amount: 1000, currency: 'USD' },
    kind: 'charge',
  });
  assert.equal(rows[0]?.confidence, 'exact');
  assert.deepEqual(rows[7]?.fields.amount, { amount: -50_000, currency: 'USD' });
  assert.equal(rows[7]?.fields.kind, 'payout');
  assert.equal(rows[19]?.fields.kind, 'other');
  assert.equal(rows[19]?.confidence, 'proposed');
  assert.equal(wrote.ack?.result?.needs_review, 0);
});

/* ═══ Cloudflare GraphQL · bearer, a POST body, a probe, and a 200 that is not a success ════════════ */

/**
 * The settings node, read by the probe, which is how Cloudflare now says how far back a token may ask (`25 §4`:
 * the retention page went away and the limits page points here). A probe is one GET, so the query rides in
 * the query string.
 */
const CF_SETTINGS = '{ viewer { zones(limit: 1) { settings { httpRequests1hGroups { notOlderThan } } } } }';

/** THE QUERY TEXT IS NOT A TEMPLATE. Every brace in it is GraphQL's, and none may be touched. */
const CF_QUERY =
  'query Requests($zoneTag: string, $since: Time, $until: Time, $oldest: Time) { viewer { zones(filter: { zoneTag: $zoneTag }) { ' +
  'httpRequests1hGroups(limit: 720, orderBy: [datetime_ASC], filter: { AND: [{ datetime_geq: $since }, { datetime_lt: $until }, { datetime_geq: $oldest }] }) ' +
  '{ dimensions { datetime } sum { requests cachedRequests } } } } }';

const CF_ZONE = '023e105f4ecef8ad9ca31a8372d0c353';

/**
 * `error_when` READS `errors` BY LENGTH, AND `present: true` (WHAT `47 §9` ONCE SPELLED) IS NOT USED, ON PURPOSE.
 *
 * Cloudflare's GraphQL answers a success as `{"data": {...}, "errors": null}`. `present` asks whether the
 * path reached anything, and a JSON `null` is something — so `present: true` fires on every successful
 * answer, and the connector reads as a provider that is always down. `len_gte: 1` is true of a list with an
 * error in it and false of `null`, which is the question actually being asked. The test after the success
 * case pins the trap, so the old spelling is not copied back in.
 */
const CLOUDFLARE: Fixture = {
  id: 'cloudflare-graphql',
  fetch: {
    base: 'https://api.cloudflare.com',
    path: '/client/v4/graphql',
    method: 'POST',
    auth: { kind: 'bearer', grant: 'cloudflare-analytics' },
    schedule: { every: '24h' },
    window: { grain: 'day', start: '2026-01-19' },
    probe: {
      path: `/client/v4/graphql?query=${encodeURIComponent(CF_SETTINGS)}`,
      read: { oldest: 'data.viewer.zones[0].settings.httpRequests1hGroups.notOlderThan' },
    },
    body: {
      query: CF_QUERY,
      variables: { zoneTag: '{grant.zone}', since: '{since:instant}', until: '{until:instant}', oldest: '{probe.oldest}' },
    },
    page: { kind: 'none' },
    read: { format: 'json', rows: 'data.viewer.zones[0].httpRequests1hGroups' },
    on_error: { error_when: [{ path: 'errors', len_gte: 1 }, { status_in: [429, 500, 502, 503, 504] }] },
  },
  map: {
    at: { path: 'dimensions.datetime', type: 'instant' },
    value: { path: 'sum.requests', type: 'int' },
  },
  writes: { series: 'cloudflare-requests', kind: 'flow', unit: 'count' },
};

const CF_GRANT = { token: 'cf_fixtureTokenNotReal', zone: CF_ZONE };
const CF_OLDEST = '2025-10-21T22:00:00Z';

const cfSettings = { data: { viewer: { zones: [{ settings: { httpRequests1hGroups: { notOlderThan: CF_OLDEST } } }] } }, errors: null };

const hour = (datetime: string, requests: number): Record<string, unknown> =>
  ({ dimensions: { datetime }, sum: { requests, cachedRequests: Math.floor(requests / 2) } });

/** Four hours of Cairo's 19th, from its first to its last, and the one envelope a success comes in. */
const cfHours = {
  data: {
    viewer: {
      zones: [
        {
          httpRequests1hGroups: [
            hour('2026-01-18T22:00:00Z', 120),
            hour('2026-01-19T06:00:00Z', 340),
            hour('2026-01-19T12:00:00Z', 515),
            hour('2026-01-19T21:00:00Z', 77),
          ],
        },
      ],
    },
  },
  errors: null,
};

test('Cloudflare: one probe, then the POST with every placeholder in the body and none in the query', async () => {
  const { out, wrote, seen } = await run(CLOUDFLARE, [{ body: cfSettings }, { body: cfHours }], CF_GRANT);

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(seen.length, 2);

  /* THE PROBE IS A GET OF THE SETTINGS NODE, ONCE, WITH THE CREDENTIAL ON IT. */
  assert.equal(seen[0]?.init.method, 'GET');
  assert.equal(seen[0]?.url.pathname, '/client/v4/graphql');
  assert.equal(seen[0]?.url.searchParams.get('query'), CF_SETTINGS);
  assert.equal(seen[0]?.init.headers.authorization, 'Bearer cf_fixtureTokenNotReal');

  /* THE BODY, EXACT: the zone from the grant, the window as instants, the probe's horizon, and the query
     text through untouched. */
  assert.equal(seen[1]?.init.method, 'POST');
  assert.equal(seen[1]?.url.href, 'https://api.cloudflare.com/client/v4/graphql');
  assert.equal(seen[1]?.init.headers.authorization, 'Bearer cf_fixtureTokenNotReal');
  assert.equal(seen[1]?.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seen[1]?.init.body ?? 'null'), {
    query: CF_QUERY,
    variables: {
      zoneTag: CF_ZONE,
      since: '2026-01-18T22:00:00.000Z',
      until: '2026-01-19T22:00:00.000Z',
      oldest: CF_OLDEST,
    },
  });

  /* FOUR HOURS, ONE CAIRO DAY. 22:00 UTC on the 18th is midnight on the 19th there, and 21:00 is 23:00. */
  assert.deepEqual(pointsOf(wrote), [point('cloudflare-requests', '2026-01-19', 120 + 340 + 515 + 77)]);
});

test('Cloudflare: a 200 carrying errors is the provider being unavailable, and no page is written', async () => {
  const { out, wrote } = await run(
    CLOUDFLARE,
    [
      { body: cfSettings },
      {
        status: 200,
        body: {
          data: null,
          errors: [
            {
              message: 'rate limiter budget depleted, try again later',
              path: ['viewer', 'zones', '0', 'httpRequests1hGroups'],
              extensions: { timestamp: '2026-01-20T09:00:00.512Z' },
            },
          ],
        },
      },
    ],
    CF_GRANT,
  );

  /* THE STATUS LINE IS NOT THE ANSWER FOR THIS PROVIDER. Without the body condition this is a 200 with no
     rows: a clean run, a moved watermark and a day of traffic silently missing. */
  assert.equal(out.outcome, 'failed');
  assert.equal(out.error?.code, 'PULL_PROVIDER_UNAVAILABLE');
  assert.equal(wrote.ack?.state, 'failed');
  assert.deepEqual(wrote.pages, [], 'a page was written for an answer that carried no data');
  assert.deepEqual(pointsOf(wrote), []);
  assert.equal(out.cursor.watermark, null);
});

test('Cloudflare: errors present:true, as 47 §9 once spelled it, fires on every success, because null is present', async () => {
  const PRESENT: Fixture = {
    ...CLOUDFLARE,
    fetch: { ...CLOUDFLARE.fetch, on_error: { error_when: [{ path: 'errors', present: true }] } },
  };
  const { out } = await run(PRESENT, [{ body: cfSettings }, { body: cfHours }], CF_GRANT);

  /* THE SAME SUCCESSFUL ANSWER AS THE FIRST CLOUDFLARE CASE, read as a failure. This is why the fixture
     declares `len_gte: 1`, and why the table's spelling is a trap for anybody writing this connector. */
  assert.equal(out.outcome, 'failed');
  assert.equal(out.error?.code, 'PULL_PROVIDER_UNAVAILABLE');
});

/* ═══ Plausible · bearer, a JSON body with the site and the dates, `gauge` ═══════════════════════════ */

/**
 * Plausible's Stats API v2: one POST, the site and the range in the body, the rows as `metrics` beside
 * `dimensions`. An hour is written as a wall time in the SITE's zone with no offset (`2026-01-18 17:00:00`),
 * which is not an instant, so the declaration reads only its date and two hours of one day become two
 * readings of it — the gauge keeps the later.
 */
const PLAUSIBLE: Fixture = {
  id: 'plausible',
  fetch: {
    base: 'https://plausible.io',
    path: '/api/v2/query',
    method: 'POST',
    auth: { kind: 'bearer', grant: 'plausible-stats' },
    schedule: { every: '24h' },
    /* `date_range` INCLUDES ITS SECOND DAY, and Plausible echoes the range it served as instants, which the two
       `starts` checks read (`25 §5.1`). */
    window: { grain: 'day', start: '2026-01-18', end: 'inclusive' },
    expect: [
      { path: 'query.date_range[0]', starts: '{since:date}' },
      { path: 'query.date_range[1]', starts: '{until:date}' },
    ],
    body: {
      site_id: '{grant.site_id}',
      metrics: ['visitors'],
      date_range: ['{since:date}', '{until:date}'],
      dimensions: ['time:hour'],
    },
    page: { kind: 'none' },
    read: { format: 'json', rows: 'results' },
  },
  map: {
    at: { path: 'dimensions[0]', type: 'day' },
    value: { path: 'metrics[0]', type: 'int' },
  },
  writes: { series: 'plausible-visitors', kind: 'gauge', unit: 'count' },
};

const hourly = (wall: string, visitors: number): Record<string, unknown> => ({ metrics: [visitors], dimensions: [wall] });

test('Plausible: the body is exact, and of two readings in one day the later one is the day', async () => {
  const { out, wrote, seen } = await run(
    PLAUSIBLE,
    [
      {
        body: {
          results: [
            hourly('2026-01-18 09:00:00', 4),
            hourly('2026-01-18 17:00:00', 11),
            hourly('2026-01-19 08:00:00', 6),
            hourly('2026-01-19 20:00:00', 9),
          ],
          meta: {},
          query: {
            site_id: 'braindog.app',
            metrics: ['visitors'],
            date_range: ['2026-01-18T00:00:00+02:00', '2026-01-19T23:59:59+02:00'],
            dimensions: ['time:hour'],
            filters: [],
            order_by: [['time:hour', 'asc']],
            include: {},
            pagination: { limit: 10000, offset: 0 },
          },
        },
      },
    ],
    { token: 'plausible_fixtureKeyNotReal', site_id: 'braindog.app' },
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url.href, 'https://plausible.io/api/v2/query');
  assert.equal(seen[0]?.init.headers.authorization, 'Bearer plausible_fixtureKeyNotReal');
  assert.deepEqual(JSON.parse(seen[0]?.init.body ?? 'null'), {
    site_id: 'braindog.app',
    metrics: ['visitors'],
    date_range: ['2026-01-18', '2026-01-19'],
    dimensions: ['time:hour'],
  });

  /* A GAUGE TAKES THE LATER READING AND NEVER ADDS. A sum would say fifteen visitors on the 18th; the last
     reading of the day said eleven. */
  assert.deepEqual(pointsOf(wrote), [
    point('plausible-visitors', '2026-01-18', 11),
    point('plausible-visitors', '2026-01-19', 9),
  ]);
});

/* ═══ PostHog Endpoints · a named header, offset paging, positional rows ════════════════════════════ */

/**
 * PostHog Endpoints, `25 §4`'s declarative answer to HogQL: the SQL lives at PostHog and the connector names
 * it. The answer is PostHog's query response, whose `results` are POSITIONAL — `["2026-01-13", 4]` beside a
 * `columns` list — so the `map:` reads `[0]` and `[1]`, the index-only segment `43 §4.4` allows. The request
 * (a GET, the range as query variables) is the declaration's choice and not a claim about PostHog's routing.
 */
const POSTHOG: Fixture = {
  id: 'posthog-endpoints',
  fetch: {
    base: 'https://eu.posthog.com',
    path: '/api/environments/{grant.project_id}/endpoints/daily_signups/run',
    auth: { kind: 'header', grant: 'posthog-read', name: 'X-Api-Key' },
    query: { limit: 3, date_from: '{since:date}', date_to: '{until:date}' },
    schedule: { every: '24h' },
    window: { grain: 'day', start: '2026-01-13' },
    page: { kind: 'offset', param: 'offset', size: 3 },
    read: { format: 'json', rows: 'results' },
  },
  map: {
    at: { path: '[0]', type: 'day' },
    value: { path: '[1]', type: 'int' },
  },
  writes: { series: 'posthog-signups', kind: 'flow', unit: 'count' },
};

const posthogPage = (offset: number, results: [string, number][], hasMore: boolean): unknown => ({
  columns: ['day', 'signups'],
  types: [['day', 'Date'], ['signups', 'UInt64']],
  results,
  hasMore,
  limit: 3,
  offset,
  is_cached: false,
  timezone: 'UTC',
});

const POSTHOG_GRANT = { token: 'phx_fixtureKeyNotReal', project_id: '48213' };

test('PostHog: the key in the named header, three offsets, and a short page that ends it', async () => {
  const { out, wrote, seen } = await run(
    POSTHOG,
    [
      { body: posthogPage(0, [['2026-01-13', 4], ['2026-01-14', 2], ['2026-01-15', 7]], true) },
      { body: posthogPage(3, [['2026-01-16', 3], ['2026-01-17', 0], ['2026-01-18', 6]], true) },
      { body: posthogPage(6, [['2026-01-19', 5]], false) },
    ],
    POSTHOG_GRANT,
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  /* A SHORT PAGE IS THE LAST PAGE: one row where three were asked for, and no fourth request. */
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map((c) => c.url.searchParams.get('offset')), ['0', '3', '6']);
  assert.equal(
    seen[0]?.url.href,
    'https://eu.posthog.com/api/environments/48213/endpoints/daily_signups/run?limit=3&date_from=2026-01-13&date_to=2026-01-20&offset=0',
  );

  /* THE HEADER, EXACT, AND NO `Authorization` BESIDE IT. */
  for (const call of seen) {
    assert.equal(call.init.headers['X-Api-Key'], 'phx_fixtureKeyNotReal');
    assert.equal(call.init.headers.authorization, undefined);
  }

  /* SEVEN DAYS ACROSS THREE PAGES, REDUCED ONCE AT THE END, so no day is split across a page boundary. */
  assert.deepEqual(
    pointsOf(wrote),
    [4, 2, 7, 3, 0, 6, 5].map((n, i) => point('posthog-signups', dayAfter('2026-01-13', i), n)),
  );
  assert.equal(wrote.ack?.result?.needs_review, 0, 'a positional row was not read');
});

test('PostHog: a header auth named Authorization is refused before any request is made', async () => {
  const SIBLING: Fixture = {
    ...POSTHOG,
    fetch: { ...POSTHOG.fetch, auth: { kind: 'header', grant: 'posthog-read', name: 'Authorization' } },
  };
  const { out, wrote, seen } = await run(SIBLING, [{ body: posthogPage(0, [], false) }], POSTHOG_GRANT);

  /* `header` NAMED `Authorization` IS `bearer` WRITTEN THE LONG WAY ROUND, and a declaration may not choose
     where a credential goes (`47 §8`). Nothing leaves. */
  assert.equal(seen.length, 0);
  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_REQUEST_REFUSED');
  assert.equal(out.error?.at, 'fetch.auth.name');
  assert.equal(wrote.ack?.state, 'done');
  assert.deepEqual(wrote.pages, []);
});

/* ═══ GA4 · a service account's RS256 assertion, exchanged once; a thresholded page reviewed ══════ */

const GA4_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GA4_ISS = 'braindog-reader@acme-analytics.iam.gserviceaccount.com';

const GA4: Fixture = {
  id: 'ga4',
  fetch: {
    base: 'https://analyticsdata.googleapis.com',
    path: '/v1beta/properties/{grant.property}:runReport',
    method: 'POST',
    auth: {
      kind: 'jwt_rs256',
      grant: 'ga4-service-account',
      mode: 'exchange',
      aud: GA4_TOKEN_URL,
      token_url: GA4_TOKEN_URL,
      scope: GA4_SCOPE,
    },
    schedule: { every: '24h' },
    /* `endDate` IS INCLUSIVE, so the last day asked for is yesterday and not today. */
    window: { grain: 'day', start: '2026-01-13', end: 'inclusive' },
    body: {
      dateRanges: [{ startDate: '{since:date}', endDate: '{until:date}' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }],
      keepEmptyRows: true,
    },
    page: { kind: 'none' },
    expect: [{ path: 'metadata.subjectToThresholding', is_not: true }],
    read: { format: 'json', rows: 'rows' },
  },
  map: {
    at: { path: 'dimensionValues[0].value', type: 'day', format: 'YYYYMMDD' },
    value: { path: 'metricValues[0].value', type: 'int' },
  },
  writes: { series: 'ga4-active-users', kind: 'unique', unit: 'count' },
};

/** A service account's key pair: the PKCS#8 PEM Google hands out, and the public half to verify with. */
let keyPair: Promise<{ pem: string; verify: Key }> | undefined;
const serviceAccount = (): Promise<{ pem: string; verify: Key }> =>
  (keyPair ??= (async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    let bin = '';
    for (const b of pkcs8) bin += String.fromCharCode(b);
    const body = (btoa(bin).match(/.{1,64}/gu) ?? []).join('\n');
    return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, verify: pair.publicKey };
  })());

const jwtPart = (jwt: string, i: number): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(unb64url(jwt.split('.')[i] ?? ''))) as Record<string, unknown>;

/** GA4's `runReport` answer: string metric values, `YYYYMMDD` dates, and rows in no promised order. */
const ga4Report = (rows: [string, string][], metadata: Record<string, unknown> = {}): unknown => ({
  dimensionHeaders: [{ name: 'date' }],
  metricHeaders: [{ name: 'activeUsers', type: 'TYPE_INTEGER' }],
  rows: rows.map(([date, users]) => ({ dimensionValues: [{ value: date }], metricValues: [{ value: users }] })),
  rowCount: rows.length,
  metadata: { currencyCode: 'USD', timeZone: 'Africa/Cairo', ...metadata },
  kind: 'analyticsData#runReport',
});

const GA4_ROWS: [string, string][] = [
  ['20260115', '38'], ['20260113', '42'], ['20260119', '51'], ['20260114', '40'],
  ['20260117', '29'], ['20260116', '33'], ['20260118', '27'],
];

const ga4Grant = async (): Promise<Record<string, string>> =>
  ({ private_key: (await serviceAccount()).pem, iss: GA4_ISS, property: '312847561' });

test('GA4: one signed assertion exchanged once, the token presented, and the report read as seven days', async () => {
  const { verify } = await serviceAccount();
  const { out, wrote, seen } = await run(
    GA4,
    [{ body: { access_token: 'ya29.c.fixtureNotReal', expires_in: 3599, token_type: 'Bearer' } }, { body: ga4Report(GA4_ROWS) }],
    await ga4Grant(),
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(seen.length, 2);

  /* ONE POST TO THE TOKEN ENDPOINT, AND THE ASSERTION IN IT IS EXACTLY `{ iss, scope, aud, iat, exp }`. */
  const exchange = seen[0];
  assert.equal(exchange?.url.href, GA4_TOKEN_URL);
  assert.equal(exchange?.init.method, 'POST');
  const form = exchange?.init.body ?? '';
  assert.ok(form.startsWith('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='), form);
  const jwt = form.split('assertion=')[1] ?? '';
  assert.deepEqual(jwtPart(jwt, 0), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(jwtPart(jwt, 1), {
    iss: GA4_ISS,
    scope: GA4_SCOPE,
    aud: GA4_TOKEN_URL,
    iat: NOW / 1000,
    exp: NOW / 1000 + 3600,
  });
  const [head, claims, sig] = jwt.split('.');
  assert.ok(
    await crypto.subtle.verify('RSASSA-PKCS1-v1_5', verify, unb64url(sig ?? ''), utf8.encode(`${head}.${claims}`)),
    'the assertion does not verify under the service account key',
  );

  /* THEN THE REPORT, WITH THE TOKEN THE EXCHANGE ANSWERED AND NOT THE ASSERTION. */
  const report = seen[1];
  assert.equal(report?.url.href, 'https://analyticsdata.googleapis.com/v1beta/properties/312847561:runReport');
  assert.equal(report?.init.headers.authorization, 'Bearer ya29.c.fixtureNotReal');
  assert.deepEqual(JSON.parse(report?.init.body ?? 'null'), {
    dateRanges: [{ startDate: '2026-01-13', endDate: '2026-01-19' }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'activeUsers' }],
    keepEmptyRows: true,
  });

  /* `"42"` IS A NUMBER AND `20260113` IS A DAY, and the rows arrive out of order and land in order. */
  assert.deepEqual(
    pointsOf(wrote),
    [42, 40, 38, 33, 29, 27, 51].map((n, i) => point('ga4-active-users', dayAfter('2026-01-13', i), n)),
  );
});

test('GA4: a thresholded report is held for a person, writes nothing, and moves no cursor', async () => {
  const { out, wrote, seen } = await run(
    GA4,
    [
      { body: { access_token: 'ya29.c.fixtureNotReal', expires_in: 3599, token_type: 'Bearer' } },
      { body: ga4Report(GA4_ROWS, { subjectToThresholding: true }) },
    ],
    await ga4Grant(),
  );

  /* GOOGLE WITHHELD ROWS AND SAID SO ONLY IN `metadata`. The numbers are real-looking and low, which is the
     failure that is never noticed on a chart. */
  assert.equal(seen.length, 2);
  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_EXPECT_FAILED');
  assert.equal(out.error?.at, 'metadata.subjectToThresholding');
  assert.equal(out.error?.found, true);
  assert.deepEqual(pointsOf(wrote), []);
  assert.deepEqual(out.cursor, { watermark: null });
  assert.equal(wrote.pages[0]?.raw.state, 'review');
  assert.equal(wrote.pages[0]?.raw.reason, 'metadata.subjectToThresholding');
});

/* ═══ Sentry · bearer, a `Link` whose `next` is always there, `stop_when: results is false` ════════ */

/**
 * `25 §4`, verbatim from Sentry's docs: *cursors will always be returned for both a previous and a next page,
 * even if there are no results on these pages.* A paginator that stops when `next` disappears pages Sentry
 * for ever. `results="false"` on the `next` reference is the stop, and the value decides, not the presence.
 */
const SENTRY: Fixture = {
  id: 'sentry',
  fetch: {
    base: 'https://sentry.io',
    path: '/api/0/projects/{grant.org}/{grant.project}/issues/',
    auth: { kind: 'bearer', grant: 'sentry-read' },
    query: { statsPeriod: '24h', query: 'is:unresolved' },
    schedule: { every: '1h' },
    page: { kind: 'link_header', stop_when: { param: 'results', is: 'false' } },
    read: { format: 'json' },
  },
  map: {
    id: { path: 'id', type: 'text' },
    title: { path: 'title', type: 'text' },
    events: { path: 'count', type: 'int' },
    last_seen: { path: 'lastSeen', type: 'instant' },
    level: { path: 'level', type: 'enum', values: ['fatal', 'error', 'warning', 'info', 'debug'], other: 'error' },
  },
  writes: { register: 'issues' },
};

const SENTRY_PAGE = 'https://sentry.io/api/0/projects/acme/web/issues/?statsPeriod=24h&query=is%3Aunresolved';

/** Sentry's `Link`: both references always, each with its `results` and its `cursor`. */
const sentryLink = (prev: string, prevResults: boolean, next: string, nextResults: boolean): string =>
  `<${SENTRY_PAGE}&cursor=${prev}>; rel="previous"; results="${prevResults}"; cursor="${prev}", ` +
  `<${SENTRY_PAGE}&cursor=${next}>; rel="next"; results="${nextResults}"; cursor="${next}"`;

/** Sentry's issue, as the list endpoint sends it: `count` as a string, `userCount` as a number. */
const issue = (id: string, title: string, count: string, lastSeen: string, level = 'error'): Record<string, unknown> => ({
  id,
  shortId: `WEB-${Number(id).toString(36).toUpperCase().slice(-3)}`,
  title,
  culprit: 'money/rows.svelte in reading',
  permalink: `https://acme.sentry.io/issues/${id}/`,
  level,
  status: 'unresolved',
  isUnhandled: true,
  count,
  userCount: 3,
  firstSeen: '2026-01-12T10:02:11Z',
  lastSeen,
  project: { id: '4501', name: 'web', slug: 'web' },
});

test('Sentry: a next link marked results="false" ends the run although it is there', async () => {
  const { out, wrote, seen } = await run(
    SENTRY,
    [
      {
        headers: { link: sentryLink('0:0:1', false, '0:100:0', true) },
        body: [
          issue('4507123456', "TypeError: Cannot read properties of undefined (reading 'amount')", '12', '2026-01-20T08:41:07Z'),
          issue('4507123311', 'RangeError: Invalid time value', '3', '2026-01-20T06:12:44Z', 'warning'),
        ],
      },
      {
        headers: { link: sentryLink('0:0:1', true, '0:200:0', false) },
        body: [issue('4507119002', 'SyntaxError: Unexpected token < in JSON at position 0', '1', '2026-01-19T23:58:00Z', 'fatal')],
      },
    ],
    { token: 'sntrys_fixtureTokenNotReal', org: 'acme', project: 'web' },
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  /* TWO REQUESTS AND NOT A THIRD. The second page's `next` is right there in the header, and following it is
     the loop `25 §4` found. */
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.url.href, SENTRY_PAGE);
  assert.equal(seen[1]?.url.href, `${SENTRY_PAGE}&cursor=0:100:0`);
  for (const call of seen) assert.equal(call.init.headers.authorization, 'Bearer sntrys_fixtureTokenNotReal');

  /* A BODY THAT IS ITSELF THE LIST, read with no `rows:`. */
  const rows = wrote.pages.flatMap((p) => p.rows);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0]?.fields, {
    id: '4507123456',
    title: "TypeError: Cannot read properties of undefined (reading 'amount')",
    events: 12,
    last_seen: '2026-01-20T08:41:07.000Z',
    level: 'error',
  });
  assert.equal(rows[2]?.fields.level, 'fatal');
  assert.equal(wrote.ack?.result?.needs_review, 0);
});

/* ═══ Vercel · bearer, a keyset read off the last row ═══════════════════════════════════════════════ */

/**
 * A REGISTER, AND NOT `47 §9`'s `cumulative` SERIES. A deployment list has no running total in it — every
 * row is one deployment — so a cumulative reading would be a number the declaration made up. The paginator
 * is the part this fixture is for: Vercel's `until` is the last row's `createdAt`, and the key comes out of
 * the rows rather than out of a counter or a header.
 */
const VERCEL: Fixture = {
  id: 'vercel',
  fetch: {
    base: 'https://api.vercel.com',
    path: '/v6/deployments',
    auth: { kind: 'bearer', grant: 'vercel-read' },
    query: { projectId: '{grant.project_id}', target: 'production', limit: 2 },
    schedule: { every: '1h' },
    /* `pagination.next` IS NULL ON THE LAST PAGE, and `more:` reads it, so the run stops there rather than asking for
       one more page to find it empty. */
    page: { kind: 'keyset', param: 'until', from: 'createdAt', more: { path: 'pagination.next', is_not: null } },
    read: { format: 'json', rows: 'deployments' },
  },
  map: {
    id: { path: 'uid', type: 'text' },
    at: { path: 'createdAt', type: 'instant', from: 'epoch_ms' },
    state: { path: 'readyState', type: 'enum', values: ['READY', 'ERROR', 'CANCELED', 'BUILDING', 'QUEUED', 'INITIALIZING'], other: 'other' },
    url: { path: 'url', type: 'text' },
  },
  writes: { register: 'deployments' },
};

const VERCEL_GRANT = { token: 'vercel_fixtureTokenNotReal', project_id: 'prj_6Hq2bR8xKfixture' };

const deployment = (uid: string, createdAt: number, readyState = 'READY'): Record<string, unknown> => ({
  uid,
  name: 'braindog-web',
  url: `braindog-web-${uid.slice(4, 11).toLowerCase()}.vercel.app`,
  created: createdAt,
  createdAt,
  buildingAt: createdAt + 1_200,
  ready: createdAt + 48_000,
  state: readyState,
  readyState,
  type: 'LAMBDAS',
  target: 'production',
  source: 'git',
  creator: { uid: 'u_9KfixtureUser', username: 'sami' },
  meta: { githubCommitRef: 'master' },
});

const vercelPage = (deployments: Record<string, unknown>[], last = deployments.length === 0): unknown => ({
  deployments,
  pagination: {
    count: deployments.length,
    next: last ? null : (deployments.at(-1)?.createdAt as number),
    prev: deployments.length === 0 ? null : (deployments[0]?.createdAt as number),
  },
});

test('Vercel: the next page is asked for by the last row it was given, and an empty page ends it', async () => {
  const { out, wrote, seen } = await run(
    VERCEL,
    [
      { body: vercelPage([deployment('dpl_8sKq2Lw', 1_768_898_000_000), deployment('dpl_7rJp1Kv', 1_768_890_000_000, 'ERROR')]) },
      { body: vercelPage([deployment('dpl_6qHn0Ju', 1_768_880_000_000)]) },
      { body: vercelPage([]) },
    ],
    VERCEL_GRANT,
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(out.rows, 3);
  assert.equal(seen.length, 3);

  /* THE KEY COMES OUT OF THE ROWS. Page two is asked for by page one's LAST row, so an off-by-one here re-reads
     a deployment or skips one, and both look like an ordinary run. */
  assert.equal(seen[0]?.url.href, 'https://api.vercel.com/v6/deployments?projectId=prj_6Hq2bR8xKfixture&target=production&limit=2');
  assert.deepEqual(seen.map((c) => c.url.searchParams.get('until')), [null, '1768890000000', '1768880000000']);
  for (const call of seen) assert.equal(call.init.headers.authorization, 'Bearer vercel_fixtureTokenNotReal');

  const rows = wrote.pages.flatMap((p) => p.rows);
  assert.deepEqual(rows.map((r) => r.fields.id), ['dpl_8sKq2Lw', 'dpl_7rJp1Kv', 'dpl_6qHn0Ju']);
  assert.deepEqual(rows[1]?.fields, {
    id: 'dpl_7rJp1Kv',
    at: new Date(1_768_890_000_000).toISOString(),
    state: 'ERROR',
    url: 'braindog-web-7rjp1kv.vercel.app',
  });
  assert.equal(wrote.ack?.state, 'done');
});

test('Vercel: a last page that says next is null ends the run there, with no empty page asked for', async () => {
  const { out, wrote, seen } = await run(
    VERCEL,
    [
      { body: vercelPage([deployment('dpl_8sKq2Lw', 1_768_898_000_000), deployment('dpl_7rJp1Kv', 1_768_890_000_000)]) },
      { body: vercelPage([deployment('dpl_6qHn0Ju', 1_768_880_000_000)], true) },
    ],
    VERCEL_GRANT,
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  /* TWO REQUESTS AND NOT THREE. The third would have been asked for by `1768880000000` and answered with nothing. */
  assert.equal(seen.length, 2);
  assert.deepEqual(wrote.pages.flatMap((p) => p.rows).map((r) => r.fields.id), ['dpl_8sKq2Lw', 'dpl_7rJp1Kv', 'dpl_6qHn0Ju']);
  assert.equal(wrote.ack?.state, 'done');
});

test('Vercel: a provider that ignores until and repeats its last row is stopped rather than followed', async () => {
  const { out, seen } = await run(
    VERCEL,
    [
      { body: vercelPage([deployment('dpl_8sKq2Lw', 1_768_898_000_000)]) },
      /* THE SAME LAST ROW AGAIN. Followed, this is forty requests to the lease edge and forty copies of one
         deployment. */
      { body: vercelPage([deployment('dpl_8sKq2Lw', 1_768_898_000_000)]) },
    ],
    VERCEL_GRANT,
  );

  assert.equal(seen.length, 2);
  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_SHAPE_MISMATCH');
  assert.equal(out.error?.at, 'fetch.page.from');
});

/* ═══ Across all nine ═════════════════════════════════════════════════════════════════════════════ */

test('no fixture result, page or ack carries the secret its grant held', async () => {
  /* ONE GREP OVER EVERYTHING A RUN HANDS BACK, for the four fixtures whose secret is a plain token. The
     run's own test does this for one declaration; these are four real auth placements — a bearer on a
     followed link, a bearer beside a probe, a named header, and a bearer on a keyset. */
  const cases: [Fixture, Answer[], Record<string, string>][] = [
    [GITHUB, [{ body: { count: 0, uniques: 0, views: [] } }], GITHUB_GRANT],
    [CLOUDFLARE, [{ body: cfSettings }, { body: cfHours }], CF_GRANT],
    [POSTHOG, [{ body: posthogPage(0, [['2026-01-13', 1]], false) }], POSTHOG_GRANT],
    [VERCEL, [{ body: vercelPage([]) }], VERCEL_GRANT],
  ];
  for (const [decl, answers, fields] of cases) {
    const { out, wrote } = await run(decl, answers, fields);
    assert.equal(out.outcome, 'ok', `${decl.id}: ${out.error?.fix ?? ''}`);
    for (const [what, json] of [['the result', JSON.stringify(out)], ['the pages and the ack', JSON.stringify(wrote)]] as const)
      assert.ok(!json.includes(fields.token ?? '\u0000'), `${decl.id}: ${what} carried the grant's token`);
  }
});
