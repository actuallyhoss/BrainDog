/**
 * `on_conflict: review`: an arrival that looks like a row the register already holds is held for a person, not dropped.
 *
 * A NEAR MATCH WAS EITHER A SKIP OR A SECOND ROW, and neither can be right for a message that may be a real second
 * charge. A hundred real texts held two card alerts with the same amount, merchant and day a few minutes apart, whose
 * available limits differ by exactly the charge. `skip` stored the second as `transactions#N already says this` and no
 * screen ever asked; `new` would file every forwarded mail and its SMS twin twice. Measured before `review` existed: a
 * declaration carrying it installed clean (nothing checks the value at install) and then behaved as `new`, writing the
 * second row at `exact` with no reason on it.
 *
 * SO `review` STORES THE ARRIVAL AS `review` AND OPENS A ROWSET NAMING THE ROW IT RESEMBLES. Accepting it files the
 * second row; declining it leaves the register as it was. Nothing is written until a person has said which it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

const CARD = (onConflict: string): Declaration => ({
  id: 'ingest.bank-card',
  kind: 'ingest',
  body: {
    ingest: 'bank-card',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'card used' }] },
    extract: {
      merchant: { text: { between: ['at ', ' for'] } },
      amount: { money: { after: 'for ', currency: 'EGP' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: ['merchant', 'amount'],
    on_conflict: onConflict,
  } as never,
});

/* Synthetic wordings, invented for this file: no real message is quoted here. */
const COFFEE = 'Card used at Halden Coffee for EGP 85.00 today.';
const BAKERY = 'Card used at Cedar Lane Bakery for EGP 85.00 today.';

async function record(onConflict: string): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([TRANSACTIONS, CARD(onConflict)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const arrive = (k: Kernel, body: string, sha256: string): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'alerts@bank.example', Subject: 'Card' }, body, sha256 }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

test('A SECOND ARRIVAL LIKE A ROW ALREADY FILED IS HELD FOR A PERSON, naming the row it resembles', async () => {
  const { k, sql } = await record('review');
  const first = arrive(k, COFFEE, 'c1');
  assert.equal(first.state, 'matched');
  const filed = first.wrote[0]!;

  const second = arrive(k, COFFEE.replace('today', 'this morning'), 'c2');
  assert.equal(second.state, 'review', `a near match under review was ${second.state}: ${second.reason}`);
  assert.deepEqual(second.wrote, []);
  assert.equal(k.count('transactions'), 1, 'nothing is written until a person says it is a second one');
  assert.equal(second.confidence, 'needs-review');
  assert.equal(
    second.reason,
    'This looks like transactions#1, with the same merchant and amount, so bank-card held it for a person rather than skip it or file it twice.',
  );

  const raw = sql.one<{ state: string; reason: string }>('SELECT state, reason FROM inbox_raw WHERE id = ?', second.raw);
  assert.deepEqual({ ...raw }, { state: 'review', reason: second.reason }, 'the stored row says the same as the answer');
  /* THE MATCH EVENT SAYS WHAT LEVEL IT MATCHED AT, as every other held arm's does. Deleting the `note` call left all
     three tests above green when it was tried, so this is the line that notices. */
  const matched = sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'match' AND target = ?", `inbox_raw:${second.raw}`);
  assert.equal(matched?.to_v, 'needs-review');

  assert.ok(second.suggestion, 'a held arrival opens something a person can answer');
  const sg = sql.one<{ body_kind: string; body: string; opened_by: string }>('SELECT body_kind, body, opened_by FROM suggestion WHERE id = ?', second.suggestion);
  assert.equal(sg?.body_kind, 'rowset');
  assert.equal(sg?.opened_by, 'ingest:bank-card');
  const body = JSON.parse(sg!.body) as { register: string; rows: Record<string, unknown>[]; resembles: string };
  assert.equal(body.register, 'transactions');
  assert.equal(body.resembles, filed, 'the suggestion carries the id of the row it resembles, for a screen to link');
  assert.deepEqual(body.rows, [{ merchant: 'Halden Coffee', amount: { amount: 8500, currency: 'EGP' } }]);
  sql.close();
});

test('ACCEPTING IT FILES THE SECOND ROW, and rejecting it leaves the register as it was', async () => {
  const { k, sql } = await record('review');
  arrive(k, COFFEE, 'c1');
  const accepted = arrive(k, COFFEE.replace('today', 'at noon'), 'c2');
  const yes = k.decide(accepted.suggestion!, { decide: { option: 'accept', reason: 'two coffees, two charges' } }, 'p_1');
  assert.ok(yes.ok, JSON.stringify(yes));
  assert.equal(k.count('transactions'), 2);

  const rejected = arrive(k, COFFEE.replace('today', 'again'), 'c3');
  assert.equal(rejected.state, 'review');
  const no = k.decide(rejected.suggestion!, { decide: { option: 'reject', reason: 'the same charge, sent twice' } }, 'p_1');
  assert.ok(no.ok, JSON.stringify(no));
  assert.equal(k.count('transactions'), 2);
  sql.close();
});

