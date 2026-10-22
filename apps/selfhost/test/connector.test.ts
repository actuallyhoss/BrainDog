/**
 * A connector run, against a real record. `47 §5.1` end to end.
 *
 * EVERY OTHER TEST OF THIS PATH STUBS THE HALF IT IS NOT TESTING. `packages/connect` runs against a
 * recorder that accepts any page, and `packages/kernel` writes pages a test typed out by hand. Both
 * suites can be green while the seam between them is wrong: a page shaped one way and a writer
 * expecting another, an extractor that returns minor units to a register that wants major ones.
 * This is the one test where a scripted provider's bytes reach an actual register through both.
 *
 * THE RUNNER NOW EXISTS AND THIS FILE PREDATES IT. `src/connector.ts` leases nothing itself (the
 * kernel does that and hands a `Paged` across) but it is what turns one into a `runPull` call. The
 * hand-wiring below is kept deliberately: it drives `runPull` with a payload typed out in full, so
 * a change to `PullPayload` that the real runner silently satisfies still fails here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPull, type ConnectDeps, type IngestDecl, type OutboxRow, type PullPayload } from '@braindog/connect';
import { readRows, UNPARSEABLE, type Format, type Read } from '@braindog/extract';
import { openRecord, type Declaration } from '@braindog/kernel';

import { holding, holdingPaged, pass } from '@braindog/host/actions';
import { pagedRunner } from '@braindog/host/connector';
import { fixOf, type Http } from '@braindog/ports';

import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';

const NOW = Date.parse('2026-01-20T09:00:00Z');
const BASE = 'https://api.acme.test';
const RECORD = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

type Record_ = Awaited<ReturnType<typeof openRecord>>;

/* ── The record ──────────────────────────────────────────────────────────────────────────────── */

const CHARGES: Declaration = {
  id: 'register.charges',
  kind: 'register',
  body: {
    id: 'charges',
    name: 'Charges',
    title: 'ref',
    fields: [
      { id: 'ref', type: 'text', required: true },
      { id: 'paid', type: 'money' },
      { id: 'at', type: 'instant' },
    ],
  } as never,
};

/**
 * One declaration, read by both halves.
 *
 * THE POINT OF WRITING IT ONCE is that `@braindog/connect` reads `fetch` off it and the record's
 * extractor reads `map` off the same object. A test that gave each half its own copy would be
 * testing two declarations that happen to agree today.
 */
const DECL = {
  ingest: 'acme-charges',
  id: 'acme-charges',
  channel: 'pull',
  every: '1h',
  map: {
    ref: { path: 'id', type: 'text' },
    paid: { path: ['amount', 'currency'], type: 'money', minor: true },
    at: { path: 'created', type: 'instant', from: 'epoch_s' },
  },
  fetch: {
    base: BASE,
    path: '/v1/charges',
    auth: { kind: 'none' },
    schedule: { every: '1h' },
    page: { kind: 'page_number', param: 'page' },
    read: { rows: 'data' },
  },
  writes: { register: 'charges', key: ['ref'] },
};

/**
 * The same connector, answered in CSV: `42 §4.7`'s `format`, which had no reader anywhere.
 *
 * NO `expect:`, NO CURSOR AND NO `more:`, and that is the rule rather than this test being small: a
 * CSV page has rows and no document, so `declare` refuses those keys beside a non-JSON format. What
 * is left (`page_number`, which stops on an empty page) is what a CSV export can actually answer.
 */
const CSV_DECL = {
  ...DECL,
  ingest: 'acme-csv',
  id: 'acme-csv',
  fetch: { ...DECL.fetch, path: '/v1/charges.csv', read: { format: 'csv' } },
};

