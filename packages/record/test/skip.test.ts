/**
 * `43 §5.2`'s skip list, read the way a real record reads it.
 *
 * THE LIST NOTHING READ. `07 §2` names three rules that travel with an ingest: a skip list, a
 * routing table, and a fuzzy dedupe. `42 §4.7` gives the first of them a row — *1 to 16 of
 * `{ when: predicate on inbox_raw, reason: text ≤ 120 }`* — and `43 §5.1` step 2 puts it second in
 * the pipeline, before anything is read: *a hit → `{ rows: [], skipped: reason }`, no receipt. Stop.*
 *
 * The kernel had no `skip?:` member and `arrive` never evaluated one, and `declare` had no unknown
 * key check, so a declaration whose author wrote a refund skip installed clean, reported success,
 * and wrote the refund into the register as a transaction. A pattern that is accepted, fires, and
 * does the opposite of what it says: the same shape as the four iterations before it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const MOVES = {
  id: 'register.moves',
  kind: 'register' as const,
  body: {
    id: 'moves',
    name: 'Moves',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

const reader = (skip: unknown) => ({
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    skip,
    extract: { merchant: { text: { between: ['at ', ' on'] } }, amount: { money: { after: 'debited' } } },
    writes: { register: 'moves', confidence: 'exact' },
  } as never,
});

/** One arrival through one declaration: what it landed as, why, and what the record holds after. */
async function arrives(skip: unknown, body: string) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([MOVES, reader(skip)]);
  assert.ok(put.ok, JSON.stringify(put));
  const got = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: 'a1' });
  assert.ok(got.ok, JSON.stringify(got));
  const receipts = sql.all<{ n: number }>('SELECT count(*) AS n FROM ingest_receipt')[0]?.n ?? 0;
  return { state: got.value.state, reason: got.value.reason ?? null, rows: api.kernel.count('moves'), receipts };
}

const REFUND = 'REFUND debited EGP 75.00 at BEANS COFFEE on 29/08/26';
const CHARGE = 'Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26';

const refund = { when: { field: 'body', contains: 'REFUND' }, reason: 'refund' };

test('A SKIP HIT STOPS THE PIPELINE, and the arrival says why', async () => {
  /* `43 §9.5`'s own row, copied out of the document: `D1 + skip: [{ when: { field: body, contains:
     "REFUND" }, reason: "refund" }]` over a body starting `REFUND` is `skipped: 'refund'`,
     `rows: []`, no receipt. The kernel matched it, extracted it, and wrote the refund as a charge. */
  assert.deepEqual(await arrives([refund], REFUND), { state: 'skipped', reason: 'refund', rows: 0, receipts: 0 });
});

test('AND A LIST THAT DOES NOT FIRE CHANGES NOTHING', async () => {
  /* The other half, which is what makes the first one a skip rather than a filter: the same
     declaration over an ordinary charge still reads it and still writes it. */
  const got = await arrives([refund], CHARGE);
  assert.equal(got.state, 'matched');
  assert.equal(got.rows, 1);
  assert.equal(got.receipts, 1);

  /* AND NO LIST AT ALL IS THE SAME ANSWER. */
  const none = await arrives(undefined, REFUND);
  assert.equal(none.state, 'matched');
  assert.equal(none.rows, 1);
});

test('THE FIRST TRUE `when` WINS, in declared order', async () => {
  /* `§5.2` step 3, verbatim: *in declared order; the first true `when` wins and its `reason` is the
     arrival's*. Two rules that both hold is the ordinary case — a refund from a card that is also
     being ignored — and the answer a person reads has to be the one they wrote first. */
  const both = [refund, { when: { field: 'body', contains: 'BEANS' }, reason: 'a test merchant' }];
  assert.equal((await arrives(both, REFUND)).reason, 'refund');
  assert.equal((await arrives([...both].reverse(), REFUND)).reason, 'a test merchant');
});
