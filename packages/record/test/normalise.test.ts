/**
 * `43 §5.1` step 4 over a real arrival, and the attack it is there to stop.
 *
 * NORMALISATION IS NOT TIDYING. `§8` states the case plainly: a zero-width character is invisible to
 * the person reading the arrival and visible to `indexOf`, so a provider — or somebody who can write
 * into one — puts `U+200B` inside `EGP` and the amount walks past an anchor, past an `enum` literal
 * and past a `match:` while the message still reads correctly on screen. The record then files an
 * arrival that a person has read with their own eyes as unreadable, or worse, reads the NEXT amount
 * in the message instead.
 *
 * `arrive` DID NOT NORMALISE AT ALL, and read `${subject}\n${body}` where step 3 says *one row, the
 * body*. Both are fixed here, the first by injection — the four zero-width code points and the
 * sixteen space-like ones are a character set the kernel has no business holding (`§14`).
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

const READER = {
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    extract: { merchant: { text: { between: ['at ', ' on'] } }, amount: { money: { after: 'debited' } } },
    writes: { register: 'moves', confidence: 'exact' },
  } as never,
};

async function arrives(body: string, subject?: string) {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([MOVES, READER]);
  assert.ok(put.ok, JSON.stringify(put));
  const headers: Record<string, string> = { From: 'alerts@bank.example' };
  if (subject !== undefined) headers['Subject'] = subject;
  const got = api.kernel.arrive({ channel: 'email', headers, body, sha256: 'a1' });
  assert.ok(got.ok, JSON.stringify(got));
  return { state: got.value.state, row: api.kernel.get('moves#1')?.fields ?? null };
}

const PLAIN = 'Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26';

test('A ZERO-WIDTH CHARACTER CANNOT HIDE AN AMOUNT FROM THE READER, `43 §8`', async () => {
  const seen = await arrives(PLAIN);
  assert.equal(seen.state, 'matched');
  assert.deepEqual(seen.row?.amount, { amount: 125_000, currency: 'EGP' });

  /* THE SAME MESSAGE, ONE INVISIBLE CHARACTER INSIDE THE CODE. On screen it is the message above,
     character for character. Unnormalised it is a different string to every scanner in the
     pipeline, and the amount is the one thing a ledger cannot get wrong. */
  const hidden = await arrives(PLAIN.replace('EGP', 'EG​P'));
  assert.deepEqual(hidden.row?.amount, { amount: 125_000, currency: 'EGP' }, 'a zero-width space inside EGP');

  /* AND THE OTHER THREE OF THE SET, which are the ones a copied-and-pasted payload carries. */
  assert.deepEqual((await arrives(PLAIN.replace('EGP', 'E‌GP'))).row?.amount, { amount: 125_000, currency: 'EGP' });
  assert.deepEqual((await arrives(PLAIN.replace('EGP', 'EG‍P'))).row?.amount, { amount: 125_000, currency: 'EGP' });
  assert.deepEqual((await arrives(`﻿${PLAIN}`)).row?.amount, { amount: 125_000, currency: 'EGP' });
});

test('AND THE SPACE-LIKE CHARACTERS ARE ONE SPACE, so an anchor written with a space finds one', async () => {
  /* `§5.1` step 4: tab, NBSP and the Unicode space separators to a space; CR and CRLF to LF; runs
     of spaces collapsed; each line trimmed. A bank that sends its alerts with a non-breaking space
     after the currency code is not an edge case, it is most of them. */
  const nbsp = await arrives(PLAIN.replace(/ at /, ' at '));
  assert.equal(nbsp.row?.merchant, 'BEANS COFFEE');

  const crlf = await arrives(`Card 1234 debited EGP 1,250.00\r\nat  BEANS\tCOFFEE  on 29/08/26`);
  assert.equal(crlf.row?.merchant, 'BEANS COFFEE');
});

test('THE ROW IS THE BODY AND THE SUBJECT IS NOT PART OF IT, `43 §5.1` step 3', async () => {
  /* *`text` → one row, the body.* The subject was prepended to the body here, so a bank whose
     subject line repeats the amount had two amounts in the text and the reader took the subject's.
     The subject is still one of `34 §1.9`'s seven and is still matched on, which is the difference
     between deciding whether a message is ours and reading a value out of it. */
  const both = await arrives(PLAIN, 'Debit alert: EGP 9,999.00');
  assert.deepEqual(both.row?.amount, { amount: 125_000, currency: 'EGP' });
  assert.equal(both.row?.merchant, 'BEANS COFFEE');
});
