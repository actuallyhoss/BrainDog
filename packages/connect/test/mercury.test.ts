/**
 * The Mercury pull's credential, run end to end over a memory `Http`.
 *
 * WHY THIS FILE IS HERE AND NOT BESIDE THE PACK. `@braindog/seed` proves what the declaration
 * MEANS: which rows a page becomes and how many of them survive a second run. What it cannot prove
 * is what leaves the machine, because the request is built here. The two halves a bank connector
 * has to get right are *nothing goes out when there is no key* and *when there is one it goes out
 * in exactly one header*, and both are assertions about a `Call` this package makes.
 *
 * THE DECLARATION IS THE PACK'S, COPIED RATHER THAN IMPORTED. `@braindog/connect` is rank 14 and
 * `@braindog/seed` is above it (`31 §2`), so importing the pack would point an edge up the order.
 * What is copied is small and the seed test asserts the same four values off `mercuryPack`, so a
 * drift between this fixture and the shipped pack fails there.
 *
 * NO REAL HOST AND NO REAL KEY (`22 §10`). The origin is `.example` and the token is a literal
 * nobody can spend.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Clock, Http, HttpInit } from '@braindog/ports';

import {
  runPull, seal,
  type ConnectDeps, type Extraction, type ExtractFn, type IngestDecl,
  type OutboxRow, type PullFinish, type PullPage, type PullPayload,
} from '../src/index.ts';

import { kekOf, storeOf, wrapDek } from './grants.ts';

const BASE = 'https://api.mercury.example';
const RECORD = 'rec_9fK2';
const NOW = Date.parse('2026-09-20T09:00:00Z');
const SLOT = '2026-09-20T08:00:00Z';

const utf8 = new TextEncoder();

/** The pack's declaration, as `mercuryPack` writes it: one page, one bearer key, rows under `accounts`. */
const MERCURY: IngestDecl = {
  id: 'mercury_quartz',
  fetch: {
    base: BASE,
    path: '/api/v1/accounts',
    method: 'GET',
    auth: { kind: 'bearer', grant: 'Mercury (read only)' },
    schedule: { every: '1h' },
    read: { rows: 'accounts' },
    page: { kind: 'none' },
    expect: [{ path: 'accounts', present: true }],
    limits: { rows_per_run: 200, max_pages: 1, timeout: '10s' },
  },
  writes: { register: 'accounts', confidence: 'exact' },
};

const ANSWER = {
  requestId: 'req_a',
  accounts: [{ id: 'acc_1', name: 'Mercury Checking ••4417', currentBalance: 18_420.5, kind: 'checking' }],
};

type Call = { url: URL; init: HttpInit };

const provider = (seen: Call[]): Http => ({
  fetch: (url, init) => {
    seen.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }));
  },
});

const NO_HTTP: Http = {
  fetch: (url) => {
    throw new assert.AssertionError({ message: `a request was made to ${url.href} and none was wanted` });
  },
};

/** `43`'s extractor, stubbed: one row per account, as it came. What the real one does is the seed test's. */
const extract: ExtractFn = (_decl, raw): Extraction => {
  const body = JSON.parse(raw.body) as { accounts?: Record<string, unknown>[] };
  return {
    rows: (body.accounts ?? []).map((one) => ({ fields: one as Extraction['rows'][number]['fields'], confidence: 'exact' as const, outcome: {} })),
    confidence: 'exact',
  };
};

type Written = { pages: PullPage[]; ack: { state: 'done' | 'failed'; result?: PullFinish } | null };

const recorder = (): { api: ConnectDeps['record']; wrote: Written } => {
  const wrote: Written = { pages: [], ack: null };
  return {
    wrote,
    api: {
      applyPull: (args) => {
        wrote.pages.push(args);
        return Promise.resolve({ wrote: args.rows.length, kept: 0 });
      },
      ackOutbox: (_id, state, result) => {
        wrote.ack = { state, ...(result === undefined ? {} : { result }) };
        return Promise.resolve();
      },
    },
  };
};

