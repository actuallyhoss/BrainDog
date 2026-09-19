/**
 * `43 §4.3`'s `date`, read the way a real record reads it.
 *
 * THE ORACLE IS `43 §9.3`'s TABLE, copied out of the document. Every row below is one of its rows
 * or one of `§4.3`'s sentences, over a real arrival through `createRecordApi`.
 *
 * AND THIS ONE IS A GAP AND NOT A DEFECT, which is worth saying plainly because the three
 * iterations before it were defects. `ingest.ts` read four formats — `DD/MM/YY`, `DD/MM/YYYY`,
 * `MM/DD/YYYY`, `YYYY-MM-DD` — where the grammar's tokens are `YYYY YY MM M DD D`, and it never
 * pretended otherwise: `declare.ts` refused the rest with `NOT_IN_THIS_BUILD` and the sentence
 * *the repair is a deploy, not an edit*. The repair was a deploy. This is it, and what it deleted
 * is the second date grammar rather than the refusal's honesty.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const DUES = {
  id: 'register.dues',
  kind: 'register' as const,
  body: {
    id: 'dues',
    name: 'Dues',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day' },
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
    extract: { what: { text: { before: ' at' } }, due: form },
    writes: { register: 'dues', confidence: 'exact', key: ['what'] },
    on_conflict: 'skip',
  } as never,
});

/** One message through one declaration, and the day it wrote. */
async function reads(form: Record<string, unknown>, body: string): Promise<unknown> {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([DUES, reader(form)]);
  assert.ok(put.ok, JSON.stringify(put));
  const out = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: 'a1' });
  assert.ok(out.ok, JSON.stringify(out));
  return api.kernel.get('dues#1')?.fields['due'] ?? null;
}

const on = (format: string) => ({ date: { format } });

test("43 §9.3'S TABLE, off a real record — including the three formats that could not install", async () => {
  /* THE FOUR THIS BUILD ALWAYS READ. */
  assert.equal(await reads(on('DD/MM/YY'), 'paid 29/08/26 at Acme'), '2026-08-29');
  assert.equal(await reads(on('DD/MM/YYYY'), 'paid 29/08/2026 at Acme'), '2026-08-29');
  assert.equal(await reads(on('MM/DD/YYYY'), 'paid 08/29/2026 at Acme'), '2026-08-29');
  assert.equal(await reads(on('YYYY-MM-DD'), 'paid 2026-08-29 at Acme'), '2026-08-29');

  /* AND THE THREE IT REFUSED, which are three rows of `§9.3` and were `NOT_IN_THIS_BUILD` until
     the reader was reached. Single-digit tokens, a dot separator, and no separator at all. */
  assert.equal(await reads(on('D/M/YY'), 'paid 9/8/26 at Acme'), '2026-08-09');
  assert.equal(await reads(on('DD.MM.YYYY'), 'paid 29.08.2026 at Acme'), '2026-08-29');
  assert.equal(await reads(on('DDMMYYYY'), 'paid 29082026 at Acme'), '2026-08-29');
});

test('A DATE IS NEVER GUESSED, and the shape is never the check', async () => {
  /* `03/04/26` IS TWO DIFFERENT DAYS IN TWO COUNTRIES, so the format is part of the pattern. */
  assert.equal(await reads(on('DD/MM/YY'), 'paid 03/04/26 at Acme'), '2026-04-03');
  assert.equal(await reads(on('MM/DD/YYYY'), 'paid 03/04/2026 at Acme'), '2026-03-04');

  /* AND `31/02/26` MATCHES THE PATTERN AND IS NOT A DAY — `§9.3`. A row dated the thirty-first of
     February sorts between January and March for ever. */
  assert.equal(await reads(on('DD/MM/YY'), 'paid 31/02/26 at Acme'), null);
  assert.equal(await reads(on('DD/MM/YYYY'), 'paid 29/02/2026 at Acme'), null, '2026 is not a leap year');
  assert.equal(await reads(on('DD/MM/YYYY'), 'paid 29/02/2024 at Acme'), '2024-02-29');

  /* AND IT IS BOUNDED BY NON-DIGITS AT BOTH ENDS, which is the row that keeps a card number out
     of a date field. */
  assert.equal(await reads(on('DD/MM/YY'), 'paid 129/08/26 at Acme'), null, 'preceded by a digit');
  assert.equal(await reads(on('DD/MM/YY'), 'paid 29/08/261 at Acme'), null, 'followed by a digit');
  assert.equal(await reads(on('DD/MM/YY'), 'paid 2026-08-29 at Acme'), null, 'separator mismatch');
});

test('AND EVERY DATE IN THE SLICE IS A CANDIDATE, so `nth` reaches the second one', async () => {
  /* `43 §9.3`'s own row: `1/1/26 and 2/2/26` under `D/M/YY` as `nth: 2` is `2026-02-02`. This
     runtime answered one day per slice, so the second date of a one-slice message was unreachable
     however it was anchored — the same ceiling money had before iteration sixteen. */
  const two = 'paid 1/1/26 and 2/2/26 at Acme';
  assert.equal(await reads({ nth: { n: 2, of: on('D/M/YY') } }, two), '2026-02-02');
  assert.equal(await reads({ nth: { n: 1, of: on('D/M/YY') } }, two), '2026-01-01');
  assert.equal(await reads({ nth: { n: 3, of: on('D/M/YY') } }, two), null);
});
