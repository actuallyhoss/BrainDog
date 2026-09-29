/**
 * `finishPull`: a paged connector's run, finished by its ack (`pull.ts`, `outbox.ts`).
 *
 * THE HALF THAT WAS NEVER BUILT. `@braindog/connect` hands back a cursor, a next due instant, a pause and a rotated
 * key on every ack, and the ack marked the job finished and dropped all four, so a windowed connector fetched its first
 * window on every run. What is driven here is the record's side of that ack, through the real pass: the schedule fires,
 * the pass leases, `prepareAction` hands the run its cursor, and a stand-in runner acks the way `runPull` does. Whether
 * connect computes the right cursor is `packages/connect`'s; whether the two halves fit is
 * `apps/selfhost/test/connector.test.ts`.
 *
 * THE CONNECTOR NAMES ITS KEY IN ITS AUTH BLOCK AND NOWHERE ELSE, by id, which is how its grammar says to and how no
 * run could be handed one before `keyNameOf`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type ActionAnswer, type Declaration, type Execute, type GrantRow, type Kernel, type Paged, type PagedRun } from './index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const DAY = 86_400_000;
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);
const iso = (ms: number): string => new Date(ms).toISOString();
const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const CHARGES: Declaration = {
  id: 'register.charges',
  kind: 'register',
  body: { id: 'charges', name: 'Charges', title: 'ref', fields: [{ id: 'ref', type: 'text', required: true }] } as never,
};

/** A windowed connector, a week at a time, whose key is named only in `fetch.auth`. */
const CONNECTOR = (key: string): Declaration => ({
  id: 'ingest.acme-charges',
  kind: 'ingest',
  body: {
    ingest: 'acme-charges',
    channel: 'pull',
    every: '1d',
    map: { ref: { path: 'id', type: 'text' } },
    fetch: {
      base: 'https://api.acme.test',
      path: '/v1/charges',
      auth: { kind: 'bearer', grant: key },
      schedule: { every: '1d' },
      window: { grain: 'day', start: '2026-09-01', max_span: '7d' },
      page: { kind: 'page_number', param: 'page' },
      read: { rows: 'data' },
    },
    writes: { register: 'charges' },
    dedupe: ['ref'],
  } as never,
});

type Clockish = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish; key: string }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(
    k.createRecord({
      id: ID,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', name: 'Ada' },
      keys: {
        record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' },
        connector: { wrapped: b(70), nonce: b(60), kek_id: 'kek_2f' },
      },
    }).ok,
  );
  const made = k.bindGrant(
    { label: 'acme key', opens: 'api.acme.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f', sealed_under: 'connector' },
    'p_1',
  );
  assert.ok(made.ok, fixOf(made));
  const key = (made.value as GrantRow).id;
  const out = await k.install([CHARGES, CONNECTOR(key)]);
  assert.ok(out.ok, fixOf(out as Result<unknown>));
  return { k, sql, clock, key };
}

/** The single-request executor, which a connector must never reach. */
const unsent: { n: number; execute: Execute } = {
  n: 0,
  execute: async () => {
    unsent.n++;
    return { status: 200, body: '', bytes: 0, ms: 0, requests: 1 } satisfies ActionAnswer;
  },
};

/** What `runPull` puts on its ack, with the parts a test varies laid over it. */
const finish = (over: Record<string, unknown>): Record<string, unknown> => ({
  outcome: 'ok',
  points: [],
  cursor: { watermark: null },
  due_at: null,
  slot: iso(NOW),
  warnings: [],
  needs_review: 0,
  ...over,
});

/**
 * A stand-in for the connector runner: it acks each run it is handed with the next finish in the list, as `runPull`
 * acks through the record's own `ackOutbox`, and keeps what it was handed.
 */
function runner(k: Kernel, acks: ((p: Paged) => { state: 'done' | 'failed'; result: Record<string, unknown> })[]): { page: PagedRun; seen: Paged[] } {
  const seen: Paged[] = [];
  return {
    seen,
    page: async (p) => {
      const next = acks[seen.length];
      seen.push(p);
      assert.ok(next, 'the connector ran more often than this test expected');
      const { state, result } = next(p);
      const acked = k.ackOutbox({ id: p.job.id, state, leasedUntil: p.job.leasedUntil, result });
      assert.ok(acked.ok, fixOf(acked));
      return { outcome: 'ok', requests: 1, bytes: 10, ms: 1, failures: 0, status: 200, say: `${p.paged.ingest} read a page.` };
    },
  };
}

const scheduled = (sql: NodeSql) =>
  sql.one<{ state: string; due_at: string; payload: string }>("SELECT state, due_at, payload FROM schedule WHERE kind = 'pull' AND key = 'acme-charges'")!;

