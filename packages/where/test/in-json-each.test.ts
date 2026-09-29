/**
 * A long `in` binds one parameter, and it answers the rows the short one did.
 *
 * `IN_CHUNK`'s paragraph in the source has the argument: chunking bounded the statement's shape and
 * never its parameter count, so a predicate could hold about ninety-five literal values before the
 * adapter's hundred (`DO_LIMITS.variableNumber`) refused the whole statement. Above sixty-four values a
 * field whose values carry no currency or unit now binds its list as one JSON text read through
 * `json_each`, and money and quantity keep their chunks and their ceiling.
 *
 * EVERY ROW ASSERTION HERE IS A DIFFERENTIAL, for the reason `where.test.ts` gives for its own: the
 * SQL rendering and `evaluate` are asked the same question about the same rows and must agree, and a
 * new SQL shape is exactly where the two would start to disagree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { guard, SqlError } from '@braindog/ports';

import { compile, evaluate, type Predicate, type Schema } from '../src/index.ts';

/* ── the fixture ───────────────────────────────────────────────────── */

const SCHEMA: Schema = {
  register: 'jobs',
  state: 'state',
  fields: {
    what: { type: 'text' },
    n: { type: 'int' },
    open: { type: 'bool' },
    state: { type: 'enum', values: ['open', 'part', 'paid'] },
    at: { type: 'instant' },
    fee: { type: 'money' },
  },
};

type Row = {
  id: string;
  seq: number;
  state: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  fields: Record<string, unknown>;
};

/* `c` HOLDS THE TEXT "2" AND `e` HOLDS THE NUMBER 2 in a text field, which a write never stores and
   an import can carry. They are here so that a list of strings and a list of numbers are seen to stay
   apart through the JSON, as they stayed apart when each value was bound on its own. */
const ROWS: Row[] = [
  { id: 'a', seq: 1, state: 'open', created_at: '2026-08-01T09:00:00.000Z', updated_at: '2026-08-01T09:00:00.000Z', version: 1, fields: { what: 'Invoice 41', n: 3, open: true, state: 'open', at: '2026-08-01T11:57:00.000Z', fee: { amount: 48_000, currency: 'GBP' } } },
  { id: 'b', seq: 2, state: 'paid', created_at: '2026-08-02T09:00:00.000Z', updated_at: '2026-08-02T09:00:00.000Z', version: 1, fields: { what: 'Retainer', n: 9, open: false, state: 'paid', at: '2026-08-02T00:00:01.000Z', fee: { amount: 24_000, currency: 'GBP' } } },
  { id: 'c', seq: 3, state: 'part', created_at: '2026-08-03T09:00:00.000Z', updated_at: '2026-08-03T09:00:00.000Z', version: 1, fields: { what: '2', n: 2, state: 'part', fee: { amount: 24_000, currency: 'EUR' } } },
  { id: 'd', seq: 4, state: 'open', created_at: '2026-08-04T09:00:00.000Z', updated_at: '2026-08-04T09:00:00.000Z', version: 1, fields: { what: 'Nothing else set', state: 'open' } },
  { id: 'e', seq: 5, state: 'open', created_at: '2026-08-05T09:00:00.000Z', updated_at: '2026-08-05T09:00:00.000Z', version: 1, fields: { what: 2, state: 'open' } },
];

/** The columns are `migrations/0001_kernel.ts`'s, as `where.test.ts` copies them. */
function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  d.exec(
    'CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, state TEXT, version INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)',
  );
  const put = d.prepare(
    'INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
  );
  for (const r of ROWS) put.run(r.id, 'jobs', r.seq, JSON.stringify(r.fields), r.state, r.version, r.created_at, r.updated_at);
  return d;
}

const bySql = (where: Predicate): string[] => {
  const c = compile(where, SCHEMA);
  assert.deepEqual(c.bad, [], c.bad[0]?.fix);
  const d = db();
  const out = d.prepare(`SELECT id FROM entry WHERE ${c.sql} ORDER BY id`).all(...(c.params as never[])) as { id: string }[];
  d.close();
  return out.map((r) => r.id);
};

const byJs = (where: Predicate): string[] => ROWS.filter((r) => evaluate(where, r.fields, SCHEMA, r)).map((r) => r.id);

