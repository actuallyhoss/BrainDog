/**
 * The fork: which of the two runners a leased job belongs to.
 *
 * ONE LEASER, TWO EXECUTORS, AND THAT IS THE WHOLE DESIGN. `actions.ts` can send one request; it
 * cannot page, and it cannot find rows in a provider's answer. `@braindog/connect` does both. The
 * obvious way to add the second runner is to give it its own `lease` call, and it is the wrong way:
 * two claimants on one outbox means two hosts fetching one window from one provider, which is the
 * double charge the lease exists to prevent. So the lease is taken once and `prepareAction` decides
 * which executor the row goes to.
 *
 * WHAT THIS FILE ASSERTS IS THE DECISION, not the fetching. Whether a connector actually pages
 * correctly is `packages/connect`'s, and whether the two halves fit is
 * `apps/selfhost/test/connector.test.ts`. What is here is the part that can silently send a job to
 * the wrong runner: a plain `pull` still taking the single-request path, a connector taking the
 * other one with a credential opened under its own lease, and neither ever taking both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import {
  openRecord,
  type ActionAnswer,
  type ActionRequest,
  type Declaration,
  type Execute,
  type GrantRow,
  type Kernel,
  type Paged,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 19, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

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
    ],
  } as never,
};

/**
 * A connector: it says how to page and where the rows are, so it cannot be one request.
 *
 * IT NAMES THE GRANT BY ID AND NOT BY LABEL, which is `25 §9`'s rule for a `pull` and not for the
 * other two channels. So the declaration is built after the bind, as a real one is.
 */
const CONNECTOR = (grant: string): Declaration => ({
  id: 'ingest.acme-charges',
  kind: 'ingest',
  body: {
    ingest: 'acme-charges',
    channel: 'pull',
    every: '1h',
    grant,
    map: { ref: { path: 'id', type: 'text' }, paid: { path: ['amount', 'currency'], type: 'money', minor: true } },
    fetch: {
      base: 'https://api.acme.test',
      path: '/v1/charges',
      auth: { kind: 'none' },
      schedule: { every: '1h' },
      page: { kind: 'page_number', param: 'page' },
      read: { rows: 'data' },
    },
    writes: { register: 'charges', key: ['ref'] },
  } as never,
});

/** A plain `pull`: one address, one request, no paging. It must keep the path it has always taken. */
const PLAIN = (grant: string): Declaration => ({
  id: 'ingest.acme-total',
  kind: 'ingest',
  body: {
    ingest: 'acme-total',
    channel: 'pull',
    every: '1h',
    grant,
    url: 'https://api.acme.test/v1/total',
    extract: { ref: { after: 'total ' } },
    writes: { register: 'charges' },
  } as never,
});

/** The declarations are built from the minted grant id, so `of` is a function of it. */
async function record(of: (grant: string) => Declaration[]): Promise<{ k: Kernel; sql: NodeSql; key: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(
    k.createRecord({
      id: ID,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'Africa/Cairo',
      locale: 'en',
      owner: { id: 'p_1', name: 'Ada' },
      keys: {
        record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' },
        connector: { wrapped: b(70), nonce: b(60), kek_id: 'kek_2f' },
      },
    }).ok,
  );
  const made = k.bindGrant(
    { label: 'acme key', opens: 'api.acme.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
    'p_1',
  );
  assert.ok(made.ok, fixOf(made));
  const key = (made.value as GrantRow).id;
  const out = await k.install([CHARGES, ...of(key)]);
  assert.ok(out.ok, fixOf(out as Result<unknown>));
  return { k, sql, key };
}

/** The single-request executor. A connector reaching this is the bug this file exists to catch. */
function host(): { execute: Execute; seen: ActionRequest[] } {
  const seen: ActionRequest[] = [];
  return {
    seen,
    execute: async (request) => {
      seen.push(request);
      return { status: 200, body: 'total 4', bytes: 7, ms: 3, requests: 1 } satisfies ActionAnswer;
    },
  };
}

/** The connector runner, as a host would wire it. It acks the job itself, as `runPull` does. */
function connector(k: Kernel): { page: (p: Paged) => Promise<never | ReturnType<typeof metered>>; seen: Paged[] } {
  const seen: Paged[] = [];
  const metered = (p: Paged) => ({
    event: 'ev_test',
    at: new Date(NOW).toISOString(),
    ingest: p.paged.ingest,
    channel: 'pull',
    scope: 'global',
    outcome: 'ok' as const,
    usage: { runs: 1, requests: 2, bytes: 40, ms: 5, failures: 0, held: 0 },
  });
  return {
    seen,
    page: async (p) => {
      seen.push(p);
      /* THE CONNECTOR RUNNER FINISHES ITS OWN ROW, which is why `runActions` must not ack it again. */
      k.ackOutbox({ id: p.job.id, state: 'done', leasedUntil: p.job.leasedUntil });
      return metered(p);
    },
  };
}

/* ── the fork ────────────────────────────────────────────────────────────── */

test('A CONNECTOR GOES TO THE CONNECTOR RUNNER, with its credential opened under its own lease', async () => {
  const { k, key } = await record((g) => [CONNECTOR(g)]);
  const { execute, seen: requests } = host();
  const { page, seen: paged } = connector(k);

  const out = await k.runActions(execute, { page });

  assert.equal(out.fired, 1, 'the schedule row did not fire');
  assert.equal(out.ran, 1);
  assert.equal(out.ok, 1);

  /* IT NEVER REACHED THE SINGLE-REQUEST EXECUTOR. If it had, the provider would have been asked for
     page one and nothing else, and a connector would silently read a fraction of its window. */
  assert.deepEqual(requests, [], 'a paging connector was sent as one request');
  assert.equal(paged.length, 1);

  const handed = paged[0]!.paged;
  assert.equal(handed.ingest, 'acme-charges');
  assert.equal(handed.record.id, ID);
  assert.equal(handed.record.tz, 'Africa/Cairo', "the record's timezone is what a window is measured in");
  assert.equal(handed.declaration_version, 1);
  assert.equal(handed.cursor.watermark, null, 'a first run has nowhere to resume from');

  /* THE CREDENTIAL IS SEALED AND THE CONNECTOR KEY IS WITH IT. The record cannot open either, and
     the host that can is the one this is being handed to. */
  assert.equal(handed.grant?.grant_id, key);
  assert.equal(handed.grant?.version, 1);
  assert.ok(handed.dek?.wrapped, 'no wrapped key came with the credential');
  assert.equal(handed.dek?.kek_id, 'kek_2f');

  /* AND THE WHOLE DECLARATION WENT WITH IT, not a narrowed copy: the runner reads `fetch.page` and
     `map` off this object, and a copy that dropped either would fetch one page and write nothing. */
  assert.equal((handed.decl.fetch as { page?: { kind?: string } })?.page?.kind, 'page_number');
  assert.ok(handed.decl.map, 'the mapper lost the map on the way through');
});

test('a plain pull still goes to the single-request runner, and the connector one never sees it', async () => {
  const { k } = await record((g) => [PLAIN(g)]);
  const { execute, seen: requests } = host();
  const { page, seen: paged } = connector(k);

  const out = await k.runActions(execute, { page });

  assert.equal(out.ran, 1);
  assert.deepEqual(paged, [], 'a one-request pull was sent to the connector runner');
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, 'https://api.acme.test/v1/total');
  /* AND IT STILL CARRIES THE KEY BY REFERENCE ONLY, which is the older path's own invariant. */
  assert.equal(requests[0]?.grant?.label, 'acme key');
});