/* ── the cursor and the slot ─────────────────────────────────────────────── */

test('A WINDOWED CONNECTOR ADVANCES OVER THREE ALARM RUNS, each handed the cursor the last one finished on', async () => {
  const { k, sql, clock, key } = await record();
  const firstSlot = iso(NOW + DAY);
  const resumeAt = NOW + DAY + 61_000 + 60_000;
  const { page, seen } = runner(k, [
    /* ONE: nothing read yet. The first week, finished, and the next slot a day on. */
    () => ({ state: 'done', result: finish({ cursor: { watermark: '2026-09-08T00:00:00Z' }, slot: firstSlot, due_at: iso(NOW + DAY + 60_000) }) }),
    /* TWO: the second week, stopped at a cap with pages left, and due again in a minute. */
    () => ({
      state: 'done',
      result: finish({
        outcome: 'partial',
        cursor: {
          watermark: '2026-09-08T00:00:00Z',
          window: { since: '2026-09-08T00:00:00Z', until: '2026-09-15T00:00:00Z', page: { kind: 'page_number', value: 3 }, n: 2, rows: 40 },
        },
        slot: firstSlot,
        due_at: iso(resumeAt),
      }),
    }),
    /* THREE: the rest of the second week, and the watermark past it. */
    () => ({ state: 'done', result: finish({ cursor: { watermark: '2026-09-15T00:00:00Z' }, slot: iso(NOW + 2 * DAY), due_at: iso(NOW + 2 * DAY + 60_000) }) }),
  ]);

  assert.equal((await k.runActions(unsent.execute, { page })).ran, 1);
  /* THE FIRST RUN WAS HANDED THE KEY ITS AUTH BLOCK NAMES, opened under its own lease. */
  assert.equal(seen[0]?.paged.grant?.grant_id, key, 'a connector naming its key in fetch.auth was handed none');
  assert.equal(seen[0]?.paged.cursor.watermark, null);
  assert.equal(Date.parse(scheduled(sql).due_at), NOW + DAY + 60_000, "the runner's next due instant was not written");

  clock.set(NOW + DAY + 61_000);
  assert.equal((await k.runActions(unsent.execute, { page })).ran, 1, 'the second run never came round');
  assert.equal(seen[1]?.paged.cursor.watermark, '2026-09-08T00:00:00Z', 'the second run started from the first window again');
  /* THE SLOT IS THE ONE THE LAST FINISH COUNTED TO, not the instant this alarm rang. */
  assert.equal(seen[1]?.paged.slot, firstSlot);
  assert.equal(Date.parse(scheduled(sql).due_at), resumeAt, 'a run stopped at a cap was not due again in a minute');

  clock.set(resumeAt + 1_000);
  assert.equal((await k.runActions(unsent.execute, { page })).ran, 1, 'the half-read window was never resumed');
  /* A HALF-READ WINDOW IS RESUMED AT THE PAGE IT STOPPED ON, not recomputed from the watermark. */
  assert.deepEqual(seen[2]?.paged.cursor.window?.page, { kind: 'page_number', value: 3 });
  assert.equal(seen[2]?.paged.cursor.window?.n, 2);

  const held = JSON.parse(scheduled(sql).payload) as { cursor?: { watermark?: string; window?: unknown }; slot?: string };
  assert.equal(held.cursor?.watermark, '2026-09-15T00:00:00Z');
  assert.equal(held.cursor?.window, undefined, 'a finished window was left half-read');
  assert.equal(held.slot, iso(NOW + 2 * DAY));
  assert.equal(scheduled(sql).state, 'pending');
  assert.equal(unsent.n, 0, 'a connector was sent as a single request');
  sql.close();
});

/* ── a refused key ───────────────────────────────────────────────────────── */

test('A REJECTED KEY PAUSES THE CONNECTOR, marks the key stale and says so, and is never run again on its own', async () => {
  const { k, sql, clock, key } = await record();
  const { page } = runner(k, [
    () => ({
      state: 'done',
      result: finish({ outcome: 'paused', error: { code: 'PULL_AUTH_REJECTED', at: 'fetch.page[1]', fix: 'Reconnect the credential.' } }),
    }),
  ]);

  await k.runActions(unsent.execute, { page });

  assert.equal(scheduled(sql).state, 'paused');
  assert.ok(k.grant(key)?.stale_at, 'the refused key was not marked stale');
  const told = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'ingest:acme-charges'");
  assert.match(told?.note ?? '', /acme-charges is paused: the provider refused the key "acme key"/);

  /* NEVER RETRIED: a day on, the paused row is not claimed and nothing is fetched. */
  clock.set(NOW + 2 * DAY);
  const later = await k.runActions(unsent.execute, { page });
  assert.equal(later.fired, 0, 'a paused connector fired');
  assert.equal(later.ran, 0);
  sql.close();
});

