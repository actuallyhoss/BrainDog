/**
 * What each of the money pack's bank patterns WRITES, on a record that has the readers wired.
 *
 * WHY THIS FILE EXISTS. A mutation of `aeef01c5` flipped `bank-ipn-in`'s `direction` from `in` to `out` and every test
 * stayed green. `packages/seed/test/money-bank.test.ts` opens a bare kernel, because `@braindog/seed` may not import
 * `@braindog/extract` (`tools/gates/graph.mjs`), and a bare kernel cannot read `DD-MM-YYYY`, so for the three InstaPay
 * messages it could only prove which pattern claimed each one and that the date was the field left unread. No row was
 * ever written, so nothing looked at the sign, the figure, the code, the description or the account that a row would
 * carry.
 *
 * THIS PACKAGE CAN, because `createRecordApi` hands `scanMoney`, `scanDates` and `matchLiterals` down to
 * the kernel it opens, the same way production does. So every wording is forwarded here through the
 * real record over `installSeed`, and the row it writes is read back field by field.
 *
 * THE BANK'S SIX ARE ITS PACK FILE'S, INSTALLED ON TOP OF THE SEED. The sample used to carry them, and this file was
 * one of the reasons it did; it now installs `packs/bank-hsbc-eg/bank-hsbc-eg.pack.json` itself
 * (`seed/test/pack-files.ts`), so what is read here is what a person who installs that pack reads. Measured with the
 * sample's twelve gone and nothing in their place: ten of this file's fourteen tests failed.
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
import type { Sql } from '@braindog/ports';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, day, installSeed } from '../../seed/src/index.ts';
import { CARD_INGESTS, HSBC_EG_INGESTS, bankDeclarations, bankHsbcEgFile, cardAlertDeclarations } from '../../seed/test/pack-files.ts';

/** The seeded record, and two EGP accounts whose digits the invented wordings name. */
async function record(): Promise<{ k: Kernel; sql: Sql; card: string; current: string; company: string }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const k = api.kernel;
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  /* WHAT THE BANK FILE LAYS SINCE 1.7.0, its extends, which a record opened over installSeed takes no pack to lay: the
     InstaPay reference its transfers write and key their near rule on. */
  const ledger = k.declarations().find((d) => d.id === 'register.transactions')!;
  const own = (typeof ledger.body === 'string' ? JSON.parse(ledger.body) : ledger.body) as { fields: unknown[] };
  const laid = (bankHsbcEgFile().extends as Record<string, { fields: unknown[] }>)['register.transactions']!.fields;
  const ledgered = await k.install([{ id: 'register.transactions', kind: 'register', body: { ...own, fields: [...own.fields, ...laid] } as never }]);
  assert.ok(ledgered.ok, JSON.stringify(ledgered));
  const bank = await k.install(bankDeclarations());
  assert.ok(bank.ok, JSON.stringify(bank));
  /* THE CARD WORDINGS ARE THE CARD ALERTS PACK'S SINCE MONEY-CORE 3.0.0, so the seeded record no longer carries them. */
  const cards = await k.install(cardAlertDeclarations());
  assert.ok(cards.ok, JSON.stringify(cards));
  const made =(fields: Record<string, unknown>): string => {
    const got = k.create('accounts', fields, { actor: 'p_seed' });
    assert.ok(got.ok, JSON.stringify(got));
    return got.value.id;
  };
  const card = made({ name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: false, last4: '9052' });
  const current = made({ name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: true, last4: '846' });
  /* The seed's own card, whose digits the two older sterling alerts name. */
  const seedCard = k.get('accounts#3');
  assert.equal(seedCard?.fields.last4, '4471', 'the seed\'s third account is no longer the card ending 4471');
  return { k, sql, card, current, company: seedCard.id };
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
    body: 'Your Credit Card ending with *** 9052 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50',
    direction: 'out', amount: 128_450, currency: 'EGP', what: 'CEDAR LANE BAKERY', on: '2026-08-14', account: 'card',
  },
  {
    ingest: 'bank-ipn-out',
    body: 'Your HSBC Account ***846 was debited with IPN outward transfer for EGP 3,250.00 on 07-08-2026 16:42 to MARLOW JOINERY with reference 9c4e1f7a2b. For further details, please contact HSBC',
    direction: 'out', amount: 325_000, currency: 'EGP', what: 'MARLOW JOINERY', on: '2026-08-07', account: 'current',
  },
  /* THE PURCHASE NAMES ITS PAYEE AFTER `from`, and this fixture said `to`, which is the transfer's word. Measured on
     real messages: the one real purchase in the window was claimed, read in every field but `what`, and held for a
     person. Measured red here before the anchor moved: `review`, `bank-ipn-out could not read what out of this one.` */
  {
    ingest: 'bank-ipn-out',
    body: 'Your HSBC Account ***846 was debited with IPN purchase for EGP 615.75 on 19-08-2026 21:10 from GRANARY MARKET with reference 0f7d2c91e4. For further details, please contact HSBC',
    direction: 'out', amount: 61_575, currency: 'EGP', what: 'GRANARY MARKET', on: '2026-08-19', account: 'current',
  },
  {
    ingest: 'bank-ipn-in',
    body: 'Your HSBC Account ***846 was credited with IPN inward transfer for EGP 12,400.00 on 11-08-2026 08:05 from quill.harbour@instapay with reference 5d0b33e8aa. For further details, please contact HSBC',
    direction: 'in', amount: 1_240_000, currency: 'EGP', what: 'quill.harbour@instapay', on: '2026-08-11', account: 'current',
  },
  {
    ingest: 'bank-from-out',
    body: 'From HSBC: 16AUG26 ATM Cash Withdrawal from 310-527***-846 EGP 2500.00- Your available balance is EGP 31,040.25',
    direction: 'out', amount: 250_000, currency: 'EGP', what: '16AUG26 ATM Cash Withdrawal', on: '2026-08-16', account: 'current',
  },
  /* THE CODE AGAINST THE FIGURE. This line was filed `matched`, `exact`, as an OUT of GBP 0.00, because `scanMoney`
     read `EGP2500.00` as the `00` after its point in the fallback currency. Nothing measured says HSBC Egypt glues the
     code; the reader was wrong either way. */
  {
    ingest: 'bank-from-out',
    body: 'From HSBC: 16AUG26 ATM Cash Withdrawal from 310-527***-846 EGP2500.00- Your available balance is EGP 31,040.25',
    direction: 'out', amount: 250_000, currency: 'EGP', what: '16AUG26 ATM Cash Withdrawal', on: '2026-08-16', account: 'current',
  },
  /* THE CREDIT HAS ITS OWN PATTERN, claimed off the `+` the bank glues to the figure. Until `bank-from-in` existed
     this line was nobody's, so a deposit printed this way never reached the ledger at all. */
  {
    ingest: 'bank-from-in',
    body: 'From HSBC: 01AUG26 Deposit Interest 310-527***-846 EGP 418.62+ Your available balance is EGP 33,540.25',
    direction: 'in', amount: 41_862, currency: 'EGP', what: '01AUG26 Deposit Interest 310-527', on: '2026-08-01', account: 'current',
  },
];

