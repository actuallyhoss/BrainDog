/**
 * `43 §5.1` step 6's routing table, read the way a real record reads it.
 *
 * THE THIRD OF `07 §2`'s THREE. A skip list, a routing table, a fuzzy dedupe: the two either side
 * of this one landed in the commits before it, and this one had the same shape. `42 §4.7` types
 * `writes.register` as `Id | Route`, `43 §4.2` types the `Route`, and the kernel typed it `string`
 * — so a declaration that routed its rows installed clean, matched, read every field, and then
 * asked a register named `[object Object]` to hold them.
 *
 * THE ORACLE IS `43 §9.5`'s TWO ROWS, copied out of the document, including the reason:
 * *`register` absent, `needs-review`, `reason = 'needs-review: route miss on kind, amount.currency'`*. The reason a
 * person reads says the same in words since REC-A03: the pattern by its name and each field the table sorts by as its
 * label, "found nowhere to file one with this kind and amount's currency".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const register = (id: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: {
    id,
    name: id,
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'kind', type: 'text' },
      { id: 'amount', type: 'money' },
    ],
  } as never,
});

const reader = (writes: unknown) => ({
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    description: 'Bank texts',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    extract: {
      merchant: { text: { between: ['at ', ' on'] } },
      kind: { enum: { map: { debited: 'debit', credited: 'credit' } } },
      amount: { money: {} },
    },
    writes,
  } as never,
});

const M1 = (cur: string, word = 'debited') => `Card 1234 ${word} ${cur} 1,250.00 at BEANS COFFEE on 29/08/26`;

/** One arrival through one declaration: what it landed as, why, and which register holds it. */
async function lands(writes: unknown, body: string) {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([register('txn_egp'), register('txn_usd'), reader(writes)]);
  assert.ok(put.ok, JSON.stringify(put));
  const got = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: 'a1' });
  assert.ok(got.ok, JSON.stringify(got));
  return {
    state: got.value.state,
    reason: got.value.reason ?? '',
    egp: api.kernel.count('txn_egp'),
    usd: api.kernel.count('txn_usd'),
  };
}

const ROUTE = {
  register: {
    by: ['kind', 'amount.currency'],
    to: [
      { when: ['debit', 'EGP'], register: 'txn_egp' },
      { when: ['debit', 'USD'], register: 'txn_usd' },
    ],
  },
};

test("A ROUTED WRITE LANDS WHERE THE ROW'S OWN VALUES SEND IT", async () => {
  /* `§5.1` step 6: *the row's `by` values (a field id, or `<money field>.currency`) as strings,
     matched in order against `to[].when`; the first equal tuple wins*. `§9.5`'s row is the first
     one below, and a currency is a `by` id because one bank's alerts are two registers. */
  assert.deepEqual(await lands(ROUTE, M1('EGP')), { state: 'matched', reason: '', egp: 1, usd: 0 });
  assert.deepEqual(await lands(ROUTE, M1('USD')), { state: 'matched', reason: '', egp: 0, usd: 1 });

  /* AND A PLAIN REGISTER IS STILL A PLAIN REGISTER. */
  const one = await lands({ register: 'txn_egp' }, M1('USD'));
  assert.equal(one.state, 'matched');
  assert.equal(one.egp, 1);
});

test('AND A MISS IS A ROW SOMEBODY LOOKS AT, not a row guessed into the nearest register', async () => {
  /* `§9.5`, verbatim: *`register` absent, `needs-review`, `reason = 'needs-review: route miss on
     kind, amount.currency'`*. Guessing here is the failure the table exists to prevent: a credit
     filed as a debit is a number that is right and a sign that is wrong, and no later check catches
     it because both rows look ordinary. The miss is said in words, with no field path and no pattern id. */
  const missed = await lands(ROUTE, M1('EGP', 'credited'));
  assert.equal(missed.state, 'review');
  assert.equal(missed.reason, "Bank texts read this one and found nowhere to file one with this kind and amount's currency.");
  assert.equal(missed.egp, 0);
  assert.equal(missed.usd, 0);

  /* AND THE SAME WHEN THE CURRENCY IS THE HALF THAT MISSES. */
  const other = await lands(ROUTE, M1('KWD'));
  assert.equal(other.state, 'review');
  assert.match(other.reason, /found nowhere to file one with this kind and amount's currency\.$/);
});