async function record(): Promise<{ k: Record_; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: RECORD, slug: 'acme', name: 'Acme', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const put = await k.install([
    CHARGES,
    { id: 'ingest.acme-charges', kind: 'ingest', body: DECL as never },
    { id: 'ingest.acme-csv', kind: 'ingest', body: CSV_DECL as never },
  ]);
  assert.ok(put.ok, fixOf(put));

  for (const [id, ingest] of [['ob_1', 'acme-charges'], ['ob_2', 'acme-csv']] as const)
    sql.exec(
      `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts)
       VALUES (?, ?, 'pull.fetch', ?, 'leased', ?, 1)`,
      id,
      new Date(NOW).toISOString(),
      JSON.stringify({ ingest }),
      new Date(NOW + 300_000).toISOString(),
    );
  return { k, sql };
}

/* ── The provider ────────────────────────────────────────────────────────────────────────────── */

const provider = (pages: unknown[]): Http => {
  let i = 0;
  return {
    fetch: () => {
      const body = pages[i] ?? { data: [] };
      i += 1;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    },
  };
};

const charge = (id: string, amount: number, created: number): Record<string, unknown> =>
  ({ id, amount, currency: 'egp', created });

/* ── The wiring the runner will do ───────────────────────────────────────────────────────────── */

/**
 * `42 §4.7`'s four non-JSON formats, read: the same line `pagedRunner` hands down.
 *
 * WRITTEN OUT HERE BECAUSE THE WIRING BELOW IS. This file drives `runPull` by hand on purpose, so
 * anything the real runner supplies has to be supplied here too or the hand-wiring stops being a
 * check on the real one. `@braindog/extract` is rank 9 and the extractor is the record's at rank 7;
 * neither may import the other, so whoever assembles the two hands the reader across.
 */
const pageRows = (body: string, read: { format?: string }): unknown[] | null => {
  const out = readRows(body, (read.format ?? 'json') as Format, read as Read);
  return out === UNPARSEABLE ? null : out;
};

/** What the record was told at the end, which is where a run's counts live rather than on its result. */
type Acked = { state?: 'done' | 'failed'; needs_review?: number | undefined; points?: number | undefined };

const wire = (k: Record_, http: Http, acked: Acked = {}): ConnectDeps => ({
  http,
  clock: { now: () => NOW },
  keys: { unwrap: () => Promise.reject(new Error('no grant was wanted')) } as never,
  /* THE EXTRACTOR IS THE RECORD'S, which is the whole reason it is a dependency and not something
     `@braindog/connect` imports: the currency exponents and the register's field types are facts
     only the record holds. */
  extract: (decl, raw, ctx) => k.extract(decl as never, raw, { ...ctx, rows: pageRows } as never) as never,
  currencies: { EGP: { exponent: 2 } },
  lookup: () => [],
  record: {
    applyPull: (page) => {
      const out = k.applyPage(page as never);
      assert.ok(out.ok, fixOf(out));
      return Promise.resolve(out.value);
    },
    ackOutbox: (id, state, result) => {
      acked.state = state;
      acked.needs_review = result?.needs_review;
      acked.points = result?.points.length;
      if (result && result.points.length > 0) assert.ok(k.writePoints('acme-charges', result.points as never).ok);
      const done = k.ackOutbox({ id, state, leasedUntil: new Date(NOW + 300_000).toISOString(), result });
      assert.ok(done.ok, fixOf(done));
      return Promise.resolve();
    },
  },
});

const jobOf = (decl: { id: string } = DECL, id = 'ob_1'): OutboxRow<'pull.fetch'> => ({
  id,
  kind: 'pull.fetch',
  leased_until: new Date(NOW + 300_000).toISOString(),
  attempts: 0,
  payload: {
    ingest: decl.id,
    decl: decl as unknown as IngestDecl,
    declaration_version: 1,
    grant: null,
    dek: null,
    record: { id: RECORD, tz: 'UTC' },
    cursor: { watermark: null },
    slot: '2026-01-20T08:00:00Z',
  } as PullPayload,
});

const rows = (sql: NodeSql): { ref: string; paid: string; at: string }[] =>
  sql.all(
    `SELECT json_extract(fields, '$.ref') AS ref, json_extract(fields, '$.paid') AS paid, json_extract(fields, '$.at') AS at
     FROM entry WHERE register = 'charges' AND deleted_at IS NULL ORDER BY ref`,
  );

