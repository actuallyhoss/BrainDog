import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDate } from '../src/date.ts';
import { extract, type Declaration, type ExtractCtx } from '../src/pipeline.ts';
import type { RawArrival } from '../src/arrival.ts';

const ctx: ExtractCtx = {
  currencies: { EGP: { exponent: 2, symbol: 'E£' }, JPY: { exponent: 0 }, USD: { exponent: 2, symbol: '$' } },
  lookup: () => [],
  exponent: (c) => ({ EGP: 2, JPY: 0, USD: 2 })[c] ?? 2,
  day: (text, format) => parseDate(text, format) ?? null,
  now: Date.UTC(2026, 8, 19, 12),
  tz: 'UTC',
};

const raw = (body: string, over: Partial<RawArrival> = {}): RawArrival => ({
  id: 'r1',
  ts: '2026-09-19T12:00:00Z',
  channel: 'email',
  body,
  ...over,
});

const text = (extractDecl: NonNullable<Declaration['extract']>, over: Partial<Declaration> = {}): Declaration => ({
  id: 'hsbc-sms',
  extract: extractDecl,
  writes: { register: 'txn' },
  ...over,
});

/* ── step 1, the cap ─────────────────────────────────────────────────────── */

test('the cap measures encoded bytes, not characters', () => {
  /**
   * A BODY OF EMOJI IS FOUR BYTES A CHARACTER. `25 §7` rule 7 is a BLOB ceiling in bytes, so measuring
   * `body.length` would admit a body four times the size the row can hold, and it would fail later and
   * somewhere else. Half a million emoji is two million bytes exactly, which is at the cap and not over it.
   */
  const atCap = '\u{1F600}'.repeat(500_000);
  assert.equal(new TextEncoder().encode(atCap).length, 2_000_000);
  assert.equal(extract(text({}), raw(atCap), ctx).reason, undefined);

  const over = atCap + '\u{1F600}';
  const got = extract(text({}), raw(over), ctx);
  assert.equal(got.confidence, 'needs-review');
  assert.equal(got.reason, 'body too large (2000004 bytes; the cap is 2000000)');
  assert.deepEqual(got.rows, []);
  assert.equal(got.receipt, undefined);
});

/* ── step 2, the skip ────────────────────────────────────────────────────── */

test('a skip is exact, has no rows and no receipt', () => {
  const decl = text({ amount: { money: {} } }, { skip: [{ when: { field: 'body', contains: 'REFUND' }, reason: 'refund' }] });
  const got = extract(decl, raw('REFUND of EGP 10.00'), ctx);
  assert.deepEqual(got, { rows: [], confidence: 'exact', skipped: 'refund' });
});

test('a skip beats everything after it, including a field that would not read', () => {
  const decl = text({ amount: { money: {} } }, { skip: [{ when: { field: 'channel', is: 'email' }, reason: 'email' }] });
  assert.equal(extract(decl, raw('nothing readable here'), ctx).skipped, 'email');
});

/* ── step 3, rows in ─────────────────────────────────────────────────────── */

test('a body that will not parse is needs-review, naming the format', () => {
  const decl: Declaration = { id: 'x', writes: { register: 'txn' }, fetch: { read: { format: 'json' } }, map: {} };
  const got = extract(decl, raw('{oops'), ctx);
  assert.equal(got.reason, 'body unparseable as json');
  assert.equal(got.confidence, 'needs-review');
});

test('rows over the cap are refused whole, never truncated', () => {
  const body = JSON.stringify({ data: Array.from({ length: 5 }, (_, i) => ({ n: i })) });
  const decl: Declaration = {
    id: 'x',
    writes: { register: 'txn' },
    fetch: { read: { format: 'json', rows: 'data' } },
    map: { n: { path: 'n', type: 'int' } },
  };
  const got = extract(decl, raw(body), { ...ctx, maxRows: 4 });
  assert.equal(got.reason, 'rows over cap (5; the cap is 4)');
  assert.deepEqual(got.rows, []);
  /* `07 §2`: nothing dropped. Four of the five would be the silent wrong answer. */
  assert.equal(extract(decl, raw(body), { ...ctx, maxRows: 5 }).rows.length, 5);
});

