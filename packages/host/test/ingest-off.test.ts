/**
 * A door that is off (SHL-C13): 410, an empty body, nothing stored, and the arrival counted once as turned away.
 *
 * MEASURED BEFORE THIS WAS WRITTEN: `IngestVerify` had no way to say a door was off, so the only door that stopped
 * taking arrivals was one whose declaration was retired, which answered 404 and lost its token. Every name is invented.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serveIngest, type IngestArrival, type IngestDoor, type IngestTurnedAway, type IngestVerify } from '../src/ingest.ts';

const HOST = 'https://in.example';
const TOKEN = 'tk_kiln_0a1b2c3d4e5f60718293a4b5c6d7e8f9';

function door(verify: IngestVerify | null, inbound?: IngestDoor['inbound'], count?: IngestDoor['turnedAway']) {
  const arrivals: IngestArrival[] = [];
  const away: IngestTurnedAway[] = [];
  const d: IngestDoor = {
    verify: async () => verify,
    arrive: async (a) => {
      arrivals.push(a);
      return { ok: true as const, value: { raw: 'raw_1' } };
    },
    limit: async () => null,
    turnedAway:
      count ??
      (async (ask) => {
        away.push(ask);
      }),
    ...(inbound ? { inbound } : {}),
  };
  return { d, arrivals, away };
}

const post = (path: string, body = '{"reading":1180}') => new Request(`${HOST}${path}`, { method: 'POST', body });

test('A WEBHOOK DOOR THAT IS OFF ANSWERS 410 WITH NO BODY, stores nothing, and counts the arrival once', async () => {
  const { d, arrivals, away } = door({ kind: 'path', token: TOKEN, off: true });
  const res = await serveIngest(post(`/in/webhook/rec_pottery/kiln-sensor/${TOKEN}`), d);
  assert.equal(res.status, 410);
  assert.equal(await res.text(), '');
  assert.equal(arrivals.length, 0);
  assert.deepEqual(away, [{ channel: 'webhook', rec: 'rec_pottery', ingest: 'kiln-sensor' }]);
});

test('OFF IS ANSWERED WHATEVER THE TOKEN, so a wrong one learns nothing a right one would not', async () => {
  const { d, arrivals, away } = door({ kind: 'path', token: TOKEN, off: true });
  const res = await serveIngest(post('/in/webhook/rec_pottery/kiln-sensor/not-the-token'), d);
  assert.equal(res.status, 410);
  assert.equal(arrivals.length, 0);
  assert.equal(away.length, 1);
});

test('THE SAME DOOR ON IS STORED AS BEFORE, and nothing is counted as turned away', async () => {
  const { d, arrivals, away } = door({ kind: 'path', token: TOKEN });
  const res = await serveIngest(post(`/in/webhook/rec_pottery/kiln-sensor/${TOKEN}`), d);
  assert.equal(res.status, 202);
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0]!.verified, true);
  assert.equal(away.length, 0);
});

test('A COUNT THAT FAILS STILL ANSWERS 410, because the sender was turned away either way', async () => {
  const { d, arrivals } = door({ kind: 'none', off: true }, undefined, async () => {
    throw new Error('the record is busy');
  });
  const res = await serveIngest(post('/in/webhook/rec_pottery/garden-gate'), d);
  assert.equal(res.status, 410);
  assert.equal(arrivals.length, 0);
});

test('A HOST THAT COUNTS NOTHING STILL ANSWERS 410', async () => {
  const { d } = door({ kind: 'none', off: true });
  delete (d as { turnedAway?: unknown }).turnedAway;
  const res = await serveIngest(post('/in/webhook/rec_pottery/garden-gate'), d);
  assert.equal(res.status, 410);
});

test('A MAILBOX THAT IS OFF ANSWERS THE SAME: 410, no body, nothing stored, counted once for its record', async () => {
  const { d, arrivals, away } = door(null, async () => ({ rec: 'rec_pottery', off: true }));
  const res = await serveIngest(post('/in/email/mailtok', 'From: Clay Supply <orders@clay.example>\r\nSubject: Your order\r\n\r\nShipped.'), d);
  assert.equal(res.status, 410);
  assert.equal(await res.text(), '');
  assert.equal(arrivals.length, 0);
  assert.deepEqual(away, [{ channel: 'email', rec: 'rec_pottery' }]);
});

test('A MAILBOX ANSWERED AS A BARE RECORD ID IS ON, as every host wrote it before a mailbox could be off', async () => {
  const { d, arrivals, away } = door(null, async () => 'rec_pottery');
  const res = await serveIngest(post('/in/email/mailtok', 'From: Clay Supply <orders@clay.example>\r\nSubject: Your order\r\n\r\nShipped.'), d);
  assert.equal(res.status, 202);
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0]!.rec, 'rec_pottery');
  assert.equal(away.length, 0);
});
