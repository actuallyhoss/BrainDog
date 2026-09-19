/**
 * Two providers whose shapes nothing has run end to end. `47 §9`.
 *
 * NOT THE ELEVEN, AND ON PURPOSE. `run.test.ts` already drives `cursor_param`, `page_number`,
 * `offset`, `link_header`, every failure grade and both write kinds, so nine of `§9`'s fixtures
 * would re-assert what is asserted next door with different nouns. What is genuinely unrun is here:
 * a `keyset` paginator, which is the only one whose next value comes out of the ROWS rather than
 * out of a counter or a header, and `error_when`, which is the only guard that fires on a response
 * the transport calls a success.
 *
 * THE BODIES ARE INVENTED, WHICH `§9` ASKS FOR. What is copied from the real providers is the
 * shape — Cloudflare answering `200` with an `errors` array, Vercel keying the next page off the
 * last row — because the shape is the part that catches a wrong answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Clock, Http, HttpInit } from '@braindog/ports';

import {
  runPull,
  type ConnectDeps,
  type Extraction,
  type ExtractFn,
  type FetchDecl,
  type IngestDecl,
  type OutboxRow,
  type PullFinish,
  type PullPage,
  type PullPayload,
} from '../src/index.ts';

const NOW = Date.parse('2026-01-20T09:00:00Z');
const SLOT = '2026-01-20T08:00:00Z';
const RECORD = 'rec_9fK2';

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> };
type Call = { url: URL; init: HttpInit };

const provider = (answers: Answer[], seen: Call[] = []): Http => {
  let i = 0;
  return {
    fetch: (url, init) => {
      seen.push({ url, init });
      const answer = answers[i] ?? answers.at(-1) ?? {};
      i += 1;
      return Promise.resolve(
        new Response(JSON.stringify(answer.body ?? {}), {
          status: answer.status ?? 200,
          headers: { 'content-type': 'application/json', ...answer.headers },
        }),
      );
    },
  };
};

/** Every element of `rows` is a row, as it came. The extractor is not what these are about. */
const extract: ExtractFn = (_decl, raw): Extraction => {
  const body = JSON.parse(raw.body) as { rows?: Record<string, unknown>[] };
  return {
    rows: (body.rows ?? []).map((row) => ({ fields: row as Extraction['rows'][number]['fields'], confidence: 'exact', outcome: {} })),
    confidence: 'exact',
  };
};

type Wrote = { pages: PullPage[]; ack: { state: 'done' | 'failed'; result?: PullFinish } | null };

const depsOf = (http: Http): { deps: ConnectDeps; wrote: Wrote } => {
  const wrote: Wrote = { pages: [], ack: null };
  return {
    wrote,
    deps: {
      http,
      clock: { now: () => NOW } satisfies Clock,
      keys: {} as never,
      extract,
      currencies: { EGP: { exponent: 2 } },
      lookup: () => [],
      record: {
        applyPull: (page) => {
          wrote.pages.push(page);
          return Promise.resolve({ wrote: page.rows.length, kept: 0 });
        },
        ackOutbox: (_id, state, result) => {
          wrote.ack = { state, ...(result === undefined ? {} : { result }) };
          return Promise.resolve();
        },
      },
    },
  };
};

const jobOf = (fetch: FetchDecl, writes: IngestDecl['writes']): OutboxRow<'pull.fetch'> => ({
  id: 'ob_1',
  kind: 'pull.fetch',
  leased_until: new Date(NOW + 300_000).toISOString(),
  attempts: 0,
  payload: {
    ingest: 'fixture',
    decl: { id: 'fixture', fetch, writes },
    declaration_version: 1,
    grant: null,
    dek: null,
    record: { id: RECORD, tz: 'Africa/Cairo' },
    cursor: { watermark: null },
    slot: SLOT,
  } satisfies PullPayload,
});

/* ── vercel · keyset ─────────────────────────────────────────────────────────────────────────── */

const VERCEL: FetchDecl = {
  base: 'https://api.vercel.test',
  path: '/v6/deployments',
  auth: { kind: 'none' },
  schedule: { every: '1h' },
  page: { kind: 'keyset', param: 'until', from: 'createdAt' },
  read: { rows: 'rows' },
};

