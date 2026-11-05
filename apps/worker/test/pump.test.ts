/**
 * The doorbell's other end, tested where it can be: `pump.ts` imports nothing from `cloudflare:`,
 * so every decision in it runs here against object literals.
 *
 * WHAT THESE ARE ABOUT is the three ways one pass can lie: a failure logged as a success, a success
 * recorded as a failure, and one record's bad afternoon taking the other twenty-four with it. None
 * of them throws, none of them shows up in a type, and the first one had already happened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { OutboxRow } from '@braindog/kernel';
import { consume, pump, type Leasable, type Rung } from '../src/pump.ts';

const job = (id: string, kind: OutboxRow['kind'] = 'notify.email', payload = '{}'): OutboxRow => ({
  id,
  kind,
  payload,
  attempts: 0,
  leasedUntil: '2026-09-06T12:00:00.000Z',
});

type Acked = { id: string; state: 'done' | 'failed'; error?: string; leasedUntil?: string };

function record(jobs: OutboxRow[], onAck?: (a: Acked) => void): Leasable & { acks: Acked[] } {
  const acks: Acked[] = [];
  return {
    acks,
    lease: () => Promise.resolve(jobs),
    ack: (a) => {
      acks.push(a);
      onAck?.(a);
      return Promise.resolve();
    },
  };
}

function ring(...records: string[]): Rung[] & { acked: string[]; retried: string[] } {
  const acked: string[] = [];
  const retried: string[] = [];
  const rungs = records.map((r, i) => ({
    body: { record: r },
    ack: () => acked.push(`${r}#${i}`),
    retry: () => retried.push(`${r}#${i}`),
  }));
  return Object.assign(rungs, { acked, retried });
}

test('A DELIVERED JOB IS ACKED DONE, WITH THE LEASE IT WAS DELIVERED UNDER', async () => {
  const r = record([job('o_1'), job('o_2')]);
  const out = await pump(r, () => Promise.resolve());

  assert.deepEqual(out, { sent: 2, failed: 0, unacked: 0 });
  assert.deepEqual(
    r.acks.map((a) => [a.id, a.state, a.leasedUntil]),
    [
      ['o_1', 'done', '2026-09-06T12:00:00.000Z'],
      ['o_2', 'done', '2026-09-06T12:00:00.000Z'],
    ],
    'the lease is the fence, and it goes back with the answer',
  );
});

test('AND A FAILED ONE IS ACKED FAILED — the pump keeps no ladder of its own', async () => {
  const r = record([job('o_1')]);
  const out = await pump(r, () => Promise.reject(new Error('the endpoint answered 500')));

  assert.deepEqual(out, { sent: 0, failed: 1, unacked: 0 });
  assert.equal(r.acks[0]?.state, 'failed');
  assert.equal(r.acks[0]?.error, 'the endpoint answered 500');
  /* THE RECORD COUNTS THE ATTEMPT. Nothing here re-leases, re-tries or waits: a second ladder for
     one notification is how a thing gets retried forever or never. */
  assert.equal(r.acks.length, 1, 'the pump tried again by itself');
});

test('THE SUCCESS ACK IS OUTSIDE THE TRY WHOSE CATCH ACKS FAILURE', async () => {
  /* This is the shape that sent an email twice: the ack was inside, so an ack that threw for its
     own reasons — a DO RPC can, on a code update — recorded a SENT email as failed and armed a
     retry for it. A throwing ack must leave the job unacked, never re-acked as the other state. */
  const r = record([job('o_1')], (a) => {
    if (a.state === 'done') throw new Error('the object was being replaced');
  });
  const said: string[] = [];
  const out = await pump(r, () => Promise.resolve(), (l) => said.push(l));

  assert.deepEqual(out, { sent: 0, failed: 0, unacked: 1 }, 'a delivered job was counted as failed');
  assert.deepEqual(
    r.acks.map((a) => a.state),
    ['done'],
    'a job that was SENT was acked failed after its done-ack threw',
  );
  assert.match(said[0] ?? '', /^ack o_1:/);
});

test('an ack that will not land does not abandon the rest of the batch', async () => {
  const r = record([job('o_1'), job('o_2'), job('o_3')], (a) => {
    if (a.id === 'o_1') throw new Error('rpc');
  });
  const out = await pump(r, () => Promise.resolve(), () => {});

  assert.deepEqual(out, { sent: 2, failed: 0, unacked: 1 });
  assert.equal(r.acks.length, 3, 'the pass stopped at the first ack that threw');
});

test('AND NOTHING IT LOGS CARRIES A PAYLOAD', async () => {
  /* A digest is somebody's overdue invoices. The id and the transport's own message are the whole
     of what is safe to say, and the payload is what a log line must never quote. */
  const secret = 'Invoice 41 to Ada, 12 days overdue';
  const r = record([job('o_1', 'notify.email', JSON.stringify({ text: secret }))], () => {
    throw new Error('rpc');
  });
  const said: string[] = [];
  await pump(r, () => Promise.reject(new Error('nope')), (l) => said.push(l));

  assert.equal(said.length, 1);
  assert.ok(!said[0]!.includes(secret), `the log quoted a payload: ${said[0]}`);
});