/* ── steps 4 and 5, the fields ───────────────────────────────────────────── */

test('a text row reads its fields in declared order', () => {
  const decl = text({
    amount: { money: { after: 'debited' } },
    day: { date: { after: 'on', format: 'DD/MM/YY' } },
  });
  const got = extract(decl, raw('Your account was debited EGP 1,250.00 on 29/08/26'), ctx);
  assert.equal(got.rows.length, 1);
  assert.deepEqual(got.rows[0]!.fields.amount, { amount: 125000, currency: 'EGP' });
  assert.equal(got.rows[0]!.fields.day, '2026-08-29');
  assert.equal(got.confidence, 'exact');
});

test('every declared field is required, so one that is not there is needs-review', () => {
  const decl = text({ amount: { money: {} }, reference: { text: { after: 'ref' } } });
  const got = extract(decl, raw('debited EGP 1,250.00'), ctx);
  assert.equal(got.rows[0]!.outcome.reference, 'missing');
  assert.equal(got.confidence, 'needs-review');
});

test('a default: is how a field is optional, and it makes the row proposed', () => {
  const decl = text({ amount: { money: {} }, kind: { default: { value: 'debit', of: { enum: { map: { credited: 'credit' } } } } } });
  const got = extract(decl, raw('debited EGP 1,250.00'), ctx);
  assert.equal(got.rows[0]!.fields.kind, 'debit');
  assert.equal(got.rows[0]!.outcome.kind, 'defaulted');
  assert.equal(got.confidence, 'proposed');
});

test('a structured row goes through map:, and an unreadable value is invalid not missing', () => {
  const body = JSON.stringify({ data: [{ amt: 1250, cur: 'EGP', when: 'last Tuesday' }] });
  const decl: Declaration = {
    id: 'x',
    writes: { register: 'txn' },
    fetch: { read: { format: 'json', rows: 'data' } },
    map: {
      amount: { path: ['amt', 'cur'], type: 'money', minor: true },
      at: { path: 'when', type: 'instant' },
      note: { path: 'nope', type: 'text' },
    },
  };
  const got = extract(decl, raw(body), ctx);
  assert.deepEqual(got.rows[0]!.fields.amount, { amount: 1250, currency: 'EGP' });
  assert.equal(got.rows[0]!.outcome.at, 'invalid');
  assert.equal(got.rows[0]!.outcome.note, 'missing');
  /* A refused field is ABSENT and never null (`§4.1`), because null reads as a value downstream. */
  assert.equal(Object.hasOwn(got.rows[0]!.fields, 'at'), false);
});

/* ── step 6, routing ─────────────────────────────────────────────────────── */

test('a named register goes on every row', () => {
  const got = extract(text({ amount: { money: {} } }), raw('debited EGP 1,250.00'), ctx);
  assert.equal(got.rows[0]!.register, 'txn');
});

test('a route matches on its by tuple, currency included', () => {
  const decl = text(
    { amount: { money: {} }, kind: { enum: { map: { debited: 'debit', credited: 'credit' } } } },
    {
      writes: {
        register: {
          by: ['kind', 'amount.currency'],
          to: [
            { when: ['debit', 'USD'], register: 'txn_usd' },
            { when: ['debit', 'EGP'], register: 'txn_egp' },
          ],
        },
      },
    },
  );
  assert.equal(extract(decl, raw('debited EGP 1,250.00'), ctx).rows[0]!.register, 'txn_egp');
});

