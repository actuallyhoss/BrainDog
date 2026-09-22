/**
 * What each of the money pack's bank patterns WRITES, on a record that has the readers wired.
 *
 * WHY THIS FILE EXISTS. The checker of `aeef01c5` flipped `bank-ipn-in`'s `direction` from `in` to
 * `out` and every test stayed green. `packages/seed/test/money-bank.test.ts` opens a bare kernel,
 * because `@braindog/seed` may not import `@braindog/extract` (`tools/gates/graph.mjs`), and a bare
 * kernel cannot read `DD-MM-YYYY`, so for the three InstaPay messages it could only prove which pattern
 * claimed each one and that the date was the field left unread. No row was ever written, so nothing
 * looked at the sign, the figure, the code, the description or the account that a row would carry.
 *
 * THIS PACKAGE CAN, because `createRecordApi` hands `scanMoney`, `scanDates` and `matchLiterals` down to
 * the kernel it opens, the same way production does. So every wording is forwarded here through the
 * real record over `installSeed`, and the row it writes is read back field by field.
 *
 * PROVED RED BY MUTATION, on a copy of `packages/seed/src/modules/money.ts` restored from the copy
 * afterwards: `bank-ipn-in`'s map set to `{ credited: 'out' }` failed the InstaPay-in row here on
 * `direction`, which is the flip nothing caught before.
 *
 * EVERY VALUE BELOW IS INVENTED. The wordings are the shapes HSBC Egypt sends and `money-bank.test.ts`
 * explains where they came from; the figures, merchants, names, card digits, account digits and
 * references are made up, because this repository is public.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Arrived, Kernel } from '@braindog/kernel';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, day, installSeed } from '../../seed/src/index.ts';
import { MONEY_INGESTS } from '../../seed/src/modules/money.ts';

/** The seeded record, and two EGP accounts whose digits the invented wordings name. */
async function record(): Promise<{ k: Kernel; card: string; current: string; company: string }> {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const k = api.kernel;
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  const made = (fields: Record<string, unknown>): string => {
    const got = k.create('accounts', fields, { actor: 'p_seed' });
    assert.ok(got.ok, JSON.stringify(got));
    return got.value.id;
  };
  const card = made({ name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: false, last4: '6180' });
  const current = made({ name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: true, last4: '327' });
  /* The seed's own card, whose digits the two older sterling alerts name. */
  const seedCard = k.get('accounts#3');
  assert.equal(seedCard?.fields.last4, '4471', 'the seed\'s third account is no longer the card ending 4471');
  return { k, card, current, company: seedCard.id };
}

const forward = (k: Kernel, body: string, sha256: string): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' }, body, sha256 }) as {
    ok: boolean;
    value: Arrived;
    refusal?: { code: string; fix: string };
  };
  assert.ok(r.ok, r.ok ? '' : `${r.refusal?.code}: ${r.refusal?.fix}`);
  return r.value;
};

type Want = {
  ingest: string;
  body: string;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  what: string;
  on: string;
  account: 'card' | 'current' | 'company';
};

/**
 * ONE WORDING PER PATTERN, and the InstaPay purchase as well, because it is claimed by `bank-ipn-out`
 * through a different phrase (`IPN purchase`) and a pattern that only read the transfer would pass on
 * the transfer alone.
 */