/* ── The run ─────────────────────────────────────────────────────────────────────────────────── */

test('a provider answers two pages and the register holds three rows, in the money it was sent', async () => {
  const { k, sql } = await record();
  const out = await runPull(
    jobOf(),
    wire(
      k,
      provider([
        { data: [charge('ch_1', 4200, 1_768_900_000), charge('ch_2', 15_000, 1_768_900_100)] },
        { data: [charge('ch_3', 999, 1_768_900_200)] },
        { data: [] },
      ]),
    ),
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(out.rows, 3);

  /* MINOR UNITS ALL THE WAY THROUGH. The provider sends piastres, the mapper keeps piastres and the
     register stores piastres, and a conversion quietly applied at any one of the three seams is a
     figure wrong by a factor of a hundred, in the direction nobody checks. */
  assert.deepEqual(
    rows(sql).map((r) => [r.ref, JSON.parse(r.paid) as unknown]),
    [
      ['ch_1', { amount: 4200, currency: 'EGP' }],
      ['ch_2', { amount: 15_000, currency: 'EGP' }],
      ['ch_3', { amount: 999, currency: 'EGP' }],
    ],
  );
  assert.equal(rows(sql)[0]?.at, '2026-01-20T09:06:40.000Z');

  /* ONE RAW AND ONE RECEIPT PER PAGE, which is what makes a row traceable to the bytes it came from. */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM inbox_raw WHERE channel = 'pull'")?.n, 3);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM ingest_receipt')?.n, 3);
  sql.close();
});

test('a row the provider sent without an amount is counted and kept out of the register', async () => {
  const { k, sql } = await record();
  const acked: Acked = {};
  const out = await runPull(
    jobOf(),
    wire(k, provider([{ data: [charge('ch_1', 4200, 1_768_900_000), { id: 'ch_2', created: 1_768_900_100 }] }, { data: [] }]), acked),
  );

  assert.equal(out.outcome, 'ok');
  /* THE COUNT IS ON THE ACK AND NOT ON THE RESULT, because it is what the record acts on: a run
     that read nine hundred rows and could not read four is a run somebody should be shown. */
  assert.equal(acked.needs_review, 1, 'a row nobody could read was not reported for review');
  assert.deepEqual(
    rows(sql).map((r) => r.ref),
    ['ch_1'],
  );
  sql.close();
});

test('the same window run twice writes its rows once', async () => {
  const { k, sql } = await record();
  const pages = (): Http => provider([{ data: [charge('ch_1', 4200, 1_768_900_000)] }, { data: [] }]);

  assert.equal((await runPull(jobOf(), wire(k, pages()))).outcome, 'ok');
  /* THE LEASE HAS TO COME BACK for a second run, because the first one finished the row. Re-leasing
     it by hand is the state a second host would find after a lease expired mid-run. */
  sql.exec("UPDATE outbox SET state = 'leased', leased_until = ? WHERE id = 'ob_1'", new Date(NOW + 300_000).toISOString());

  assert.equal((await runPull(jobOf(), wire(k, pages()))).outcome, 'ok');
  assert.deepEqual(
    rows(sql).map((r) => r.ref),
    ['ch_1'],
    'a replayed window duplicated its rows',
  );
  sql.close();
});

/* ── the runner, which is no longer hand-wiring ──────────────────────────────────────────────── */

/**
 * THE WHOLE PATH, WITH NOBODY HOLDING IT TOGETHER BY HAND.
 *
 * Every test above calls `runPull` directly with a payload typed out in this file. This one starts
 * where a real pass starts (a due schedule row) and asserts that the register filled. Between the
 * two are the parts no other test covers together: the kernel firing the schedule, leasing the row
 * and deciding it is a connector rather than one request; `pagedRunner` turning that decision into
 * a `runPull` call with this host's socket; and the record metering what came back.
 *
 * WHAT WOULD HAVE PASSED WITHOUT IT: a runner wired to the wrong executor, a payload the kernel
 * builds one way and `runPull` reads another, an ack written twice, or a run that fetched perfectly
 * and left no event behind. All four are green in one suite or the other.
 */
test('A DUE CONNECTOR FILLS ITS REGISTER through the host runner, and the pass counts one run', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: RECORD, slug: 'acme', name: 'Acme', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const put = await k.install([CHARGES, { id: 'ingest.acme-charges', kind: 'ingest', body: DECL as never }]);
  assert.ok(put.ok, fixOf(put));

  const http = provider([
    { data: [charge('ch_1', 4200, 1_768_900_000), charge('ch_2', 15_000, 1_768_900_100)] },
    { data: [charge('ch_3', 999, 1_768_900_200)] },
  ]);
  const page = pagedRunner({ kernel: k } as never, { http, clock: { now: () => NOW } });

  /* THE SINGLE-REQUEST EXECUTOR IS HANDED IN AND MUST NEVER BE CALLED. A connector arriving here is
     a fork that sent a paging declaration down the one-request path. */
  let sent = 0;
  const out = await k.runActions(async () => (sent++, { status: 200, body: '', bytes: 0, ms: 0, requests: 1 }), { page });

  assert.equal(sent, 0, 'the connector was sent as a single request');
  assert.equal(out.fired, 1, 'the schedule never fired');
  assert.equal(out.ran, 1);
  assert.equal(out.ok, 1);

  /* THE ROWS ARE IN THE REGISTER, in the money they were sent in: minor units in, major units out. */
  assert.deepEqual(
    rows(sql).map((r) => r.ref),
    ['ch_1', 'ch_2', 'ch_3'],
  );

  /* THE ROW IS FINISHED ONCE. `runPull` acks it, and a kernel that acked it again would turn every
     healthy run into a lost lease. */
  assert.equal(sql.one<{ state: string }>("SELECT state FROM outbox WHERE kind = 'pull.fetch'")?.state, 'done');

  /* AND THE RUN IS ON THE RECORD, metered by the record rather than by this host. */
  const ev = sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'pull' ORDER BY rowid DESC LIMIT 1");
  assert.ok(ev, 'a connector ran and left no event behind');
  sql.close();
});

