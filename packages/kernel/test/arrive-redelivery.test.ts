/**
 * A redelivery is the same bytes at the same door that were accepted, not any earlier sighting of them.
 *
 * THE KEY WAS `channel` AND `sha256` ALONE, CHECKED BEFORE ANY MATCHING. So the first door to see a set of bytes
 * decided what they were for good. Two orders of events that are ordinary and not attacks lost a write that way,
 * and both answered 202 at the door (`loop/research-batch-thirty-audit.md` 1, `research-batch-thirty-one-audit.md` 2):
 *
 *   - a Shortcut set up before the token was minted, or after a rotation, posts a message with the old token. It is
 *     stored `untriaged` with `UNVERIFIED` on it. The same message sent again with the right token came back
 *     `redelivered` and nothing was written.
 *   - a person with the bank twins posts every message to each twin's URL. A credit that reached the withdrawal URL
 *     first was stored `untriaged`, because that door's pattern does not read credits, and the credit URL then
 *     answered `redelivered` with nothing in `in`.
 *
 * Measured before the repair, this file's first two cases and the fourth: `untriaged` and `redelivered: true` on the
 * second call, and zero rows in the register. The third case is the other half of the rule, which HEAD already kept
 * and the repair must not lose: a verified arrival that WAS accepted and is sent again is one row and one write. It
 * cannot fail at HEAD, which errs the other way, so it was made red on the repair instead: with the `untriaged`
 * condition taken off the rescue, the third and fourth cases fail. With the no-change branch taken out, the last
 * case fails, because a retry at a door that does not read the bytes queued a second draft.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const REGISTER = (id: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name: id,
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
});

/* THE TWINS, AS THE AUDIT'S PROBE HAD THEM: one reads withdrawals into `out` and one reads credits into `in`, and
   neither pattern accepts the other's text, which is what makes the first door's answer `untriaged`. */
const HOOK = (ingest: string, word: string, register: string): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: {
    ingest,
    channel: 'webhook',
    match: { all: [{ field: 'body', contains: word }] },
    extract: { merchant: { text: { between: [`You ${word} `, ' EGP'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register, confidence: 'exact' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
  } as never,
});

const PAID = 'You paid Carrefour EGP 120.00 today.';
const CREDIT = 'You received Salary EGP 9000.00 today.';

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([REGISTER('out'), REGISTER('in'), HOOK('bank-out', 'paid', 'out'), HOOK('bank-in', 'received', 'in')]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const arrived = (r: unknown): Arrived => {
  const out = r as { ok: boolean; value: Arrived };
  assert.ok(out.ok, JSON.stringify(r));
  return out.value;
};

const raws = (sql: NodeSql): number => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM inbox_raw')?.n ?? 0);
const receipts = (sql: NodeSql): number => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM ingest_receipt')?.n ?? 0);

test('A WRONG TOKEN FIRST DOES NOT MAKE THE RIGHT TOKEN A REDELIVERY', async () => {
  const { k, sql } = await record();
  const first = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'a1', verified: false }));
  assert.equal(first.state, 'untriaged');

  const second = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'a1', verified: true }));
  assert.equal(second.state, 'matched', `the right token came back ${second.state}${second.redelivered ? ', redelivered' : ''}`);
  assert.equal(second.ingest, 'bank-out');
  assert.notEqual(second.redelivered, true);
  assert.equal(k.count('out'), 1, 'the withdrawal the right token carried was never written');

  /* THE BYTES ARE STILL ONE ROW. `UNIQUE (channel, sha256)` is the schema's own idempotence and the repair works
     through it, by running the pipeline on the row the wrong token left rather than beside it. */
  assert.equal(raws(sql), 1);
  assert.equal(first.raw, second.raw);
  assert.equal(sql.one<{ reason: string | null }>('SELECT reason FROM inbox_raw WHERE id = ?', second.raw)?.reason, null);
  sql.close();
});

test('THE WRONG DOOR FIRST DOES NOT MAKE THE RIGHT DOOR A REDELIVERY', async () => {
  const { k, sql } = await record();
  const first = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: CREDIT, sha256: 'b1', verified: true }));
  assert.equal(first.state, 'untriaged', 'the withdrawal door read a credit');

  const second = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-in', body: CREDIT, sha256: 'b1', verified: true }));
  assert.equal(second.state, 'matched', `the credit door came back ${second.state}${second.redelivered ? ', redelivered' : ''}`);
  assert.equal(second.ingest, 'bank-in');
  assert.deepEqual({ out: k.count('out'), in: k.count('in') }, { out: 0, in: 1 });
  assert.equal(raws(sql), 1);
  sql.close();
});

