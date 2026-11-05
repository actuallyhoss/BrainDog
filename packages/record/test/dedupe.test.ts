/**
 * `43 §5.7`'s dedupe key, read the way a real record reads it.
 *
 * THE KEY A DECLARATION CAN ACTUALLY WRITE IS `dedupe:`. `42 §4.7` lists it as an ingest's own key —
 * *1–4 field ids, or `{ near: { on, day, prefix } }`* — and `43 §4.2` types it the same way. The
 * kernel read `writes.key`, which is a name no schema documents and no pack writes, so every
 * declaration written the way the specification writes it deduped on nothing: `on_conflict` had
 * nothing to compare, and the second email about one invoice wrote a second row.
 *
 * AND A MONEY FIELD IS NOT ITS NUMBER. `§5.7` step 1 says a money value compares as
 * `{ amount, currency }`; the query beside it binds `'.amount' = ? AND '.currency' = ?`. Comparing
 * the amount alone makes EGP 1,250.00 and USD 1,250.00 the same row, and under the default
 * `on_conflict: skip` the second one is dropped and nothing downstream ever says what went missing.
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
      { id: 'day', type: 'day' },
      { id: 'ref', type: 'text' },
    ],
  } as never,
};

const reader = (dedupe: unknown) => ({
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    extract: {
      merchant: { text: { between: ['at ', ' on'] } },
      amount: { money: { after: 'debited' } },
      day: { date: { format: 'DD/MM/YY' } },
      ref: { text: { after: 'Ref ' } },
    },
    writes: { register: 'moves', confidence: 'exact' },
    dedupe,
    on_conflict: 'skip',
  } as never,
});

/** One declaration, then a series of arrivals: the state each one landed in, in order. */
async function states(dedupe: unknown, ...bodies: string[]): Promise<string[]> {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([MOVES, reader(dedupe)]);
  assert.ok(put.ok, JSON.stringify(put));
  const out: string[] = [];
  for (const [i, body] of bodies.entries()) {
    const got = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: `a${i}` });
    assert.ok(got.ok, JSON.stringify(got));
    out.push(got.value.state);
  }
  return out;
}

const sms = (amount: string, merchant: string, day: string, ref: string) =>
  `Card 1234 debited ${amount} at ${merchant} on ${day}. Ref ${ref}`;

test('THE KEY A DECLARATION WRITES IS `dedupe:`, and the same event twice is one row', async () => {
  /* `42 §4.7`'s row, and `43 §4.2`'s `dedupe?: Dedupe`. The second arrival is different bytes — a
     different hash, so the raw's own idempotence does not reach it — about the same transaction. */
  assert.deepEqual(
    await states(['ref'], sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'BEANS COFFEE LTD', '30/08/26', '88213')),
    ['matched', 'skipped'],
  );

  /* AND A DIFFERENT REFERENCE IS A DIFFERENT MOVEMENT. */
  assert.deepEqual(
    await states(['ref'], sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88214')),
    ['matched', 'matched'],
  );

  /* A KEY THAT NAMES NOTHING IS NOT A KEY — `§5.7` step 1 over an empty list, and `07 §3`'s
     `on_conflict: new` by construction. */
  assert.deepEqual(
    await states(undefined, sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88214')),
    ['matched', 'matched'],
  );

  /* BUT THE SAME WORDS OF MONEY AGAIN ARE HELD FOR A PERSON, KEY OR NO KEY, and nothing is written (`heardBefore`). */
  assert.deepEqual(
    await states(undefined, sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213')),
    ['matched', 'review'],
  );
});

test('A MONEY KEY CARRIES ITS CURRENCY, because 1,250 in two currencies is two amounts', async () => {
  /* `§5.7` step 1: *a money value compares as `{ amount, currency }`*, and the query beside it binds
     the currency as a second term. On the amount alone these two collide, and `skip` drops the
     second — a real transaction gone, from a declaration that reads correctly. */
  assert.deepEqual(
    await states(['amount'], sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('USD 1,250.00', 'ACME LTD', '29/08/26', '99001')),
    ['matched', 'matched'],
  );

  /* AND THE SAME MONEY IS STILL THE SAME MONEY. */
  assert.deepEqual(
    await states(['amount'], sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'ACME LTD', '29/08/26', '99001')),
    ['matched', 'skipped'],
  );
});

test('AND THE `near` FORM IS THE ONE A PROVIDER ACTUALLY NEEDS: a day out, a merchant extended', async () => {
  /* `§5.7` step 2, and `07 §2`'s sentence about why it exists: the same transaction arrives with a
     different id, often a day apart at a boundary, often with the merchant string extended. */
  const near = { near: { on: ['amount'], day: 'day', prefix: { field: 'merchant', chars: 5 } } };

  assert.deepEqual(
    await states(near, sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'BEANS COFFEE LONDON', '30/08/26', '99001')),
    ['matched', 'skipped'],
  );

  /* TWO DAYS APART IS OUTSIDE THE WINDOW. */
  assert.deepEqual(
    await states(near, sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'BEANS COFFEE LONDON', '31/08/26', '99001')),
    ['matched', 'matched'],
  );

  /* AND A DIFFERENT MERCHANT AT THE SAME AMOUNT ON THE SAME DAY IS NOT ONE EVENT, which is the
     whole reason the prefix is part of the key rather than the amount being enough. */
  assert.deepEqual(
    await states(near, sms('EGP 1,250.00', 'BEANS COFFEE', '29/08/26', '88213'), sms('EGP 1,250.00', 'ACME LTD', '29/08/26', '99001')),
    ['matched', 'matched'],
  );
});