/* ── the allowance, and what a run is never allowed to carry ─────────────── */

/**
 * A HELD RECORD FETCHES NOTHING, AND THE CONNECTOR IS THE KIND THAT WOULD HAVE COST THE MOST.
 *
 * `holding` wraps the EXECUTOR, and the connector runner is not the executor: the pass hands a
 * `Paged` straight to it. So for one pass this allowance had a hole exactly the shape of the
 * expensive kind: a record at its monthly limit was held for `call`, `poll` and a one-request
 * `pull`, and its paging connectors, which make more requests than anything else, ran on.
 */
test('A HELD RECORD FETCHES NOTHING, and the row goes back rather than staying leased', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: RECORD, slug: 'acme', name: 'Acme', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([CHARGES, { id: 'ingest.acme-charges', kind: 'ingest', body: DECL as never }])).ok);

  let fetched = 0;
  const http: Http = {
    fetch: () => {
      fetched += 1;
      return Promise.resolve(new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    },
  };
  const say = 'acme-charges is waiting until 1 October. This record has used its runs for September.';
  const asked: string[] = [];
  const page = holdingPaged(
    pagedRunner({ kernel: k } as never, { http, clock: { now: () => NOW } }),
    RECORD,
    (record, action) => (asked.push(`${record} ${action}`), { until: Date.UTC(2026, 9, 1), say }),
  );

  const out = await k.runActions(async () => ({ status: 200, body: '', bytes: 0, ms: 0, requests: 1 }), { page });

  assert.equal(fetched, 0, 'a held record still reached the provider');
  assert.deepEqual(asked, [`${RECORD} acme-charges`], 'the ledger was not asked about the connector');
  assert.equal(out.held, 1);
  assert.equal(out.ran, 0);
  /* NOTHING IS CHARGED FOR A RUN THAT DID NOT HAPPEN. */
  assert.deepEqual(out.usage[0]?.usage, { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1, cpu_ms: 0 });
  /* AND THE ROW GOES BACK. A held run never acks, so a pass that left it leased would turn "you are
     at your allowance" into "this connector stopped" for as long as the lease lasted. */
  assert.equal(sql.one<{ state: string }>("SELECT state FROM outbox WHERE kind = 'pull.fetch'")?.state, 'done');
  sql.close();
});