test('A DOORBELL WHOSE RECORD DRAINED IS ACKED, and one whose record threw GOES BACK', async () => {
  /* `max_retries = 3` is written down in `wrangler.toml` with a comment saying it covers a consumer
     that crashed. It is alive only if something calls `retry()`; a consumer that catches, logs and
     returns is one Cloudflare reads as successful, and the doorbell is gone for good. */
  const bells = ring('rec_a', 'rec_b');
  const said: string[] = [];
  await consume(bells, (id) => (id === 'rec_b' ? Promise.reject(new Error('mid-deploy')) : Promise.resolve()), (l) =>
    said.push(l),
  );

  assert.deepEqual(bells.acked, ['rec_a#0']);
  assert.deepEqual(bells.retried, ['rec_b#1'], 'a failed drain acked its doorbell as done');
  assert.match(said[0] ?? '', /^drain rec_b: mid-deploy$/);
});

test('A DOORBELL NOBODY CAN READ IS ACKED, and does not take the batch with it', async () => {
  /* `m.body.record` on a null body throws a TypeError out of the GROUPING loop — out of `consume`,
     out of `queue()`, and Cloudflare fails the whole batch. One malformed message (an older payload
     shape, another producer, one injected from the dashboard) re-drove twenty-four healthy records
     three times and then dropped them. The docstring promised the opposite; the grouping loop was
     breaking the promise the drain loop keeps. */
  const acked: string[] = [];
  const retried: string[] = [];
  const bad = (body: unknown): Rung =>
    ({ body, ack: () => void acked.push('bad'), retry: () => void retried.push('bad') }) as unknown as Rung;
  const good: Rung = { body: { record: 'rec_a' }, ack: () => void acked.push('good'), retry: () => void retried.push('good') };

  const said: string[] = [];
  await consume([bad(null), bad({}), bad({ record: 42 }), bad({ record: '' }), good], () => Promise.resolve(), (l) =>
    said.push(l),
  );

  assert.deepEqual(acked, ['bad', 'bad', 'bad', 'bad', 'good'], 'a message nobody can read was retried, or took the batch');
  assert.deepEqual(retried, []);
  assert.equal(said.length, 4);
});

test('and the platform’s own answer can throw without becoming a drain failure', async () => {
  /* `m.ack()` used to be inside the try whose catch reads as a DRAIN failure, so an ack that threw
     on the third of five ringers retried the two already acked and logged a failure that never
     happened. */
  let acks = 0;
  const bells: Rung[] = ['a', 'b', 'c'].map(() => ({
    body: { record: 'rec_a' },
    ack: () => {
      if (++acks === 2) throw new Error('rpc');
    },
    retry: () => assert.fail('a successful drain retried its doorbell'),
  }));
  const said: string[] = [];
  await consume(bells, () => Promise.resolve(), (l) => said.push(l));

  assert.equal(acks, 3, 'one ack that threw stopped the others');
  assert.equal(said.length, 1);
  assert.match(said[0] ?? '', /^answering a doorbell: rpc$/, 'an ack that threw was reported as a drain that failed');
});

test('one record’s failure is not the batch’s, and the rest are still drained', async () => {
  const bells = ring('rec_a', 'rec_bad', 'rec_c');
  const passes: string[] = [];
  await consume(
    bells,
    (id) => {
      passes.push(id);
      return id === 'rec_bad' ? Promise.reject(new Error('down')) : Promise.resolve();
    },
    () => {},
  );

  assert.deepEqual(passes, ['rec_a', 'rec_bad', 'rec_c'], 'a failing record stopped the batch');
  assert.deepEqual(bells.acked, ['rec_a#0', 'rec_c#2']);
  assert.deepEqual(bells.retried, ['rec_bad#1']);
});

test('TWENTY RINGS ABOUT ONE RECORD ARE ONE PASS, and all twenty are answered', async () => {
  const bells = ring(...Array.from({ length: 20 }, () => 'rec_a'));
  const passes: string[] = [];
  await consume(bells, (id) => {
    passes.push(id);
    return Promise.resolve();
  });

  assert.deepEqual(passes, ['rec_a'], 'nineteen round trips for nothing');
  assert.equal(bells.acked.length, 20, 'a message nobody acked is redelivered for work already done');
  assert.equal(bells.retried.length, 0);
});

test('and when that one pass fails, every message that rang for it goes back', async () => {
  const bells = ring('rec_a', 'rec_a', 'rec_a');
  await consume(bells, () => Promise.reject(new Error('down')), () => {});

  assert.equal(bells.retried.length, 3, 'a message was acked for a drain that never happened');
  assert.equal(bells.acked.length, 0);
});

test('A FAILED DELIVERY KEEPS ITS SENTENCE AND NOT THE KEY IN IT: the row is shown on a screen and travels in an export', async () => {
  const key = `sk_${'live'}_Q7d9Xk2Lm4Zp8Rt6Vb3Nc1Hs5Jf0Gw2Y`;
  const r = record([job('o_1')]);
  const out = await pump(r, () => Promise.reject(new Error(`Network connection lost: https://hooks.example/send?token=${key}`)));
  assert.equal(out.failed, 1);
  assert.match(r.acks[0]?.error ?? '', /Network connection lost: https:\/\/hooks\.example\/send/u);
  assert.ok(!(r.acks[0]?.error ?? '').includes(key), 'the key reached the row');
});
