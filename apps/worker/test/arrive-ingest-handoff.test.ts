/**
 * The line in `src/index.ts` that hands an arrival to the record's object carries the ingest its URL named.
 *
 * THE LINE THAT SHIPS WAS HELD BY NOTHING. `arrive-ingest.test.ts` drives `cloudIngest` in `route.ts` with an
 * `arrives` of its own, so the spread in `arrivals()` that copies `ingest` across the Durable Object boundary could be
 * deleted and every test here stayed green: `CloudIngestDeps.arrives` still type-checks without it, and the tests that
 * do load `index.ts` through the bundle never posted an arrival (`loop/research-batch-thirty-one-audit.md` 4). Without
 * that spread the record is told nothing of which ingest the token was checked against, and it offers a verified
 * webhook to every webhook pattern in declaration order, which `packages/kernel/test/arrive-ingest.test.ts` measured
 * as a write under the first ingest bought by a token minted for the second.
 *
 * SO THIS POSTS THROUGH THE WORKER AS IT SHIPS, bundled by `bundled-worker.ts`, with `RECORD` and `DIRECTORY` stubs
 * that keep what reached them. The stub is the far side of the boundary, which is the whole of what is being asked.
 *
 * RED FIRST, MEASURED ON 22 SEPTEMBER without touching the tree: the same two cases run over a scratch bundle whose
 * esbuild `onLoad` deleted the line `...(arrival.ingest === undefined ? {} : { ingest: arrival.ingest }),` from
 * `src/index.ts` before building. The first case failed, `undefined` where `second` was expected, and the mail case
 * still passed, which is the point of it: mail names no ingest with or without the line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled } from './bundled-worker.ts';

const REC = 'rec_01J8ZC0000000000000000000A';
const TOKEN = 'tok_minted_for_second';

/** The Worker with a record that answers `path` and `TOKEN` for every ingest, and keeps what its `arrive` was handed. */
async function worker(): Promise<{ post(url: string, body: string): Promise<Response>; arrived: Record<string, unknown>[]; asked: unknown[] }> {
  const { default: handler } = await bundled();
  const arrived: Record<string, unknown>[] = [];
  const asked: unknown[] = [];
  const stub = {
    ingestVerify: async (ask: unknown) => (asked.push(ask), { kind: 'path', token: TOKEN }),
    arrive: async (arrival: Record<string, unknown>) => (arrived.push({ ...arrival }), { ok: true, value: { raw: 'raw_1' } }),
  };
  const env = {
    PUBLIC_HOST: 'app.example.test',
    RECORD: { idFromName: (n: string) => n, get: () => stub },
    DIRECTORY: { idFromName: (n: string) => n, get: () => ({ knows: async (id: string) => id === REC, recordFor: async () => REC }) },
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
  return { post: (url, body) => handler.fetch(new Request(url, { method: 'POST', body }), env, ctx), arrived, asked };
}

test('THE WORKER HANDS THE RECORD THE INGEST ITS WEBHOOK URL NAMED', async () => {
  const w = await worker();
  const res = await w.post(`https://app.example.test/in/webhook/${REC}/second/${TOKEN}`, 'You paid EGP 120.00');

  assert.equal(res.status, 202, await res.clone().text());
  assert.deepEqual(w.asked, [{ ingest: 'second' }], 'the token was not checked against the ingest the URL named');
  assert.equal(w.arrived.length, 1);
  assert.equal(w.arrived[0]?.verified, true);
  assert.equal(w.arrived[0]?.ingest, 'second', 'the Worker checked the token against `second` and did not tell the record');
});

test('A FORWARDED MESSAGE CROSSES WITH NO INGEST, so the record offers it to each mail ingest in turn', async () => {
  const w = await worker();
  const res = await w.post('https://app.example.test/in/email/some-inbound-token', 'From: bank@example.com\r\n\r\nYou paid EGP 120.00');

  assert.equal(res.status, 202, await res.clone().text());
  assert.equal(w.arrived.length, 1);
  assert.equal('ingest' in (w.arrived[0] ?? {}), false);
});