type Held = Omit<Want, 'direction'> & { why: string };

/**
 * THE `From HSBC:` LINES WHOSE SIGN IS A HYPHEN THAT DOES NOT TOUCH THE FIGURE, held for a person and not written.
 *
 * `match:` was the substring `- your available balance`, so a hyphen with a space either side satisfied it, and a
 * transfer IN printed that way was filed OUT at `exact`. Measured red here before the repair: the first line below came
 * back `matched`, `bank-from-out`, `exact`, a row with `direction: out`. Whether a spaced hyphen is the bank's sign or
 * a separator the bank never printed is not something one line can settle, so the answer is a person, with the figure,
 * the day and the account already read and the direction left for them to say.
 */
const HELD: Held[] = [
  {
    ingest: 'bank-from-unsure',
    why: 'a hyphen with a space either side',
    body: 'From HSBC: 01AUG26 Transfer from NADIA FARID to 310-527***-846 EGP 418.62 - Your available balance is EGP 33,540.25',
    amount: 41_862, currency: 'EGP', what: '01AUG26 Transfer', on: '2026-08-01', account: 'current',
  },
  {
    ingest: 'bank-from-unsure',
    why: 'a hyphen touching the word and not the figure',
    body: 'From HSBC: 16AUG26 ATM Cash Withdrawal from 310-527***-846 EGP 2500.00 -Your available balance is EGP 31,040.25',
    amount: 250_000, currency: 'EGP', what: '16AUG26 ATM Cash Withdrawal', on: '2026-08-16', account: 'current',
  },
];

