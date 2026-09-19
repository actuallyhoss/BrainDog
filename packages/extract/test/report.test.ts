import assert from 'node:assert/strict';
import { test } from 'node:test';

import { testAgainst } from '../src/report.ts';
import { parseDate } from '../src/date.ts';

const ctx: any = {
  currencies: { EGP: { exponent: 2, symbol: 'E£' }, USD: { exponent: 2, symbol: '$' } },
  lookup: () => [],
  exponent: (c: string) => 2,
  day: (t: string, f: string) => parseDate(t, f) ?? null,
  now: Date.UTC(2026, 8, 19, 12),
  tz: 'UTC',
};

const raw = (body: string, headers?: Record<string, string>): any => ({
  id: 'r', ts: '2026-09-19T12:00:00Z', channel: 'email', body, ...(headers ? { headers } : {}),
});

const D1: any = {
  id: 'hsbc',
  extract: {
    amount: { money: { after: 'debited' } },
    merchant: { between: ['at ', ' on'] },
  },
  writes: { register: 'txn' },
  skip: [{ when: { field: 'body', contains: 'REFUND' }, reason: 'refund' }],
};

const M1 = raw('debited EGP 1,250.00 at BEANS on 29/08/26');
const M2 = raw('debited EGP 1,250.00 to ACME on 29/08/26');
const M3 = raw('REFUND debited EGP 1,250.00 at BEANS on 29/08/26');

test('43 §9.5: three samples, three matched, one skipped, and the per-field counts', () => {
  const r = testAgainst(D1, [M1, M2, M3], ctx);
  assert.equal(r.samples, 3);
  assert.equal(r.matched, 3);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.fields.merchant, { won: 1, lost: 1 });
  assert.deepEqual(r.fields.amount, { won: 2, lost: 0 });
});

test('a sample lacking the matched header is matched: false, not an error', () => {
  const withMatch = { ...D1, match: { field: 'from', contains: 'bank' } };
  const r = testAgainst(withMatch, [raw('debited EGP 5.00 at X on 29/08/26', { from: 'a@bank.com' }), M1], ctx);
  assert.equal(r.samples, 2);
  assert.equal(r.matched, 1);
});

test('it writes nothing and says nothing about quality', () => {
  const r = testAgainst(D1, [M1], ctx);
  assert.deepEqual(Object.keys(r).sort(), ['fields', 'matched', 'rows', 'samples', 'skipped']);
  for (const k of ['score', 'confidence', 'grade', 'percent']) assert.equal(k in r, false);
});

test('no samples is zeros, not a division', () => {
  assert.deepEqual(testAgainst(D1, [], ctx), { samples: 0, matched: 0, skipped: 0, rows: 0, fields: {} });
});

test('a defaulted field is a win, because the pattern did what its author said', () => {
  const D: any = { id: 'd', writes: { register: 'txn' },
    extract: { kind: { default: { value: 'debit', of: { enum: { map: { credited: 'credit' } } } } } } };
  assert.deepEqual(testAgainst(D, [M1], ctx).fields.kind, { won: 1, lost: 0 });
});

test('a many-row sample tallies per row, so one bad column cannot read as one bad sample', () => {
  const body = JSON.stringify({ data: [{ n: 1 }, { n: 2 }, { n: 'x' }, {}] });
  const D: any = { id: 'p', writes: { register: 'txn' },
    fetch: { read: { format: 'json', rows: 'data' } }, map: { n: { path: 'n', type: 'int' } } };
  const r = testAgainst(D, [raw(body)], ctx);
  assert.equal(r.samples, 1);
  assert.equal(r.rows, 4);
  assert.deepEqual(r.fields.n, { won: 2, lost: 2 });
});