const deployment = (id: string, createdAt: number): Record<string, unknown> => ({ uid: id, createdAt });

test('a keyset paginator asks for the next page by the last row it was given', async () => {
  const seen: Call[] = [];
  const { deps, wrote } = depsOf(
    provider(
      [
        { body: { rows: [deployment('dpl_1', 1_768_000_300), deployment('dpl_2', 1_768_000_200)] } },
        { body: { rows: [deployment('dpl_3', 1_768_000_100)] } },
        { body: { rows: [] } },
      ],
      seen,
    ),
  );
  const out = await runPull(jobOf(VERCEL, { register: 'deployments' }), deps);

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(out.rows, 3);

  /* THE KEY COMES OUT OF THE ROWS, which is the whole difference from every other paginator: page
     two is asked for by the LAST row of page one, so an off-by-one here silently re-reads a row or
     skips one, and both look like an ordinary run. */
  assert.equal(seen[0]?.url.searchParams.get('until'), null, 'the first page asked for a key it had not been given yet');
  assert.equal(seen[1]?.url.searchParams.get('until'), '1768000200');
  assert.equal(seen[2]?.url.searchParams.get('until'), '1768000100');

  /* AND AN EMPTY PAGE ENDS IT, rather than a fourth request with the same key as the third. */
  assert.equal(seen.length, 3);
  assert.equal(wrote.ack?.state, 'done');
});

test('a keyset provider that repeats its key is stopped rather than followed for ever', async () => {
  const { deps } = depsOf(
    provider([
      { body: { rows: [deployment('dpl_1', 1_768_000_300)] } },
      /* THE SAME LAST ROW AGAIN. A provider doing this is a loop that ends when `max_pages` does,
         forty requests later, having written the same row forty times. */
      { body: { rows: [deployment('dpl_1', 1_768_000_300)] } },
    ]),
  );
  const out = await runPull(jobOf(VERCEL, { register: 'deployments' }), deps);

  assert.equal(out.outcome, 'review');
  assert.equal(out.error?.code, 'PULL_SHAPE_MISMATCH');
  assert.equal(out.error?.at, 'fetch.page.from');
});

/* ── cloudflare · a 200 that is not a success ────────────────────────────────────────────────── */

const CLOUDFLARE: FetchDecl = {
  base: 'https://api.cloudflare.test',
  path: '/client/v4/graphql',
  method: 'POST',
  auth: { kind: 'none' },
  schedule: { every: '1h' },
  body: { query: 'query { viewer { zones { httpRequests1dGroups } } }' },
  read: { rows: 'rows' },
  on_error: { error_when: [{ path: 'errors', present: true }] },
};

test('a GraphQL answer that says 200 and carries errors is the provider being unavailable', async () => {
  const { deps, wrote } = depsOf(
    provider([
      {
        status: 200,
        body: { data: null, errors: [{ message: 'rate limited', path: ['viewer'] }] },
      },
    ]),
  );
  const out = await runPull(jobOf(CLOUDFLARE, { register: 'requests' }), deps);

  /* THE STATUS LINE IS NOT THE ANSWER FOR THIS PROVIDER. Without `error_when` this is a 200 with
     no rows: a clean run, a moved watermark, and a day of traffic silently missing from the
     record — the one failure shape that leaves nothing behind to notice. */
  assert.equal(out.outcome, 'failed');
  assert.equal(out.error?.code, 'PULL_PROVIDER_UNAVAILABLE');

  /* AND IT WALKS THE LADDER, because rate limited is a condition that passes. */
  assert.equal(wrote.ack?.state, 'failed');
  assert.deepEqual(wrote.pages, [], 'a page was written for an answer that carried no data');
});

test('the same declaration takes an ordinary answer without complaint', async () => {
  const { deps } = depsOf(provider([{ status: 200, body: { data: {}, rows: [{ at: '2026-01-19', requests: 12 }] } }]));
  const out = await runPull(jobOf(CLOUDFLARE, { register: 'requests' }), deps);

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(out.rows, 1);
});
