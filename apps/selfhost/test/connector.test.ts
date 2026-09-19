/**
 * A connector run, against a real record. `47 §5.1` end to end.
 *
 * EVERY OTHER TEST OF THIS PATH STUBS THE HALF IT IS NOT TESTING. `packages/connect` runs against a
 * recorder that accepts any page, and `packages/kernel` writes pages a test typed out by hand. Both
 * suites can be green while the seam between them is wrong — a page shaped one way and a writer
 * expecting another, an extractor that returns minor units to a register that wants major ones.
 * This is the one test where a scripted provider's bytes reach an actual register through both.
 *
 * IT IS NOT THE RUNNER. Nothing in this repository yet leases a `pull.fetch` row and calls
 * `runPull`; `actions.ts` still owns that kind and fetches it in one request. This wires the two
 * halves by hand so that when the runner is built, the shape it has to produce is a shape something
 * already proved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPull, type ConnectDeps, type IngestDecl, type OutboxRow, type PullPayload } from '@braindog/connect';
import { openRecord, type Declaration } from '@braindog/kernel';
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

async function record(): Promise<{ k: Record_; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: RECORD, slug: 'acme', name: 'Acme', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const put = await k.install([CHARGES, { id: 'ingest.acme-charges', kind: 'ingest', body: DECL as never }]);
  assert.ok(put.ok, fixOf(put));

  sql.exec(
    `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts)
     VALUES ('ob_1', ?, 'pull.fetch', ?, 'leased', ?, 1)`,
    new Date(NOW).toISOString(),
    JSON.stringify({ ingest: 'acme-charges' }),
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

/** What the record was told at the end, which is where a run's counts live rather than on its result. */
type Acked = { state?: 'done' | 'failed'; needs_review?: number | undefined; points?: number | undefined };

const wire = (k: Record_, http: Http, acked: Acked = {}): ConnectDeps => ({
  http,
  clock: { now: () => NOW },
  keys: { unwrap: () => Promise.reject(new Error('no grant was wanted')) } as never,
  /* THE EXTRACTOR IS THE RECORD'S, which is the whole reason it is a dependency and not something
     `@braindog/connect` imports: the currency exponents and the register's field types are facts
     only the record holds. */
  extract: (decl, raw, ctx) => k.extract(decl as never, raw, ctx) as never,
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

const jobOf = (): OutboxRow<'pull.fetch'> => ({
  id: 'ob_1',
  kind: 'pull.fetch',
  leased_until: new Date(NOW + 300_000).toISOString(),
  attempts: 0,
  payload: {
    ingest: 'acme-charges',
    decl: DECL as unknown as IngestDecl,
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
     register stores piastres — and a conversion quietly applied at any one of the three seams is a
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
