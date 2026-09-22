/**
 * The Cloud's door hands the record the ingest its URL named, and mail still names none.
 *
 * THE TOKEN WAS CHECKED AGAINST ONE INGEST AND THE RECORD WAS TOLD NOTHING OF WHICH. `serveIngest` reads
 * `/in/webhook/<rec>/<ingest>/<token>`, `cloudIngest` asks `verifies(rec, ingest)` for that one ingest's
 * digest, and then built the arrival from the bytes and the flag alone. The kernel, given no ingest,
 * offers a verified webhook to every webhook pattern in declaration order, so a token minted for the second
 * of two ingests whose patterns both match a text bought a write under the first. The kernel half and the
 * self-host half are measured in `packages/kernel/test/arrive-ingest.test.ts` and `apps/selfhost/test/server.test.ts`;
 * this is the Worker's, written against `route.ts` because `src/index.ts` cannot be loaded by `node --test`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveIngest } from '@braindog/host';

import { cloudIngest, type CloudIngestDeps } from '../src/route.ts';

const REC = 'rec_01J8ZC0000000000000000000A';
const TOKEN = 'tok_minted_for_second';

/** A door whose record answers `path` with `TOKEN` for every ingest, and which keeps what reached `arrives`. */
function door(): { door: ReturnType<typeof cloudIngest>; arrived: Record<string, unknown>[] } {
  const arrived: Record<string, unknown>[] = [];
  const deps: CloudIngestDeps = {
    knows: () => Promise.resolve(true),
    verifies: () => Promise.resolve({ kind: 'path', token: TOKEN }),
    arrives: (_rec, arrival) => {
      arrived.push({ ...arrival });
      return Promise.resolve({ ok: true as const, value: { raw: 'raw_1' } });
    },
    spends: () => Promise.resolve(null),
    inbound: { recordFor: () => Promise.resolve(REC) },
  };
  return { door: cloudIngest(deps), arrived };
}

test('A WEBHOOK ARRIVAL REACHES THE RECORD WITH THE INGEST ITS URL NAMED', async () => {
  const { door: d, arrived } = door();
  const res = await serveIngest(new Request(`https://app.brain.dog/in/webhook/${REC}/second/${TOKEN}`, { method: 'POST', body: 'You paid EGP 120.00' }), d);

  assert.equal(res.status, 202);
  assert.equal(arrived[0]?.verified, true);
  assert.equal(arrived[0]?.ingest, 'second', 'the door checked the token against `second` and then did not say so');
  assert.equal(arrived[0]?.rec, undefined, 'the record id is the address, not a fact about the payload');
});

test('A FORWARDED MESSAGE NAMES NO INGEST, so the record still offers it to each mail ingest in turn', async () => {
  const { door: d, arrived } = door();
  const res = await serveIngest(
    new Request('https://app.brain.dog/in/email/some-inbound-token', { method: 'POST', body: 'From: bank@example.com\r\n\r\nYou paid EGP 120.00' }),
    d,
  );

  assert.equal(res.status, 202);
  assert.equal(arrived.length, 1);
  assert.equal('ingest' in (arrived[0] ?? {}), false);
});