test('a route miss is needs-review and names the by ids, never their values', () => {
  const decl = text(
    { amount: { money: {} }, kind: { enum: { map: { debited: 'debit' } } } },
    { writes: { register: { by: ['kind', 'amount.currency'], to: [{ when: ['debit', 'USD'], register: 'txn_usd' }] } } },
  );
  const got = extract(decl, raw('debited EGP 1,250.00'), ctx);
  assert.equal(got.rows[0]!.register, undefined);
  assert.equal(got.confidence, 'needs-review');
  assert.equal(got.reason, 'needs-review: route miss on kind, amount.currency');
  assert.equal(got.reason!.includes('EGP'), false);
});

/* ── steps 7 and 8, confidence ───────────────────────────────────────────── */

test('the arrival takes the worst of its rows', () => {
  const body = JSON.stringify({ data: [{ n: 1 }, { n: 'x' }] });
  const decl: Declaration = {
    id: 'x',
    writes: { register: 'txn' },
    fetch: { read: { format: 'json', rows: 'data' } },
    map: { n: { path: 'n', type: 'int' } },
  };
  const got = extract(decl, raw(body), ctx);
  assert.equal(got.rows[0]!.confidence, 'exact');
  assert.equal(got.rows[1]!.confidence, 'needs-review');
  assert.equal(got.confidence, 'needs-review');
});

test('writes.confidence is a ceiling and only ever lowers', () => {
  const decl = text({ amount: { money: {} } }, { writes: { register: 'txn', confidence: 'proposed' } });
  assert.equal(extract(decl, raw('debited EGP 1,250.00'), ctx).confidence, 'proposed');

  const strict = text({ amount: { money: {} } }, { writes: { register: 'txn', confidence: 'exact' } });
  assert.equal(extract(strict, raw('nothing here'), ctx).confidence, 'needs-review');
});

test('zero rows from a parseable body is exact, even under a ceiling', () => {
  /**
   * AN EMPTY PAGE IS NOT A REVIEW. `§5.1` step 8 says both that the ceiling lowers the arrival and that
   * zero rows is `exact`, and with `confidence: proposed` those disagree; the explicit sentence wins,
   * because a poll that found nothing produced no judgement to be unsure about. Getting this wrong would
   * put every quiet Tuesday in front of a person.
   */
  const decl: Declaration = {
    id: 'x',
    writes: { register: 'txn', confidence: 'proposed' },
    fetch: { read: { format: 'json', rows: 'data' } },
    map: { n: { path: 'n', type: 'int' } },
  };
  const got = extract(decl, raw('{"data":[]}'), ctx);
  assert.deepEqual(got.rows, []);
  assert.equal(got.confidence, 'exact');
  assert.equal(got.reason, undefined);
});

/* ── step 9, the receipt and the reason ──────────────────────────────────── */

test('the receipt carries the worst outcome per field across rows', () => {
  const body = JSON.stringify({ data: [{ n: 1 }, { n: 'x' }, {}] });
  const decl: Declaration = {
    id: 'poller',
    writes: { register: 'txn' },
    fetch: { read: { format: 'json', rows: 'data' } },
    map: { n: { path: 'n', type: 'int' } },
  };
  const got = extract(decl, raw(body), ctx);
  assert.equal(got.receipt!.ingest_id, 'poller');
  assert.equal(got.receipt!.raw_id, 'r1');
  assert.equal(got.receipt!.rows, 3);
  assert.deepEqual(got.receipt!.wrote, []);
  /* `invalid` outranks `missing` on step 9's severity, which is why the two had to stop being one word. */
  assert.equal(got.receipt!.fields.n, 'invalid');
});

test('one row is named without an index, and many rows with one', () => {
  const one = extract(text({ amount: { money: {} } }), raw('nothing'), ctx);
  assert.equal(one.reason, 'needs-review: amount missing');

  const body = JSON.stringify({ data: [{ n: 1 }, {}] });
  const many = extract(
    { id: 'x', writes: { register: 'txn' }, fetch: { read: { format: 'json', rows: 'data' } }, map: { n: { path: 'n', type: 'int' } } },
    raw(body),
    ctx,
  );
  assert.equal(many.reason, 'needs-review: row 1 n missing');
});

