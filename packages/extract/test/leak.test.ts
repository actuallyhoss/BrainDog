import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDate } from '../src/date.ts';
import { extract } from '../src/pipeline.ts';

const ctx: any = {
  currencies: { EGP: { exponent: 2 }, USD: { exponent: 2 } },
  lookup: () => [], exponent: () => 2,
  day: (t: string, f: string) => parseDate(t, f) ?? null,
  now: Date.UTC(2026, 8, 19, 12), tz: 'UTC',
};
const raw = (body: string, over: any = {}) =>
  ({ id: 'r1', ts: '2026-09-19T12:00:00Z', channel: 'email', body, ...over });

/* Every body carries the same leakable material, so a leak in any case is the same words. */
const PII = 'Ahmed Hassan · acct 1234567890 · ref XYZ-SECRET · ahmed@example.com';
const T = (extra: string) => `debited EGP 9,999.99 at BEANS on 29/08/26 ${PII} ${extra}`;

const D1: any = { id: 'hsbc', writes: { register: 'txn' }, extract: {
  amount: { money: { after: 'debited' } },
  date: { date: { format: 'DD/MM/YY' } },
  merchant: { between: ['at ', ' on'] },
  kind: { enum: { map: { debited: 'debit', credited: 'credit' } } } } };

const json = (rows: unknown) => JSON.stringify({ note: PII, data: rows });
const MAP: any = { id: 'poll', writes: { register: 'txn' },
  fetch: { read: { format: 'json', rows: 'data' } },
  map: { n: { path: 'n', type: 'int' }, who: { path: 'who', type: 'text' } } };

const cases: [string, any, any][] = [
  ['all exact', D1, raw(T(''))],
  ['merchant missing', { ...D1, extract: { ...D1.extract, merchant: { between: ['zz ', ' zz'] } } }, raw(T(''))],
  ['enum ambiguous', D1, raw(`debited credited EGP 9,999.99 at BEANS on 29/08/26 ${PII}`)],
  ['ceiling', { ...D1, writes: { register: 'txn', confidence: 'needs-review' } }, raw(T(''))],
  ['route hit', { ...D1, writes: { register: { by: ['kind', 'amount.currency'],
      to: [{ when: ['debit', 'EGP'], register: 'txn_egp' }] } } }, raw(T(''))],
  ['route miss', { ...D1, writes: { register: { by: ['kind', 'amount.currency'],
      to: [{ when: ['debit', 'USD'], register: 'txn_usd' }] } } }, raw(T(''))],
  ['route miss and a missing field', { ...D1,
      extract: { ...D1.extract, merchant: { between: ['zz ', ' zz'] } },
      writes: { register: { by: ['amount.currency'], to: [{ when: ['USD'], register: 'u' }] } } }, raw(T(''))],
  ['skipped', { ...D1, skip: [{ when: { field: 'body', contains: 'REFUND' }, reason: 'refund' }] },
      raw(`REFUND ${T('')}`)],
  ['body too large', D1, raw(`${PII} ${'x'.repeat(2_000_001)}`)],
  ['unparseable', MAP, raw(`{ ${PII}`)],
  ['rows over cap', MAP, raw(json(Array.from({ length: 12 }, (_, i) => ({ n: i, who: PII }))))],
  ['one bad row of ten', MAP, raw(json(Array.from({ length: 10 },
      (_, i) => (i === 4 ? { n: 'abc', who: PII } : { n: i, who: PII }))))],
  ['every row bad', MAP, raw(json(Array.from({ length: 3 }, () => ({ n: {}, who: PII }))))],
  ['zero rows', MAP, raw(json([]))],
];

/** Field ids, outcome words, the fixed vocabulary, and the two ids. Everything else must be absent. */
const allowed = [
  'amount', 'date', 'merchant', 'kind', 'n', 'who', 'currency',
  'exact', 'proposed', 'needs-review', 'chosen', 'defaulted', 'missing', 'invalid', 'ambiguous',
  'row', 'rows', 'route miss on', 'more', 'body too large', 'bytes', 'the cap is',
  'rows over cap', 'body unparseable as', 'json', 'csv', 'xml', 'html', 'text', 'refund',
  'hsbc', 'poll', 'r1', 'txn', 'txn_egp', 'txn_usd', 'ingest_id', 'raw_id', 'confidence',
  'fields', 'wrote', 'skipped', 'register',
].join(' ');

/**
 * THE LEAVES, NOT THE SERIALISATION. `43 §9.5` words this as four-character substrings of
 * `JSON.stringify(receipt)`, and taken at the letter it fires on `"e":"` whenever the body is itself JSON,
 * because that is punctuation both sides happen to share. The hazard was never the punctuation: it is a
 * value out of a stranger's message reaching a sentence a person reads. So the check walks the receipt and
 * tests every key and every string leaf, which is the same rule with the artefact removed and is strictly
 * harder to pass than the serialised form on everything that matters.
 */
function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'number' || typeof value === 'boolean') out.push(String(value));
  else if (Array.isArray(value)) for (const v of value) leaves(v, out);
  else if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) { out.push(k); leaves(v, out); }
  return out;
}

for (const [name, decl, arrival] of cases)
  test(`no value of the body reaches the sentence: ${name}`, () => {
    const got = extract(decl, arrival, ctx);
    const parts = [got.reason ?? '', got.skipped ?? '', ...leaves(got.receipt ?? {})];
    const body = arrival.body;
    for (const part of parts)
      for (let i = 0; i + 4 <= part.length; i++) {
        const w = part.slice(i, i + 4);
        if (w.trim().length < 4 || !body.includes(w)) continue;
        assert.ok(allowed.includes(w), `"${w}" is in the body and is not a field id: ${parts.join(' | ')}`);
      }
  });

test('the check itself has teeth: a planted value is caught', () => {
  /**
   * A GREEN LEAK TEST IS WORTHLESS IF IT CANNOT GO RED. The rest of this file asserts an absence, which is
   * the kind of test that passes just as happily when the checker is broken. So the checker is run once
   * against a receipt that does leak, and is required to object.
   */
  const body = 'Ahmed Hassan · acct 1234567890';
  const planted = { ingest_id: 'hsbc', fields: { who: 'Ahmed Hassan' } };
  const caught: string[] = [];
  for (const part of leaves(planted))
    for (let i = 0; i + 4 <= part.length; i++) {
      const w = part.slice(i, i + 4);
      if (w.trim().length < 4 || !body.includes(w)) continue;
      if (!allowed.includes(w)) caught.push(w);
    }
  assert.ok(caught.length > 0, 'the checker did not object to a receipt carrying a name out of the body');
});