const WORDINGS: Want[] = [
  {
    ingest: 'bank-card-out',
    body: 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. If this was not you, call us.',
    direction: 'out', amount: 4_299, currency: 'GBP', what: 'FENWICK CLOUD', on: '2026-09-18', account: 'company',
  },
  {
    ingest: 'bank-card-in',
    body: 'HSBC: Your card ending 4471 was credited GBP 5,005.00 from NILE REALTY on 29/08/26.',
    direction: 'in', amount: 500_500, currency: 'GBP', what: 'NILE REALTY', on: '2026-08-29', account: 'company',
  },
  {
    ingest: 'bank-card-used',
    body: 'Your Credit Card ending with *** 6180 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50',
    direction: 'out', amount: 128_450, currency: 'EGP', what: 'CEDAR LANE BAKERY', on: '2026-08-14', account: 'card',
  },
  {
    ingest: 'bank-ipn-out',
    body: 'Your HSBC Account ***327 was debited with IPN outward transfer for EGP 3,250.00 on 07-08-2026 16:42 to MARLOW JOINERY with reference 9c4e1f7a2b',
    direction: 'out', amount: 325_000, currency: 'EGP', what: 'MARLOW JOINERY', on: '2026-08-07', account: 'current',
  },
  {
    ingest: 'bank-ipn-out',
    body: 'Your HSBC Account ***327 was debited with IPN purchase for EGP 615.75 on 19-08-2026 21:10 to GRANARY MARKET with reference 0f7d2c91e4',
    direction: 'out', amount: 61_575, currency: 'EGP', what: 'GRANARY MARKET', on: '2026-08-19', account: 'current',
  },
  {
    ingest: 'bank-ipn-in',
    body: 'Your HSBC Account ***327 was credited with IPN inward transfer for EGP 12,400.00 on 11-08-2026 08:05 from quill.harbour@instapay with reference 5d0b33e8aa',
    direction: 'in', amount: 1_240_000, currency: 'EGP', what: 'quill.harbour@instapay', on: '2026-08-11', account: 'current',
  },
  {
    ingest: 'bank-from-out',
    body: 'From HSBC: 16AUG26 ATM Cash Withdrawal from 042-118***-327 EGP 2500.00- Your available balance is EGP 31,040.25',
    direction: 'out', amount: 250_000, currency: 'EGP', what: '16AUG26 ATM Cash Withdrawal', on: '2026-08-16', account: 'current',
  },
];

test('EVERY MONEY PATTERN IS DRIVEN HERE, so a pattern added without a row to check fails this file', () => {
  assert.deepEqual(
    [...new Set(WORDINGS.map((w) => w.ingest))].sort(),
    Object.keys(MONEY_INGESTS).sort(),
    'a pattern in MONEY_INGESTS has no wording here, so nothing checks what it writes',
  );
});

for (const want of WORDINGS)
  test(`${want.ingest} WRITES ${want.direction.toUpperCase()} ${want.currency} ${want.amount} for "${want.what}"`, async () => {
    const r = await record();
    const before = r.k.count('transactions');

    const out = forward(r.k, want.body, `money-ipn-${want.ingest}-${want.amount}`);
    assert.equal(out.ingest, want.ingest, `claimed by ${out.ingest}: ${out.reason}`);
    assert.equal(out.state, 'matched', out.reason ?? '');
    assert.equal(out.confidence, 'exact', 'a field was chosen or defaulted, so nothing reached the ledger');
    assert.equal(r.k.count('transactions'), before + 1);

    const row = r.k.get(out.wrote[0]!)!;
    assert.equal(row.fields.direction, want.direction, 'the row carries the other sign, which every total then counts the wrong way');
    assert.deepEqual(row.fields.amount, { amount: want.amount, currency: want.currency }, 'the figure or the code on the row is not the one the bank printed');
    assert.equal(row.fields.what, want.what);
    assert.equal(row.fields.on, want.on);
    assert.equal(row.fields.account, r[want.account], `the lookup did not land on the ${want.account} account the digits name`);
  });

test('THE `From HSBC:` CREDIT IS STORED AND CLAIMED BY NOTHING, because its only sign is a hyphen that is not there', async () => {
  const { k } = await record();
  const before = k.count('transactions');
  const out = forward(k, 'From HSBC: 01AUG26 Deposit Interest to 042-118***-327 EGP 418.62 Your available balance is EGP 33,540.25', 'money-ipn-from-in');
  assert.equal(out.state, 'untriaged', `claimed by ${out.ingest}: ${out.reason}`);
  assert.equal(out.ingest, null);
  assert.equal(k.count('transactions'), before, 'a line with no pattern wrote a row');
});