test('AN ARRIVAL THAT RESEMBLES NOTHING IS FILED AS BEFORE, and skip still skips', async () => {
  const held = await record('review');
  assert.equal(arrive(held.k, COFFEE, 'c1').state, 'matched');
  const other = arrive(held.k, BAKERY, 'b1');
  assert.equal(other.state, 'matched', 'a different merchant is a different movement');
  assert.equal(other.suggestion, undefined);
  assert.equal(held.k.count('transactions'), 2);
  held.sql.close();

  const skip = await record('skip');
  arrive(skip.k, COFFEE, 'c1');
  const again = arrive(skip.k, COFFEE.replace('today', 'this morning'), 'c2');
  assert.equal(again.state, 'skipped');
  /* SAID BY THE ROW IT REPEATS, its name and amount, and never the list's id and a number (REC-A03). */
  assert.equal(again.reason, 'Looks like a repeat of Halden Coffee, EGP 85.00.');
  assert.ok(again.repeats, 'the skip did not keep the row it repeats');
  assert.equal(again.suggestion, undefined);
  skip.sql.close();
});

/**
 * A `near` KEY'S DAY AND PREFIX ARE NOT "THE SAME", and the reason said they were. Measured with the shape of the
 * seed's `SAME_MOVEMENT` (`{ near: { on: [amount, account], day: on, prefix: what } }`) and two alerts a day apart
 * whose merchants only started alike: the reason read "with the same amount, account, on and what". The reader is a
 * stub that agrees with every candidate, because the fold is `extract`'s and the sentence is the kernel's.
 */
test('A NEAR KEY SAYS WHICH FIELDS ARE EQUAL AND WHICH ARE ONLY CLOSE', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { duplicate: () => true });
  const installed = await k.install([
    {
      id: 'register.transactions',
      kind: 'register',
      body: {
        id: 'transactions',
        name: 'Transactions',
        title: 'what',
        fields: [
          { id: 'what', type: 'text', required: true },
          { id: 'amount', type: 'money' },
          { id: 'account', type: 'text' },
          { id: 'on', type: 'day' },
        ],
      } as never,
    },
    {
      id: 'ingest.bank-card',
      kind: 'ingest',
      body: {
        ingest: 'bank-card',
        channel: 'email',
        match: { all: [{ field: 'body', contains: 'card ' }] },
        extract: {
          what: { text: { between: ['at ', ' for'] } },
          amount: { money: { after: 'for ', currency: 'EGP' } },
          account: { text: { between: ['Card ', ' used'] } },
          on: { date: { after: 'on ', format: 'YYYY-MM-DD' } },
        },
        writes: { register: 'transactions', confidence: 'exact' },
        dedupe: { near: { on: ['amount', 'account'], day: 'on', prefix: { field: 'what', chars: 12 } } },
        on_conflict: 'review',
      } as never,
    },
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));

  assert.equal(arrive(k, 'Card 1234 used at Halden Coffee Roasters for EGP 85.00 on 2026-09-04 ok', 'n1').state, 'matched');
  const next = arrive(k, 'Card 1234 used at Halden Coffee Roast for EGP 85.00 on 2026-09-05 ok', 'n2');
  assert.equal(next.state, 'review');
  assert.equal(
    next.reason,
    'This looks like transactions#1, with the same amount and account, on within a day of it and what starting the same way, so bank-card held it for a person rather than skip it or file it twice.',
  );
  sql.close();
});

test('A VALUE THE KERNEL HAS NO ANSWER FOR IS REFUSED AT INSTALL, and so is review on a pull', async () => {
  /* MEASURED BEFORE THE CHECK: `bogus` installed clean and filed a resend as a second row, as `new` does. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const wrong = await k.install([TRANSACTIONS, CARD('bogus')]);
  assert.equal(wrong.ok, false, 'an on_conflict nothing answers installed');
  const refused = (wrong as { refusal: { code: string; at?: string; allowed?: readonly string[] } }).refusal;
  assert.deepEqual([refused.code, refused.at, refused.allowed], ['ENUM_VALUE_UNKNOWN', 'on_conflict', ['skip', 'update', 'new', 'review']]);

  const feed = (onConflict: string): Declaration => ({
    id: 'ingest.bank-feed',
    kind: 'ingest',
    body: { ingest: 'bank-feed', channel: 'pull', every: '1h', extract: {}, writes: { register: 'transactions' }, dedupe: ['merchant'], on_conflict: onConflict } as never,
  });
  const pulled = await k.install([TRANSACTIONS, feed('review')]);
  assert.equal(pulled.ok, false, 'review on a pull installed, where fetched.ts would file the near match as a second row');
  assert.equal((pulled as { refusal: { at?: string } }).refusal.at, 'on_conflict');
  const updating = await k.install([TRANSACTIONS, feed('update')]);
  assert.ok(updating.ok, `the same pull with update is refused for something else: ${JSON.stringify(updating)}`);
  sql.close();
});