test('two declarations in one pass each take their own runner', async () => {
  const { k } = await record((g) => [CONNECTOR(g), PLAIN(g)]);
  const { execute, seen: requests } = host();
  const { page, seen: paged } = connector(k);

  const out = await k.runActions(execute, { page });

  assert.equal(out.fired, 2);
  assert.equal(out.ran, 2);
  assert.deepEqual(
    paged.map((p) => p.paged.ingest),
    ['acme-charges'],
  );
  assert.deepEqual(
    requests.map((r) => r.ingest),
    ['acme-total'],
  );
});

/* ── a host that cannot page ─────────────────────────────────────────────── */

test('A HOST WITH NO CONNECTOR RUNNER FINISHES THE ROW rather than holding it for ever', async () => {
  const { k, sql } = await record((g) => [CONNECTOR(g)]);
  const { execute, seen: requests } = host();

  /* No `page` wired, which is an older host, or one built without the connector. */
  const out = await k.runActions(execute);

  assert.equal(out.dropped, 1);
  assert.equal(out.ran, 0);
  assert.deepEqual(requests, [], 'it fell back to sending the connector as one request');

  /* THE ROW IS FINISHED, NOT LEASED. A row left leased on a host that can never run it is a
     connector that stops everywhere, because the next host to look finds it already claimed. */
  assert.equal(sql.one<{ state: string }>("SELECT state FROM outbox WHERE kind = 'pull.fetch'")?.state, 'done');

  /* AND THE NON-RUN IS METERED, so a connector nobody can run is visible rather than just absent. */
  assert.equal(out.usage[0]?.outcome, 'dropped');
  sql.close();
});

/* ── the credential, when it cannot be had ───────────────────────────────── */

/**
 * A REVOKED KEY IS CAUGHT AT THE FIRE, WHICH IS EARLIER THAN THIS FILE FIRST ASSUMED.
 *
 * The first draft of this test expected `prepareAction` to pause the connector. It does not get the
 * chance: `firePull` looks the key up before it queues anything, so the schedule row pauses and no
 * outbox row is ever written. That is the better of the two places for it — a job that cannot run
 * is never queued, rather than queued and then thrown away — and the run-time twin still exists for
 * the narrow race where a key is revoked between the fire and the lease. That branch's refusal is
 * covered in `sealed-grant.test.ts`; what is asserted here is the ordinary case, end to end.
 */
test('a connector whose key was revoked fetches nothing, and is paused before it is even queued', async () => {
  const { k, sql, key } = await record((g) => [CONNECTOR(g)]);
  const { execute, seen: requests } = host();
  const { page, seen: paged } = connector(k);

  assert.ok(k.revokeGrant(key, 'p_1').ok);
  const out = await k.runActions(execute, { page });

  assert.deepEqual(paged, [], 'a connector with no key was still handed a run');
  assert.deepEqual(requests, [], 'a connector with no key still reached the network');
  assert.equal(out.ran, 0);

  assert.equal(
    sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'pull' AND key = 'acme-charges'")?.state,
    'paused',
  );
  /* NOTHING WAS QUEUED, which is the part worth asserting: a queued job for a revoked key would be
     leased, prepared and dropped on every pass until somebody noticed. */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'pull.fetch'")?.n, 0);
  sql.close();
});
