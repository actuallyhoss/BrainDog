/**
 * A page of a connector run, written.
 *
 * WHAT IS BEING ASSERTED IS MOSTLY WHAT IS *NOT* WRITTEN. A page is the one arrival that carries
 * hundreds of rows, so every ordinary mistake here is a multiplication: the same page written
 * twice is five hundred duplicate entries, a `needs-review` row written is a number nobody agreed
 * to, and a page accepted from an expired lease is a second host's window counted again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, refused } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel, type PulledPage } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const CHARGES: Declaration = {
  id: 'register.charges',
  kind: 'register',
  body: {
    id: 'charges', name: 'Charges', title: 'ref',
    fields: [{ id: 'ref', type: 'text', required: true }, { id: 'what', type: 'text' }],
  } as never,
};

const CONNECTOR = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.stripe-charges',
  kind: 'ingest',
  body: {
    ingest: 'stripe-charges', channel: 'pull', every: '1h', extract: {},
    writes: { register: 'charges' }, dedupe: ['ref'],
    ...over,
  } as never,
});

async function record(decl = CONNECTOR()): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([CHARGES, decl])).ok);

  /* THE INSTALL ARMS THE `pull` ROW, so this is an upsert and not an insert. */
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
     VALUES ('s_1', ?, 'pull', 'stripe-charges', ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET payload = excluded.payload`,
    new Date(NOW).toISOString(),
    JSON.stringify({ ingest: 'stripe-charges' }),
  );
  sql.exec(
    `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts)
     VALUES ('ob_1', ?, 'pull.fetch', ?, 'leased', ?, 1)`,
    new Date(NOW).toISOString(),
    JSON.stringify({ ingest: 'stripe-charges' }),
    new Date(NOW + 300_000).toISOString(),
  );
  return { k, sql };
}

const page = (over: Partial<PulledPage> = {}): PulledPage => ({
  outbox: 'ob_1',
  n: 1,
  raw: { sha256: 'a'.repeat(64), headers: { 'content-type': 'application/json' }, bytes: 120, body: null, state: 'matched' },
  rows: [
    { fields: { ref: 'ch_1', what: 'one' }, confidence: 'exact', outcome: {} },
    { fields: { ref: 'ch_2', what: 'two' }, confidence: 'exact', outcome: {} },
  ],
  cursor: { watermark: null, window: { since: 'a', until: 'b', page: { kind: 'page_number', value: 2 }, n: 1, rows: 2 } },
  ...over,
});

const entries = (sql: NodeSql): number =>
  sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'charges' AND deleted_at IS NULL")?.n ?? -1;

test('a page writes its rows, its bytes and one receipt, and moves the cursor', async () => {
  const { k, sql } = await record();
  const out = k.applyPage(page());
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(out.value, { wrote: 2, kept: 0 });
  assert.equal(entries(sql), 2);

  /* ONE RAW AND ONE RECEIPT, whatever the row count. */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM inbox_raw WHERE channel = 'pull'")?.n, 1);
  const receipt = sql.one<{ wrote: string; confidence: string }>('SELECT wrote, confidence FROM ingest_receipt')!;
  assert.equal((JSON.parse(receipt.wrote) as string[]).length, 2);
  assert.equal(receipt.confidence, 'exact');

  /* THE CURSOR IS ON THE SCHEDULE ROW PER PAGE, so a run that stops at page nine resumes there. */
  const held = JSON.parse(sql.one<{ payload: string }>("SELECT payload FROM schedule WHERE kind = 'pull'")!.payload) as {
    cursor?: { window?: { page?: { value?: number } } };
  };
  assert.equal(held.cursor?.window?.page?.value, 2);
  sql.close();
});

test('the same page a second time writes nothing at all', async () => {
  const { k, sql } = await record();
  assert.ok(k.applyPage(page()).ok);

  const again = k.applyPage(page());
  assert.ok(again.ok, fixOf(again));
  assert.deepEqual(again.value, { wrote: 0, kept: 2 }, 'a redelivered page wrote its rows a second time');
  assert.equal(entries(sql), 2);
  sql.close();
});

test('a row the extractor could not read is counted and never written', async () => {
  const { k, sql } = await record();
  const out = k.applyPage(
    page({
      rows: [
        { fields: { ref: 'ch_1', what: 'one' }, confidence: 'exact', outcome: {} },
        { fields: { what: 'no reference at all' }, confidence: 'needs-review', outcome: {} },
      ],
    }),
  );
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(out.value, { wrote: 1, kept: 1 });
  assert.equal(entries(sql), 1);
  /* AND THE PAGE SAYS SO. A page with a guess in it is not an exact page, whatever the other rows were. */
  assert.equal(sql.one<{ confidence: string }>('SELECT confidence FROM ingest_receipt')?.confidence, 'needs-review');
  sql.close();
});

test('a correction replaces the row it corrects when the declaration says update', async () => {
  const { k, sql } = await record(CONNECTOR({ on_conflict: 'update' }));
  assert.ok(k.applyPage(page()).ok);

  const out = k.applyPage(
    page({
      raw: { sha256: 'b'.repeat(64), headers: {}, bytes: 90, body: null, state: 'matched' },
      rows: [{ fields: { ref: 'ch_1', what: 'one, corrected' }, confidence: 'exact', outcome: {} }],
    }),
  );
  assert.ok(out.ok, fixOf(out));
  assert.equal(entries(sql), 2, 'the correction landed as a new row instead of replacing the one it corrects');
  assert.equal(
    sql.one<{ what: string }>("SELECT json_extract(fields, '$.what') AS what FROM entry WHERE json_extract(fields, '$.ref') = 'ch_1'")?.what,
    'one, corrected',
  );
  sql.close();
});

test('a page for a run nobody is holding is refused before anything is written', async () => {
  const { k, sql } = await record();
  sql.exec("UPDATE outbox SET state = 'pending' WHERE id = 'ob_1'");

  const out = k.applyPage(page());
  assert.ok(refused(out));
  assert.equal(entries(sql), 0);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM inbox_raw')?.n, 0, 'the bytes were written for a lease that had gone');
  sql.close();
});

test('a completed window upserts its points, and reading the window twice writes one row', async () => {
  const { k, sql } = await record();
  const points = [
    { series: 'revenue', grain: 'day', at: '2026-01-18', value: 350, unit: 'money.EGP', n: null },
    { series: 'revenue', grain: 'day', at: '2026-01-19', value: 5, unit: 'money.EGP', n: null },
  ];
  assert.ok(k.writePoints('stripe-charges', points).ok);
  assert.ok(k.writePoints('stripe-charges', [{ ...points[0]!, value: 400 }]).ok);

  const held = sql.all<{ at: string; value: number; source: string }>('SELECT at, value, source FROM metric_point ORDER BY at');
  assert.deepEqual(held.map((p) => [p.at, p.value]), [['2026-01-18', 400], ['2026-01-19', 5]]);
  assert.equal(held[0]?.source, 'ingest:stripe-charges');
  sql.close();
});

test('a connector that routes sends each row where that row says, and keeps the misses', async () => {
  /* `43` D8 WAS SPECIFIED AND UNIMPLEMENTED, and this test asserted the refusal that said so:
     *nothing implements the routing; `arrive` reads `writes.register` as a string and so does this
     file*. `arrive` routes now, so a page does — `§5.1` step 6 routes a ROW, and a page is five
     hundred of them.

     AND A MISS IS KEPT, NOT GUESSED into whichever target is listed first. On one arrival that is a
     `review` somebody reads; on a page it is the `kept` count, which is the same answer at the
     scale a page comes in at. */
  const { k, sql } = await record(
    CONNECTOR({ writes: { register: { by: ['what'], to: [{ when: ['one'], register: 'charges' }] } }, dedupe: ['ref'] }),
  );
  const out = k.applyPage(page());

  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(out.value, { wrote: 1, kept: 1 });
  assert.equal(entries(sql), 1);

  /* THE BYTES AND THE RECEIPT ARE THE PAGE'S, whatever the rows did. */
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM inbox_raw')?.n, 1);
  assert.equal((JSON.parse(sql.one<{ wrote: string }>('SELECT wrote FROM ingest_receipt')!.wrote) as string[]).length, 1);
  sql.close();
});

/* R5 (review of 30 October): the port refuses U+0000 in any text, so a page whose raw body held one threw at the insert,
   was never kept, its cursor never moved, and the connector fetched and failed the same page on every run. */
test('a page whose body holds U+0000 is kept with U+FFFD in its place, and its rows and cursor go on', async () => {
  const { k, sql } = await record();
  const out = k.applyPage(page({ raw: { sha256: 'b'.repeat(64), headers: {}, bytes: 9, body: 'ref\u0000what', state: 'review', reason: 'held\u0000' } }));
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(out.value, { wrote: 2, kept: 0 });
  const kept = sql.one<{ body: string; reason: string; sha256: string }>("SELECT body, reason, sha256 FROM inbox_raw WHERE channel = 'pull'")!;
  assert.equal(kept.body, 'ref�what');
  assert.equal(kept.reason, 'held�');
  assert.equal(kept.sha256, 'b'.repeat(64), 'the hash is the one taken over the bytes as they came');
  sql.close();
});