test('A VERIFIED ARRIVAL THAT WAS ACCEPTED AND IS SENT AGAIN IS STILL ONE ROW AND ONE WRITE', async () => {
  const { k, sql } = await record();
  const first = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-in', body: CREDIT, sha256: 'c1', verified: true }));
  assert.equal(first.state, 'matched');

  /* AT THE SAME DOOR, AND AT THE OTHER ONE. Once a pattern has accepted the bytes they are spoken for: the twin that
     posts to every URL must not get a second answer out of the neighbour, and neither retry may write. */
  for (const ingest of ['bank-in', 'bank-out']) {
    const again = arrived(k.arrive({ channel: 'webhook', ingest, body: CREDIT, sha256: 'c1', verified: true }));
    assert.equal(again.redelivered, true, `a retry at ${ingest} was not a redelivery`);
    assert.equal(again.state, 'matched');
    assert.equal(again.ingest, 'bank-in');
    assert.equal(again.raw, first.raw);
  }

  /* AND A WRONG TOKEN AFTER A RIGHT ONE CHANGES NOTHING. It never reaches a pattern, so it cannot undo one. */
  const forged = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-in', body: CREDIT, sha256: 'c1', verified: false }));
  assert.equal(forged.redelivered, true);
  assert.equal(forged.state, 'matched');

  assert.deepEqual({ out: k.count('out'), in: k.count('in') }, { out: 0, in: 1 });
  assert.equal(raws(sql), 1);
  assert.equal(receipts(sql), 1);
  sql.close();
});

test('A RESCUED ARRIVAL SENT A THIRD TIME IS A REDELIVERY OF THE RESCUE', async () => {
  const { k, sql } = await record();
  arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'd1', verified: false }));
  arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'd1', verified: true }));
  const third = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'd1', verified: true }));

  assert.equal(third.redelivered, true);
  assert.equal(third.state, 'matched');
  assert.equal(k.count('out'), 1);
  assert.equal(receipts(sql), 1);
  sql.close();
});

test('AN UNVERIFIED RETRY OF AN UNVERIFIED ARRIVAL IS STILL ONE ROW, and nothing is tried', async () => {
  const { k, sql } = await record();
  arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'e1', verified: false }));
  const again = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: PAID, sha256: 'e1', verified: false }));

  assert.equal(again.redelivered, true);
  assert.equal(again.state, 'untriaged');
  assert.equal(k.count('out'), 0);
  assert.equal(raws(sql), 1);
  sql.close();
});

/* THE CHECKER'S TWO, ADDED AFTER MUTATING THE REPAIR. Every case above names an ingest, so the rescue condition cut
   down to `arrival.ingest !== undefined` passed all six, and so did the no-change branch widened to every rescue.
   The first case below fails under the first mutation and the second under the other. */
test('A WRONG TOKEN FIRST IS RESCUED WHEN THE ARRIVAL NAMES NO INGEST', async () => {
  const { k, sql } = await record();
  arrived(k.arrive({ channel: 'webhook', body: PAID, sha256: 'g1', verified: false }));
  const second = arrived(k.arrive({ channel: 'webhook', body: PAID, sha256: 'g1', verified: true }));

  assert.equal(second.state, 'matched', `the right token came back ${second.state}${second.redelivered ? ', redelivered' : ''}`);
  assert.equal(second.ingest, 'bank-out');
  assert.equal(k.count('out'), 1);
  assert.equal(raws(sql), 1);
  sql.close();
});

test('A WRONG TOKEN FIRST AND THEN A DOOR THAT DOES NOT READ THE BYTES IS NEW, because a pattern was tried for the first time', async () => {
  const { k, sql } = await record();
  const first = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: CREDIT, sha256: 'h1', verified: false }));
  const second = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: CREDIT, sha256: 'h1', verified: true }));

  assert.equal(second.state, 'untriaged');
  assert.notEqual(second.redelivered, true, 'the first verified sighting was answered as a retry');
  assert.equal(second.raw, first.raw);
  assert.equal(sql.one<{ reason: string | null }>('SELECT reason FROM inbox_raw WHERE id = ?', second.raw)?.reason, null);
  assert.equal(raws(sql), 1);
  sql.close();
});

test('THE SAME BYTES AGAIN AT A DOOR THAT DID NOT READ THEM ARE A REDELIVERY, and queue no second draft', async () => {
  const { k, sql } = await record();
  const drafts = (): number => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.draft'")?.n ?? 0);
  arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: CREDIT, sha256: 'f1', verified: true }));
  const before = drafts();
  const again = arrived(k.arrive({ channel: 'webhook', ingest: 'bank-out', body: CREDIT, sha256: 'f1', verified: true }));

  assert.equal(again.redelivered, true);
  assert.equal(again.state, 'untriaged');
  assert.equal(drafts(), before, 'a retry at a door that does not read the bytes queued another model call');
  assert.equal(raws(sql), 1);
  sql.close();
});