const clockAt = (ms: number): Clock => ({ now: () => ms });

const jobOf = (over: Partial<PullPayload> = {}): OutboxRow<'pull.fetch'> => ({
  id: 'ob_1',
  kind: 'pull.fetch',
  leased_until: new Date(NOW + 300_000).toISOString(),
  attempts: 0,
  payload: {
    ingest: MERCURY.id,
    decl: MERCURY,
    declaration_version: 1,
    grant: null,
    dek: null,
    record: { id: RECORD, tz: 'UTC' },
    cursor: { watermark: null },
    slot: SLOT,
    ...over,
  },
});

const depsOf = (http: Http, over: Partial<ConnectDeps> = {}): { deps: ConnectDeps; wrote: Written } => {
  const { api, wrote } = recorder();
  return {
    wrote,
    deps: { http, clock: clockAt(NOW), record: api, keys: storeOf({}), extract, currencies: {}, lookup: () => [], ...over },
  };
};

test('THE VAULT HOLDS NO KEY, SO NOTHING LEAVES: the run pauses, writes nothing, and is not retried', async () => {
  /* WHAT THIS IS DEFENDING. A connector that sent the request anyway would get a 401 from a bank,
     and `25 §9`'s reason for pausing rather than failing is that eight exponential retries against
     a bank's auth endpoint is how an account gets locked. `NO_HTTP` is the assertion: the port
     throws if it is touched at all, so "nothing leaves" is measured and not described. */
  const { deps, wrote } = depsOf(NO_HTTP);
  const out = await runPull(jobOf(), deps);

  assert.equal(out.outcome, 'paused');
  assert.equal(out.error?.code, 'PULL_AUTH_REJECTED');
  assert.equal(out.error?.at, 'grant');
  assert.equal(out.error?.fix, 'Reconnect the credential: the provider rejected it, and the connector is paused until you do.');
  assert.equal(out.pages, 0);
  assert.equal(out.rows, 0);
  assert.equal(wrote.pages.length, 0);

  /* `done` AND NOT `failed`, which is the difference between a row a person reconnects and a row
     that walks the ladder. And `due_at` is null: there is no next attempt until somebody acts. */
  assert.equal(wrote.ack?.state, 'done');
  assert.equal(wrote.ack?.result?.due_at, null);
});

test('WITH THE KEY IN THE VAULT IT GOES OUT IN ONE HEADER, to Mercury and nowhere else', async () => {
  const kek = await kekOf();
  const keys = storeOf({ kek_1: kek });
  const dek = await wrapDek(kek, 'kek_1', RECORD);
  const grant = await seal(utf8.encode(JSON.stringify({ token: 'secret-mercury-token' })), 'g_1', 1, dek, RECORD, keys);

  const seen: Call[] = [];
  const { deps, wrote } = depsOf(provider(seen), { keys });
  const out = await runPull(jobOf({ grant, dek }), deps);

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(out.rows, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url.href, `${BASE}/api/v1/accounts`);

  /* ONE HEADER CARRIES IT AND THE REST OF THE REQUEST DOES NOT. A token in a query string is a
     token in somebody's access log, and `47 §8` refuses a declaration that spells `Authorization`
     precisely so that this is the only line that can. */
  const headers = seen[0]?.init.headers ?? {};
  const named = Object.entries(headers).filter(([, v]) => String(v).includes('secret-mercury-token'));
  /* THE NAME IS LOWER CASE BECAUSE `applyAuth` WRITES IT THAT WAY, which is what a reader should
     see here rather than the spelling they would have guessed. */
  assert.deepEqual(named, [['authorization', 'Bearer secret-mercury-token']]);
  assert.equal(seen[0]?.url.search, '');

  /* AND IT IS IN NOTHING THAT COMES BACK. `47 §4.4` keeps the grant out of the result, the pages
     and the ack; a serialised sweep is what proves it rather than a habit of not putting it there. */
  assert.equal(JSON.stringify({ out, wrote }).includes('secret-mercury-token'), false);
});
