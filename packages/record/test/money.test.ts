/**
 * `43 §4.3`'s money, read the way a real record reads it.
 *
 * THE ORACLE IS THE DOCUMENT AND NOT EITHER IMPLEMENTATION. Every expected value below is copied
 * out of `43 §9.1`'s worked table, over that section's own message M1. Two readers of `07 §3`'s
 * money exist — `packages/kernel/src/ingest.ts`'s and `@braindog/extract`'s — and when they were
 * driven against each other the kernel's failed three of the five rows the document writes out.
 *
 * AND IT IS TESTED HERE BECAUSE THIS IS WHERE THE TWO MEET. The scanner is rank 9 and the reader
 * of an arrival is rank 7; neither may import the other (`31 §2`), so `createRecordApi` at rank 11
 * hands the scanner down. A test in either package can only assert half of that: the kernel's own
 * suite asserts that a scanner handed down is used and that a record without one is unchanged,
 * and this file asserts what the record actually reads off somebody's bank message.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

/** `43 §9`'s M1, byte for byte. */
const M1 = 'Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26. Ref 88213. Balance EGP 3,020.15.';

const AMOUNTS = {
  id: 'register.amounts',
  kind: 'register' as const,
  body: {
    id: 'amounts',
    name: 'Amounts',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'paid', type: 'money' },
    ],
  } as never,
};

const reader = (form: Record<string, unknown>) => ({
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    extract: { what: { text: { before: ' at' } }, paid: form },
    writes: { register: 'amounts', confidence: 'exact', key: ['what'] },
    on_conflict: 'skip',
  } as never,
});

/** One message through one declaration, and the money it wrote. */
async function read(form: Record<string, unknown>, body = M1): Promise<unknown> {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([AMOUNTS, reader(form)]);
  assert.ok(put.ok, JSON.stringify(put));
  const out = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: 'a1' });
  assert.ok(out.ok, JSON.stringify(out));
  return api.kernel.get('amounts#1')?.fields['paid'] ?? null;
}

test("43 §9.1'S MONEY ROWS, off a real record — and the reader failed three of five", async () => {
  /* `{ money: {} }` READ NOTHING ON EVERY ARRIVAL, FOR EVER. A declaration that did not name a
     currency installed, matched, and left the field empty — the same shape as the `date.format`
     defect and the extractor-arguments one before it, a fourth time. The document reads the first
     amount that has a code beside it. */
  assert.deepEqual(await read({ money: {} }), { amount: 125_000, currency: 'EGP' });
  assert.deepEqual(await read({ money: { after: 'debited' } }), { amount: 125_000, currency: 'EGP' });

  /* THE CARD NUMBER, WHICH THE DOCUMENT FLAGS AS THE TRAP RATHER THAN AS A DEFECT: a declared
     currency makes `1234` a money candidate and it is the first one in the message. `43 §9.1`'s
     own answer beside that row is *anchor it*. */
  assert.deepEqual(await read({ money: { currency: 'EGP' } }), { amount: 123_400, currency: 'EGP' });

  /* AND EVERY AMOUNT IN THE MESSAGE IS A CANDIDATE, so `nth` reaches the balance. This one could
     not be written before: the runtime yielded the first number of a slice, so the second amount
     of a one-slice message was unreachable however it was anchored. */
  assert.deepEqual(await read({ nth: { n: 2, of: { money: {} } } }), { amount: 302_015, currency: 'EGP' });
  assert.equal(await read({ nth: { n: 3, of: { money: {} } } }), null);
});

test('A DECLARED CURRENCY STANDS BEHIND THE TEXT AND NEVER OVER IT', async () => {
  /* `43 §63`, verbatim: *`declared` is the fallback currency, never an override.* The reader did
     the opposite, so a declaration naming EGP relabelled a dollar amount as pounds — wrong money
     in a register, from a declaration that reads correctly, on a row that looks ordinary. */
  assert.deepEqual(await read({ money: { currency: 'EGP' } }, 'You paid USD 99.95 at Acme'), {
    amount: 9_995,
    currency: 'USD',
  });
  assert.deepEqual(await read({ money: { currency: 'EGP' } }, 'Amount 1.234,56 EUR at Acme'), {
    amount: 123_456,
    currency: 'EUR',
  });

  /* THE EXPONENT COMES WITH THE CODE THAT WON, which is the half that turns a relabelling into a
     figure a thousand times wrong: KWD has three decimals. The old reading scaled by the declared
     currency's exponent as well as renaming it, so EGP 450.00 became KWD 450.000. */
  assert.deepEqual(await read({ money: { currency: 'KWD' } }, 'Debited EGP 1,250.00 at Acme'), {
    amount: 125_000,
    currency: 'EGP',
  });
  assert.deepEqual(await read({ money: { currency: 'EGP' } }, 'Debited KWD 1,250 at Acme'), {
    amount: 1_250,
    currency: 'KWD',
  });

  /* AND THE FALLBACK STILL APPLIES WHERE NOTHING IS ADJACENT, which is the whole point of the key.
     `43 §4.3`: *`currency` is the fallback when none is adjacent.* */
  assert.deepEqual(await read({ money: { currency: 'EGP' } }, 'Paid 1,250.00 at Acme'), {
    amount: 125_000,
    currency: 'EGP',
  });
});

test('AND PARENTHESES ARE NEGATIVE, because that is how a statement writes a refund', async () => {
  /* `43 §233`'s grammar: `money = [ "(" ] [ sign ] [ cur ws? ] number [ ws? cur ] [ ")" ]` —
     *parentheses = negative*. The reader had no sign rule at all, so a refund landed as a charge.
     A sign is the one part of an amount no later check catches: both figures are plausible and
     only one of them is the one the bank sent. */
  assert.deepEqual(await read({ money: {} }, '(EGP 75.00) refunded at Acme'), { amount: -7_500, currency: 'EGP' });
  assert.deepEqual(await read({ money: {} }, 'EGP -75.00 refunded at Acme'), { amount: -7_500, currency: 'EGP' });
  assert.deepEqual(await read({ money: {} }, 'EGP 75.00 charged at Acme'), { amount: 7_500, currency: 'EGP' });
});

test('AND THREE LETTERS BESIDE A NUMBER ARE NOT A CURRENCY UNLESS THEY ARE ONE', async () => {
  /* THIS IS WHY THE READER REFUSED TO DO IT AT ALL, and the comment it refused behind said so:
     reading a currency out of a payload without a list of them turns `VAT 500` into five hundred
     of something. The list is `Intl.supportedValuesOf('currency')` — ISO 4217 as the runtime holds
     it, the same place the exponents come from — so `VAT` and `Ref` are not currencies and
     `1234` with nothing beside it is not money. */
  assert.equal(await read({ money: {} }, 'VAT 500 charged at Acme'), null);
  assert.equal(await read({ money: {} }, 'Charged 1234 at Acme'), null);
  assert.equal(await read({ money: {} }, 'Total: 1,234.56 at Acme'), null);
  /* AND A SYMBOL IS NOT READ EITHER, which is a deferral with its reason already written down:
     `43 §710` says a symbol two currencies share resolves to none, and `$` is at least five. The
     table this record builds carries codes and no symbols, so an unambiguous symbol reads nothing
     rather than being guessed — the same answer an ambiguous one would get. */
  assert.equal(await read({ money: {} }, 'E£ 450 spent at Acme'), null);
});