test('EVERY MONEY PATTERN IS DRIVEN HERE, so a pattern added without a row to check fails this file', () => {
  assert.deepEqual(
    [...new Set([...WORDINGS, ...HELD].map((w) => w.ingest))].sort(),
    Object.keys({ ...CARD_INGESTS, ...HSBC_EG_INGESTS }).sort(),
    'a pattern in the card alerts or the bank file has no wording here, so nothing checks what it writes',
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

for (const held of HELD)
  test(`${held.ingest} HOLDS ${held.currency} ${held.amount} FOR A PERSON when the sign is ${held.why}`, async () => {
    const r = await record();
    const before = r.k.count('transactions');

    const out = forward(r.k, held.body, `money-ipn-held-${held.amount}`);
    assert.equal(out.ingest, held.ingest, `claimed by ${out.ingest}: ${out.reason}`);
    assert.equal(out.state, 'review', `${out.state} at ${out.confidence}: ${out.reason}`);
    assert.equal(out.confidence, 'needs-review');
    assert.equal(r.k.count('transactions'), before, 'a line whose sign could go either way was written to the ledger');

    /* WHAT THE PERSON IS ASKED TO ACCEPT is everything but the direction, read exactly, so the one question left
       is the one the line could not answer. A direction in here would be a guess put in front of them as a fact. */
    assert.ok(out.suggestion, 'held with nothing for a person to accept');
    const body = JSON.parse(r.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', out.suggestion)!.body) as {
      register: string;
      rows: Record<string, unknown>[];
    };
    assert.equal(body.register, 'transactions');
    assert.equal(body.rows.length, 1);
    const row = body.rows[0]!;
    assert.equal(row.direction, undefined, 'the held row carries a direction the line never settled');
    assert.deepEqual(row.amount, { amount: held.amount, currency: held.currency }, 'the figure or the code is not the one the bank printed');
    assert.equal(row.what, held.what);
    assert.equal(row.on, held.on);
    assert.equal(row.account, r[held.account], `the lookup did not land on the ${held.account} account the digits name`);
  });

test('THE `From HSBC:` CREDIT IS STORED AND CLAIMED BY NOTHING, because its only sign is a hyphen that is not there', async () => {
  const { k } = await record();
  const before = k.count('transactions');
  const out = forward(k, 'From HSBC: 01AUG26 Deposit Interest to 310-527***-846 EGP 418.62 Your available balance is EGP 33,540.25', 'money-ipn-from-in');
  assert.equal(out.state, 'untriaged', `claimed by ${out.ingest}: ${out.reason}`);
  assert.equal(out.ingest, null);
  assert.equal(k.count('transactions'), before, 'a line with no pattern wrote a row');
});

/**
 * ONE ACCOUNT, PRINTED TWO WAYS. The InstaPay messages print his EGP account as stars and four digits, the `From HSBC:`
 * lines as a branch code, three stars and the last three of those four. `lookup` answered only the row whose `last4` is
 * a WHOLE TOKEN in the slice, so whichever form he typed, one family went to `review` with `account` unread.
 *
 * READ NOW BY `lookup`'s SUFFIX RULE (`matchLiterals` in `packages/extract/src/extractors.ts`, asked for by name
 * from `packages/kernel/src/ingest.ts`): digits printed behind stars are the tail of the one row whose longer value
 * ends in them, and of two such rows, neither. Measured red on this file before the repair, with the `todo` taken
 * off: `review`, `bank-from-out could not read account out of this one.`
 */
test('A `last4` OF FOUR DIGITS IS THE ACCOUNT A LINE PRINTING ITS LAST THREE BEHIND STARS NAMES, when exactly one account ends so', async () => {
  const r = await record();
  const four = r.k.create('accounts', { name: 'Cairo savings', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: true, last4: '6518' }, { actor: 'p_seed' });
  assert.ok(four.ok, JSON.stringify(four));

  const out = forward(r.k, 'From HSBC: 03AUG26 ATM Cash Withdrawal from 310-527***-518 EGP 900.00- Your available balance is EGP 4,100.00', 'money-ipn-suffix');
  /* THE FIRST LINE FILED BY ITS PRINTED TAIL WAITS FOR ONE CONFIRMATION, and accepting it files the row. */
  assert.equal(out.state, 'proposed', out.reason ?? '');
  assert.equal(out.reason, 'Filed to Cairo savings by its last digits 518. Confirm it once and later ones file straight away.');
  const yes = r.k.decide(out.suggestion!, { decide: { option: 'accept', reason: 'the savings account' } }, 'p_seed');
  assert.ok(yes.ok, JSON.stringify(yes));
  const row = r.k.get(yes.value.wrote[0]!)!;
  assert.equal(row.fields.direction, 'out');
  assert.deepEqual(row.fields.amount, { amount: 90_000, currency: 'EGP' });
  assert.equal(row.fields.account, four.value.id, 'the three printed digits did not land on the one account ending in them');

  /* THE SAME `last4` STILL READS THE INSTAPAY FAMILY, which prints all four digits behind its stars. */
  const ipn = forward(r.k, 'Your HSBC Account ********6518 was debited with IPN outward transfer for EGP 75.00 on 05-08-2026 10:15 to ORCHARD PRINTS with reference 3a9e0c55d1. For further details, please contact HSBC', 'money-ipn-suffix-four');
  assert.equal(ipn.state, 'matched', ipn.reason ?? '');
  assert.equal(r.k.get(ipn.wrote[0]!)!.fields.account, four.value.id, 'the four printed digits did not land on the account holding them');

  /* AND TWO ACCOUNTS ENDING IN THE SAME THREE IS A PERSON'S QUESTION, never the first one found. */
  const twin = r.k.create('accounts', { name: 'Cairo deposit', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: false, last4: '7518' }, { actor: 'p_seed' });
  assert.ok(twin.ok, JSON.stringify(twin));
  const again = forward(r.k, 'From HSBC: 04AUG26 ATM Cash Withdrawal from 310-527***-518 EGP 50.00- Your available balance is EGP 4,050.00', 'money-ipn-suffix-twin');
  assert.equal(again.state, 'review', 'three digits two accounts end in were filed against one of them');
});
