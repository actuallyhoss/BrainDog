/**
 * A page of a stranger's JSON, read into rows.
 *
 * WHAT IS ASSERTED IS MOSTLY THAT A BAD ANSWER STILL PRODUCES AN ANSWER. This runs on bytes a
 * connector has already paid for, so the failure that matters is not a wrong number — the register
 * catches those — it is an exception that throws the page away and makes the ladder fetch it again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractPull, type ExtractDecl } from '../src/index.ts';
import { day, exponentOf } from '../src/ingest.ts';

const TS = '2026-09-19T09:00:00.000Z';
const deps = {
  schemaOf: () => ({ fields: { paid: { type: 'money' }, at: { type: 'instant' }, ref: { type: 'text' } } }) as never,
  exponent: exponentOf,
  day,
};

const DECL: ExtractDecl = {
  ingest: 'stripe-charges',
  fetch: { read: { rows: 'data' } },
  map: {
    ref: { path: 'id', type: 'text' },
    paid: { path: ['amount', 'currency'], type: 'money', minor: true },
    at: { path: 'created', type: 'instant', from: 'epoch_s' },
  },
  writes: { register: 'charges' },
};

const body = (rows: unknown[]): { ts: string; body: string } => ({ ts: TS, body: JSON.stringify({ data: rows }) });
const CHARGE = { id: 'ch_1', amount: 4200, currency: 'egp', created: 1_758_270_000 };

test('a page of ordinary rows reads every field and nothing is proposed', () => {
  const out = extractPull(deps, DECL, body([CHARGE, { ...CHARGE, id: 'ch_2' }]));
  assert.equal(out.confidence, 'exact');
  assert.equal(out.rows.length, 2);
  /* MINOR UNITS, because that is what the record stores: 4200 piastres, not EGP 4,200. */
  assert.deepEqual(out.rows[0]?.fields['paid'], { amount: 4200, currency: 'EGP' });
  assert.deepEqual(out.rows[0]?.outcome, {});
});

test('one unreadable row is the only one downgraded, and the page takes its confidence', () => {
  const out = extractPull(deps, DECL, body([CHARGE, { id: 'ch_2', currency: 'egp' }]));

  assert.equal(out.rows[0]?.confidence, 'exact', 'a good row was downgraded by a bad one beside it');
  assert.equal(out.rows[1]?.confidence, 'needs-review');
  /* THE NAMES ARE WHAT A PERSON READS, so the row says which fields it could not read. */
  assert.deepEqual(out.rows[1]?.outcome, { paid: 'missing', at: 'missing' });
  assert.equal(out.confidence, 'needs-review', 'a page with a guess in it reported as a clean page');
});

test("a declaration's ceiling caps a row that read cleanly", () => {
  const out = extractPull(deps, { ...DECL, writes: { register: 'charges', confidence: 'proposed' } }, body([CHARGE]));
  assert.equal(out.rows[0]?.confidence, 'proposed');
});

test('an answer that is not JSON is a reason and never an exception', () => {
  const out = extractPull(deps, DECL, { ts: TS, body: '<html>maintenance</html>' });
  assert.deepEqual(out.rows, []);
  assert.match(out.reason ?? '', /not JSON/);
});

test('an empty window is an ordinary answer and not something to look at', () => {
  const out = extractPull(deps, DECL, body([]));
  assert.deepEqual(out.rows, []);
  assert.equal(out.confidence, 'exact');
  assert.equal(out.reason, undefined);
});

test("the run's remaining budget is applied before any field is read", () => {
  const out = extractPull(deps, DECL, body([CHARGE, CHARGE, CHARGE]), { maxRows: 2 });
  assert.equal(out.rows.length, 2);
});