/* ── the ladder ──────────────────────────────────────────────────────────── */

test("A FAILED RUN RETRIES NO SOONER THAN THE PROVIDER'S Retry-After, and keeps the page it got to", async () => {
  const { k, sql } = await record();
  const window = { since: '2026-09-01T00:00:00Z', until: '2026-09-08T00:00:00Z', page: { kind: 'page_number', value: 4 }, n: 3, rows: 12 };
  const { page, seen } = runner(k, [
    () => ({
      state: 'failed',
      result: finish({
        outcome: 'failed',
        cursor: { watermark: null, window },
        error: { code: 'PULL_PROVIDER_UNAVAILABLE', at: 'fetch.page[4]', fix: 'Nothing to do.', notBefore: NOW + 3 * 3_600_000 },
      }),
    }),
  ]);

  await k.runActions(unsent.execute, { page });

  const retry = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'retry' AND key = ?", `outbox:${seen[0]!.job.id}`);
  assert.equal(Date.parse(retry?.due_at ?? ''), NOW + 3 * 3_600_000, 'the retry came round before the provider said it could');
  assert.deepEqual((JSON.parse(scheduled(sql).payload) as { cursor?: unknown }).cursor, { watermark: null, window });
  sql.close();
});

test('and a Retry-After further off than the ladder ever waits is held to its six-hour bound', async () => {
  const { k, sql } = await record();
  const { page, seen } = runner(k, [
    () => ({
      state: 'failed',
      result: finish({ outcome: 'failed', error: { code: 'PULL_PROVIDER_UNAVAILABLE', at: 'fetch.page[1]', fix: 'Nothing to do.', notBefore: NOW + 9 * DAY } }),
    }),
  ]);

  await k.runActions(unsent.execute, { page });

  const retry = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'retry' AND key = ?", `outbox:${seen[0]!.job.id}`);
  assert.equal(Date.parse(retry?.due_at ?? ''), NOW + 6 * 3_600_000);
  sql.close();
});

/* ── a rotated key ───────────────────────────────────────────────────────── */

test('A KEY THE PROVIDER ROTATED IS KEPT AS THE NEXT VERSION, and one for another key is not', async () => {
  const { k, sql, clock, key } = await record();
  const other = k.bindGrant(
    { label: 'other key', opens: 'api.other.test', kind: 'api_token', ciphertext: b(3), nonce: b(4), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f', sealed_under: 'connector' },
    'p_1',
  );
  assert.ok(other.ok, fixOf(other));
  const otherId = (other.value as GrantRow).id;
  const next = new Uint8Array([7, 7, 7, 7]);
  const nonce = new Uint8Array([5, 5, 5]);
  const { page } = runner(k, [
    () => ({
      state: 'done',
      result: finish({ rotated_grant: { ciphertext: base64(next), nonce: base64(nonce), kek_id: 'kek_2f', grant_id: key, version: 2 }, due_at: iso(NOW + DAY) }),
    }),
    () => ({
      state: 'done',
      result: finish({ rotated_grant: { ciphertext: base64(next), nonce: base64(nonce), kek_id: 'kek_2f', grant_id: otherId, version: 2 } }),
    }),
  ]);

  await k.runActions(unsent.execute, { page });

  assert.equal(k.grant(key)?.version, 2, 'the rotated key was dropped with the ack');
  assert.ok(k.grant(key)?.rotated_at);
  const held = sql.one<{ ciphertext: Uint8Array; prev_ciphertext: Uint8Array }>('SELECT ciphertext, prev_ciphertext FROM grant WHERE id = ?', key);
  assert.deepEqual([...(held?.ciphertext ?? [])], [...next]);
  /* THE ONE PRIOR VERSION IS KEPT, as a hand rotation keeps it, for the requests already in flight. */
  assert.deepEqual([...(held?.prev_ciphertext ?? [])], [...b(1)]);
  assert.ok(sql.one("SELECT 1 AS x FROM event WHERE kind = 'grant.rotate' AND actor = 'ingest:acme-charges' AND target = ?", `grant:${key}`));

  /* A RESEALED KEY FOR A GRANT THIS JOB NEVER SENT IS NOT WRITTEN, whatever the runner says. */
  clock.set(NOW + DAY + 1_000);
  await k.runActions(unsent.execute, { page });
  assert.equal(k.grant(otherId)?.version, 1);
  sql.close();
});