test('a route miss and a field in review are both in the reason, not one or the other', () => {
  /**
   * THE FIRST READING LOST ONE OF THEM. A person who is told only "reference missing" fixes it, and the
   * arrival comes back to review with a sentence that was true the first time. Two round trips for one
   * arrival, and the second one looks like a new fault.
   */
  const decl = text(
    { amount: { money: {} }, reference: { text: { after: 'no such anchor' } } },
    { writes: { register: { by: ['amount.currency'], to: [{ when: ['USD'], register: 'txn_usd' }] } } },
  );
  const got = extract(decl, raw('debited EGP 1,250.00'), ctx);
  assert.equal(got.reason, 'needs-review: reference missing; route miss on amount.currency');
});

test('a reason shows eight items and then a count', () => {
  const body = JSON.stringify({ data: Array.from({ length: 12 }, () => ({})) });
  const got = extract(
    { id: 'x', writes: { register: 'txn' }, fetch: { read: { format: 'json', rows: 'data' } }, map: { n: { path: 'n', type: 'int' } } },
    raw(body),
    ctx,
  );
  assert.equal(got.reason!.split(';').length, 9);
  assert.equal(got.reason!.endsWith('; +4 more'), true);
});

test('A REASON CARRIES IDS, OUTCOMES AND COUNTS, AND NEVER A VALUE', () => {
  /**
   * THIS IS THE DIFFERENCE BETWEEN A REASON AND A LEAK. `inbox_raw.reason` is shown on a review screen and
   * pasted into support threads, and the arrival it describes is somebody's bank message. So the test is not
   * that the wording is right, it is that nothing out of the body reaches the sentence.
   *
   * THE FIELDS HAVE TO READ FOR THIS TO BE A TEST. An arrival where everything is `missing` holds no value
   * to leak, so it would pass against code that printed every one. Here the amount and the name are both
   * read, the route then misses on the currency it read, and one field is absent to put the whole thing in
   * review; every part of the sentence has something it could give away.
   */
  const secret = 'Ahmed Hassan paid EGP 9,999.99 from account 1234567890 ref XYZ-SECRET';
  const decl = text(
    {
      amount: { money: {} },
      who: { text: { before: 'paid' } },
      reference: { text: { after: 'no such anchor' } },
    },
    { writes: { register: { by: ['amount.currency', 'who'], to: [{ when: ['USD', 'someone else'], register: 'txn' }] } } },
  );
  const got = extract(decl, raw(secret, { headers: { from: 'ahmed@example.com', subject: 'Payment 9,999.99' } }), ctx);

  /* The preconditions, so this cannot quietly become the all-missing test again. */
  assert.deepEqual(got.rows[0]!.fields.amount, { amount: 999999, currency: 'EGP' });
  assert.equal(got.rows[0]!.fields.who, 'Ahmed Hassan');
  assert.equal(got.confidence, 'needs-review');

  const sentence = `${got.reason ?? ''} ${JSON.stringify(got.receipt)}`;
  for (const leak of ['Ahmed', 'Hassan', '9,999', '999999', '1234567890', 'XYZ-SECRET', 'example.com', 'EGP'])
    assert.equal(sentence.includes(leak), false, `the reason leaked ${leak}: ${sentence}`);
  /* What it may say: the ids, the outcome words and the counts. */
  assert.equal(sentence.includes('reference'), true);
  assert.equal(sentence.includes('missing'), true);
});

test('a reason is written only for needs-review', () => {
  const got = extract(text({ amount: { money: {} } }), raw('debited EGP 1,250.00'), ctx);
  assert.equal(got.confidence, 'exact');
  assert.equal(got.reason, undefined);
  assert.equal(got.receipt!.confidence, 'exact');
});
