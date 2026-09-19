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

/* ── The four formats this package cannot read itself ────────────────────────────────────────── */

const CSV = `id,amount,currency,created
ch_1,4200,egp,1758270000
ch_2,900,egp,1758270060
`;

const CSV_DECL: ExtractDecl = { ...DECL, fetch: { read: { format: 'csv' } } };

test('A CSV PAGE IS READ THROUGH THE INJECTED READER, because rank 7 cannot import rank 9', () => {
  /* `42 §4.7` has always given `fetch.read` a `format`, and this function parsed every body as
     JSON — so `csv` reached a person as "was answered with something that is not JSON". The reader
     lives in `@braindog/extract`, which this package may not import (`31 §2`), so it arrives the
     way the currency exponents do: as a dependency the host supplies. */
  const rows = (body: string): unknown[] => {
    const [head, ...lines] = body.trim().split('\n');
    const keys = (head ?? '').split(',');
    return lines.map((line) => Object.fromEntries(line.split(',').map((cell, i) => [keys[i] ?? '', cell])));
  };

  const out = extractPull({ ...deps, rows }, CSV_DECL, { ts: TS, body: CSV });
  assert.equal(out.confidence, 'exact');
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows[0]?.fields['paid'], { amount: 4200, currency: 'EGP' });
  assert.equal(out.rows[1]?.fields['ref'], 'ch_2');
});

test('AND A HOST WITH NO READER SAYS SO, rather than answering every page with no rows', () => {
  const out = extractPull(deps, CSV_DECL, { ts: TS, body: CSV });
  assert.deepEqual(out.rows, []);
  assert.equal(out.confidence, 'needs-review');
  /* THE SENTENCE NAMES THE FORMAT, which is the difference between a person changing the
     declaration and a person filing a bug against the provider. */
  assert.match(out.reason ?? '', /csv/);
  assert.match(out.reason ?? '', /JSON only/);
});

test('AND A BODY THAT IS NOT THE FORMAT IT WAS DECLARED AS IS A REASON, naming that format', () => {
  const out = extractPull({ ...deps, rows: () => null }, CSV_DECL, { ts: TS, body: '<html>maintenance</html>' });
  assert.deepEqual(out.rows, []);
  assert.equal(out.reason, 'stripe-charges was answered with something that is not csv.');
});

test("AND JSON KEEPS ITS OWN READER even when a host supplies the other one", () => {
  /* ONE INSTALLED CONNECTOR MUST NOT CHANGE MEANING. `@braindog/extract` reads a `rows:` path with
     its own grammar and `run.ts` validated this one with `readPath`; routing today's JSON through
     the other reader would quietly re-decide what every existing declaration points at. */
  const out = extractPull(
    { ...deps, rows: () => assert.fail('a JSON page was sent to the injected reader') },
    DECL,
    body([CHARGE]),
  );
  assert.equal(out.rows.length, 1);
});