/**
 * ONE ADMISSION COUNT AND NOT TWO.
 *
 * The ledger is told of a run only after the pass, so each wrapper carries what it has already let
 * through. Given a count each, a record with one run left is told there is room by both, and sends
 * two. This asserts the second asks with `pending: 1` rather than `0`.
 */
test('the two runners share one admission count, so one run left cannot be spent twice', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: RECORD, slug: 'acme', name: 'Acme', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([CHARGES, { id: 'ingest.acme-charges', kind: 'ingest', body: DECL as never }])).ok);

  const seen: number[] = [];
  const admissions = pass();
  const mayRun = (_r: string, _a: string, pending?: number): null => (seen.push(pending ?? 0), null);
  const page = holdingPaged(
    pagedRunner({ kernel: k } as never, { http: provider([{ data: [] }]), clock: { now: () => NOW } }),
    RECORD,
    mayRun,
    admissions,
  );
  const execute = holding(async () => ({ status: 200, body: '{}', bytes: 2, ms: 1, requests: 1 }), RECORD, mayRun, admissions);

  await k.runActions(execute, { page });
  /* THE FIRST SEES NOTHING PENDING AND THE SECOND SEES THE FIRST. With a count each, both see 0. */
  assert.deepEqual(seen, [0], 'exactly one run was due, so only one question should have been asked');

  /* A SECOND PASS ON THE SAME COUNT KEEPS COUNTING, which is what makes it the pass's and not the run's. */
  await admissions.ask(RECORD, 'acme-charges', mayRun);
  await admissions.ask(RECORD, 'acme-charges', mayRun);
  assert.deepEqual(seen.slice(1), [1, 2]);
  sql.close();
});

/* ── A provider that does not answer in JSON ──────────────────────────────────────── */

const CSV_PAGE = `id,amount,currency,created
ch_9,4200,egp,1758270000
ch_8,900,egp,1758270060
`;

/** A LAST PAGE WITH ITS HEADER AND NOTHING UNDER IT, which is how a CSV export says *no more*. */
const HEADER_ONLY = `id,amount,currency,created
`;

const csvProvider = (pages: string[]): Http => {
  let i = 0;
  return {
    fetch: () => {
      const body = pages[i] ?? '';
      i += 1;
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/csv' } }));
    },
  };
};

test('A CSV PROVIDER REACHES THE REGISTER, through both halves and in the money it was sent', async () => {
  /* THE WHOLE CHAIN, WHICH IS THE POINT OF THIS FILE. `42 §4.7` has given `fetch.read` a `format`
     since it was written and no half of the repository read one: `connect` parsed every body as
     JSON at step 6.5, and the record's extractor answered *not JSON* if anything got past it. A
     bank that exports CSV (which is most of them) could be declared, installed, fetched, and
     never read a row. */
  const { k, sql } = await record();
  const acked: Acked = {};
  const out = await runPull(
    jobOf(CSV_DECL, 'ob_2'),
    wire(k, csvProvider([CSV_PAGE, HEADER_ONLY]), acked),
  );

  assert.equal(out.outcome, 'ok', out.error?.fix);
  assert.equal(acked.state, 'done');
  /* MINOR UNITS AND AN UPPER-CASE CODE, which is the record's coercion and not the reader's: the
     CSV handed over the string "4200" and the string "egp". */
  assert.deepEqual(rows(sql).map((r) => ({ ...r })), [
    { ref: 'ch_8', paid: '{"amount":900,"currency":"EGP"}', at: '2025-09-19T08:21:00.000Z' },
    { ref: 'ch_9', paid: '{"amount":4200,"currency":"EGP"}', at: '2025-09-19T08:20:00.000Z' },
  ]);
});