/** Both renderings, which must agree. */
const both = (where: Predicate): string[] => {
  const sql = bySql(where);
  const js = byJs(where);
  assert.deepEqual(js, sql, `the two renderings disagree: SQL ${sql.join(',')} vs JS ${js.join(',')}`);
  return sql;
};

/** Values no row holds, enough of them to pass `IN_CHUNK`. */
const words = (n: number): string[] => Array.from({ length: n }, (_, i) => `nothing-${i}`);
const numbers = (n: number): number[] => Array.from({ length: n }, (_, i) => 1_000 + i);
const moments = (n: number): string[] => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2031, 0, 1) + i * 86_400_000).toISOString());
const fees = (n: number): { amount: number; currency: string }[] => Array.from({ length: n }, (_, i) => ({ amount: 1 + i, currency: 'GBP' }));

/** The statement `kernel.list` sends for a first page, register first and limit last, through the adapter's guard. */
const throughGuard = (where: Predicate): void => {
  const c = compile(where, SCHEMA);
  assert.deepEqual(c.bad, [], c.bad[0]?.fix);
  guard(`SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND (${c.sql}) ORDER BY updated_at DESC, id DESC LIMIT ?`, ['jobs', ...c.params, 51]);
};

/* ── the shape ─────────────────────────────────────────────────────── */

test('A 300-VALUE `in` ON A TEXT FIELD IS ONE PARAMETER, and so is its `not_in`', () => {
  const values = words(300);
  const c = compile({ field: 'what', in: values }, SCHEMA);
  assert.deepEqual(c.bad, []);
  assert.equal(c.params.length, 1, `it bound ${c.params.length}`);
  assert.ok(c.sql.includes('IN (SELECT value FROM json_each(?))'), c.sql);
  assert.deepEqual(JSON.parse(String(c.params[0])), values, 'the one parameter is the list, in order');

  const n = compile({ field: 'what', not_in: values }, SCHEMA);
  assert.deepEqual(n.bad, []);
  assert.equal(n.params.length, 1);
  assert.ok(n.sql.includes('IN (SELECT value FROM json_each(?))'), n.sql);

  /* AND THE STATEMENT A LIST SENDS PASSES THE ADAPTER'S HUNDRED, which 300 bound values never did. */
  throughGuard({ field: 'what', in: values });
  throughGuard({ field: 'what', not_in: values });
});

test('SIXTY-FOUR VALUES STILL BIND ONE EACH, and the sixty-fifth is where the list becomes one', () => {
  const at64 = compile({ field: 'what', in: words(64) }, SCHEMA);
  assert.equal(at64.params.length, 64);
  assert.equal(at64.sql.includes('json_each'), false, at64.sql.slice(0, 140));

  const at65 = compile({ field: 'what', in: words(65) }, SCHEMA);
  assert.equal(at65.params.length, 1);

  /* A SHORT LIST IS THE STRING IT ALWAYS WAS, which is what keeps every filter already saved on a
     page reading the same SQL. */
  assert.equal(
    compile({ field: 'state', in: ['open', 'part'] }, SCHEMA).sql,
    '(state IS NOT NULL AND ((state = ?) OR (state = ?)))',
  );
});

test('A LONG `in` OVER AN INSTANT BINDS AT MOST TWO, the bare days and the moments, and each is compared at its own grain', () => {
  const c = compile({ field: 'at', in: [...moments(70), '2026-08-01', '2026-08-02T00:00:01.000Z'] }, SCHEMA);
  assert.deepEqual(c.bad, []);
  assert.equal(c.params.length, 2, `it bound ${c.params.length}`);
  /* The bare day matches `a` by its date part; the full instant matches `b` whole. */
  assert.deepEqual(both({ field: 'at', in: [...moments(70), '2026-08-01', '2026-08-02T00:00:01.000Z'] }), ['a', 'b']);
  assert.deepEqual(both({ field: 'at', not_in: [...moments(70), '2026-08-01'] }), ['b', 'c', 'd', 'e']);
  /* Only moments: one list, one parameter. */
  assert.equal(compile({ field: 'at', in: moments(80) }, SCHEMA).params.length, 1);
});

/* ── the rows do not move ──────────────────────────────────────────── */

