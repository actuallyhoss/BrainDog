/**
 * `07 §2`'s two caps on extraction, read the way a real record reads them.
 *
 * *Two caps bound extraction — a body of 2,000,000 bytes and 5,000 rows; over either, the arrival is
 * kept raw in `review` with the reason and never extracted.* `43 §5.1` makes the first of them step
 * 1, before the skip list and before a single field is read, and `§9.5` gives both reasons.
 *
 * THE KERNEL HAD NEITHER. A three-megabyte body was scanned by every anchor in the declaration and
 * written; a mapped one parsed as `undefined` and came back as *could not read total, kind, ref*,
 * which sends a person to look at their paths when the problem is the size of the payload.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const CAP = 2_000_000;

const MOVES = {
  id: 'register.moves',
  kind: 'register' as const,
  body: {
    id: 'moves',
    name: 'Moves',
    title: 'merchant',
    fields: [{ id: 'merchant', type: 'text', required: true }],
  } as never,
};

const reader = (over: Record<string, unknown> = {}) => ({
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    extract: { merchant: { text: { between: ['at ', ' on'] } } },
    writes: { register: 'moves', confidence: 'exact' },
    ...over,
  } as never,
});

async function arrives(body: string, over: Record<string, unknown> = {}) {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([MOVES, reader(over)]);
  assert.ok(put.ok, JSON.stringify(put));
  const got = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: 'a1' });
  assert.ok(got.ok, JSON.stringify(got));
  return { state: got.value.state, reason: got.value.reason ?? '', rows: api.kernel.count('moves') };
}

const sms = (pad = 0) => `Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26${'.'.repeat(pad)}`;

test('A BODY OVER THE CAP IS KEPT RAW AND NEVER EXTRACTED', async () => {
  /* `§9.5`: *a 2,000,001-byte body → `needs-review`, `reason` starts `'body too large ('`*. The
     bytes are still stored, which is the point of a cap rather than a rejection: whatever the
     provider sent is in the record for somebody to look at. */
  const over = await arrives(sms(CAP));
  assert.equal(over.state, 'review');
  assert.match(over.reason, /^body too large \(/);
  assert.equal(over.rows, 0);

  /* AND THE BYTE IS THE UNIT, not the character. A body of emoji is twice the characters it looks
     like, and measuring the wrong one lets through a payload the row cannot hold. */
  const emoji = await arrives(`${sms()}${'🙂'.repeat(CAP / 2)}`);
  assert.equal(emoji.state, 'review');
  assert.match(emoji.reason, /^body too large \(/);
});

test('AND AN ORDINARY BODY IS UNTOUCHED BY EITHER OF THEM', async () => {
  const under = await arrives(sms(1000));
  assert.equal(under.state, 'matched');
  assert.equal(under.rows, 1);
});

test('THE CAP IS STEP 1, so it is read before the skip list and before any field', async () => {
  /* `43 §5.1` orders them: cap, skip, rows, fields. A skip list runs a predicate over the body, and
     a body the record has already declined to read is not one to run predicates over. */
  const skip = { skip: [{ when: { field: 'body', contains: 'BEANS' }, reason: 'a test merchant' }] };
  const over = await arrives(sms(CAP), skip);
  assert.equal(over.state, 'review');
  assert.match(over.reason, /^body too large \(/);

  /* AND UNDER THE CAP THE SKIP STILL DECIDES. */
  assert.equal((await arrives(sms(), skip)).state, 'skipped');
});
