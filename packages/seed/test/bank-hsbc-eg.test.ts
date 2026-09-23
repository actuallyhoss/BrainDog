/**
 * Two HSBC card charges with the same amount, merchant, card and day are two rows, and one charge sent twice is one.
 *
 * THE NEAR RULE DROPPED A REAL SECOND CHARGE. `loop/research-bank-real.md` found two card alerts in a hundred real texts
 * with the same amount, merchant and day a few minutes apart, and `SAME_MOVEMENT` skipped the second as
 * `transactions#N already says this.` Neither alert was one message delivered twice: the available limits they print
 * differ by exactly the charge. Measured here before the pattern read the limit: the second of the pair below came back
 * `skipped` and the ledger held one row.
 *
 * THE LIMIT IS WHAT TELLS THEM APART, so `bank-card-used` reads it into `available` and compares it. Two charges leave two
 * different limits behind them, and the same alert forwarded again prints the same limit, which is still one row.
 *
 * THROUGH `createRecordApi` AND NOT A BARE KERNEL, because the near rule needs `@braindog/extract`'s `isDuplicate`, which
 * only the record hands down: a bare kernel finds no candidate and would pass the first half of this for the wrong reason.
 * The wordings are the bank's shape with invented values; no real message is quoted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Arrived, Kernel } from '@braindog/kernel';

import { createRecordApi } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, day, installSeed } from '../src/index.ts';

async function record(): Promise<{ k: Kernel; card: string; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const k = api.kernel;
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  const made = k.create(
    'accounts',
    { name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: false, last4: '6180' },
    { actor: 'p_seed' },
  );
  assert.ok(made.ok, JSON.stringify(made));
  return { k, card: made.value.id, close: () => sql.close() };
}

const forward = (k: Kernel, body: string, sha256: string): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' }, body, sha256 }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const charged = (limit: string): string =>
  `Your Credit Card ending with *** 6180 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP ${limit}`;

const cardRows = (k: Kernel, card: string): { fields: Record<string, unknown> }[] => {
  const page = k.list({ register: 'transactions', limit: 200 }) as { ok: boolean; value: { rows: { fields: Record<string, unknown> }[] } };
  assert.ok(page.ok, JSON.stringify(page));
  return page.value.rows.filter((row) => row.fields.account === card);
};

test('TWO CHARGES OF THE SAME AMOUNT AT THE SAME SHOP ON THE SAME DAY ARE TWO ROWS, told apart by the limit each leaves', async () => {
  const { k, card, close } = await record();
  const first = forward(k, charged('23,715.50'), 'card-1');
  assert.equal(first.state, 'matched', first.reason);

  const second = forward(k, charged('22,431.00'), 'card-2');
  assert.equal(second.state, 'matched', `a second charge was ${second.state}: ${second.reason}`);
  assert.equal(second.ingest, 'bank-card-used');
  assert.equal(cardRows(k, card).length, 2);
  assert.deepEqual(
    [first, second].map((out) => k.get(out.wrote[0]!)!.fields.available),
    [{ amount: 2_371_550, currency: 'EGP' }, { amount: 2_243_100, currency: 'EGP' }],
    'each row keeps the limit its alert printed',
  );
  close();
});

test('AND THE SAME ALERT SENT AGAIN IS STILL ONE ROW, because it prints the same limit', async () => {
  const { k, card, close } = await record();
  assert.equal(forward(k, charged('23,715.50'), 'card-1').state, 'matched');
  /* DIFFERENT BYTES, THE SAME MESSAGE: a forwarded copy carries the forward's own line above it, so the raw's hash
     does not catch it and the dedupe has to. */
  const again = forward(k, `Fwd: ${charged('23,715.50')}`, 'card-1-fwd');
  assert.equal(again.state, 'skipped', `a resend was ${again.state}: ${again.reason}`);
  assert.match(again.reason ?? '', /^transactions#\d+ already says this\.$/u);
  assert.equal(cardRows(k, card).length, 1);
  close();
});