test('THE LONG FORM ANSWERS THE ROWS THE CHAIN DID, in both renderings, for every type that takes it', () => {
  /* Text, with the one real value at the far end of the list. */
  assert.deepEqual(both({ field: 'what', in: [...words(120), 'Retainer'] }), ['b']);
  assert.deepEqual(both({ field: 'what', not_in: [...words(120), 'Retainer'] }), ['a', 'c', 'd', 'e']);

  /* `"2"` IS NOT `2`, through the JSON as it was bound on its own. */
  assert.deepEqual(both({ field: 'what', in: [...words(70), '2'] }), ['c']);
  assert.deepEqual(both({ field: 'what', in: [...words(70), 2] }), ['e']);

  /* An int, and a row with nothing in the field is not in any list. */
  assert.deepEqual(both({ field: 'n', in: [...numbers(90), 3, 9] }), ['a', 'b']);
  assert.deepEqual(both({ field: 'n', not_in: [...numbers(90), 3] }), ['b', 'c', 'd', 'e']);

  /* A bool, which `bind` makes 1 or 0 and `json_extract` reads a stored `true` or `false` as. */
  assert.deepEqual(both({ field: 'open', in: Array.from({ length: 70 }, () => true) }), ['a']);
  assert.deepEqual(both({ field: 'open', not_in: Array.from({ length: 70 }, () => true) }), ['b', 'c', 'd', 'e']);

  /* THE MIRRORED `state` COLUMN AND `seq`, which read a column of `entry` rather than the JSON, so
     the column's affinity meets the subquery's values. */
  assert.deepEqual(both({ field: 'state', in: [...Array.from({ length: 70 }, () => 'paid'), 'part'] }), ['b', 'c']);
  assert.deepEqual(both({ field: 'seq', in: [...numbers(70), 1, 5] }), ['a', 'e']);
  assert.deepEqual(both({ field: 'id', not_in: [...words(70), 'a', 'b'] }), ['c', 'd', 'e']);
});

test('INSIDE A `none:` A ROW WITH NOTHING IN THE FIELD STAYS, which is the `IS NOT NULL` the long form keeps', () => {
  assert.deepEqual(both({ none: [{ field: 'n', in: [...numbers(80), 3] }] }), ['b', 'c', 'd', 'e']);
  assert.deepEqual(both({ none: [{ field: 'n', not_in: [...numbers(80), 3] }] }), ['a']);
});

/* ── money keeps its chunks, and its ceiling ───────────────────────── */

test('A LONG MONEY `in` STILL CHUNKS, two parameters a value, and answers the same rows', () => {
  const c = compile({ field: 'fee', in: [...fees(70), { amount: 24_000, currency: 'EUR' }] }, SCHEMA);
  assert.deepEqual(c.bad, []);
  assert.equal(c.sql.includes('json_each'), false, 'a money list took the one-parameter form, which does not carry a currency');
  assert.equal(c.params.length, 142);
  /* `38 §5` step 3's shape, where it still applies: 71 pairs are a slice of 64 and a slice of 7, and a
     `not_in` negates each slice and joins them with AND, so it says NOT twice. */
  const n = compile({ field: 'fee', not_in: [...fees(70), { amount: 24_000, currency: 'GBP' }] }, SCHEMA);
  assert.deepEqual(n.bad, []);
  assert.equal((n.sql.match(/NOT \(/g) ?? []).length, 2, n.sql.slice(0, 140));
  assert.deepEqual(both({ field: 'fee', in: [...fees(70), { amount: 24_000, currency: 'EUR' }] }), ['c']);
  /* `b` is in the list, `c` is in another currency and so not the thing asked about, and `d` and `e`
     hold no fee, which is not in any list. */
  assert.deepEqual(both({ field: 'fee', not_in: [...fees(70), { amount: 24_000, currency: 'GBP' }] }), ['a', 'd', 'e']);
});

test('A MONEY `in` MEETS THE HUNDRED AT FIFTY VALUES, which is the ceiling `IN_CHUNK`\'s paragraph states', () => {
  /* Forty-nine pairs and the list statement's register and limit are exactly one hundred. */
  throughGuard({ field: 'fee', in: fees(49) });
  assert.throws(
    () => throughGuard({ field: 'fee', in: fees(50) }),
    (e: unknown) => e instanceof SqlError && e.code === 'TOO_MANY_PARAMS',
  );
});
