/**
 * The predicate, and the two renderings of it.
 *
 * The test that matters most is the last section: `compile` and `evaluate` are asked the same
 * question about the same rows, and their answers are compared row by row. Two renderings that
 * disagree are worse than one that is slow, and they disagree QUIETLY — a rule that fires mid-write
 * and a list that draws afterwards, differing about one row, is a bug nobody can reproduce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { compile, evaluate, jsonPath, type Predicate, type Schema } from '../src/index.ts';

const SCHEMA: Schema = {
  register: 'obligations',
  fields: {
    what: { type: 'text' },
    amount: { type: 'money' },
    due: { type: 'day' },
    effort: { type: 'quantity' },
    n: { type: 'int' },
    open: { type: 'bool' },
    state: { type: 'enum', values: ['open', 'part', 'paid', 'written_off'] },
    tags: { type: 'list' },
  },
};

type Row = { id: string; fields: Record<string, unknown> };

const ROWS: Row[] = [
  { id: 'a', fields: { what: 'Invoice 41 — brand', amount: { amount: 48_000, currency: 'GBP' }, due: '2026-08-01', n: 3, state: 'open', tags: ['urgent', 'design'], effort: { value: 2, unit: 'days' } } },
  { id: 'b', fields: { what: 'Retainer, August', amount: { amount: 24_000, currency: 'GBP' }, due: '2026-10-01', n: 9, state: 'paid', tags: ['retainer'] } },
  { id: 'c', fields: { what: 'Hosting', amount: { amount: 24_000, currency: 'EUR' }, due: '2026-09-05', n: 0, state: 'part', tags: [] } },
  { id: 'd', fields: { what: 'No amount at all', state: 'open' } },
  { id: 'e', fields: { what: '50% deposit', amount: { amount: 100_000, currency: 'GBP' }, due: '2026-12-31', n: 1, state: 'open', tags: ['deposit'] } },
];

/** The same rows, in SQLite, so `compile` can be run against them for real. */
function db() {
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, fields TEXT, deleted_at TEXT)');
  for (const row of ROWS)
    d.prepare('INSERT INTO entry (id, register, fields, deleted_at) VALUES (?, ?, ?, NULL)').run(
      row.id,
      'obligations',
      JSON.stringify(row.fields),
    );
  return d;
}

const bySql = (where: Predicate | undefined): string[] => {
  const c = compile(where, SCHEMA);
  assert.deepEqual(c.bad, [], c.bad[0]?.fix);
  const d = db();
  const out = d.prepare(`SELECT id FROM entry WHERE ${c.sql} ORDER BY id`).all(...(c.params as never[])) as { id: string }[];
  d.close();
  return out.map((r) => r.id);
};

const byJs = (where: Predicate | undefined): string[] =>
  ROWS.filter((r) => evaluate(where, r.fields, SCHEMA)).map((r) => r.id);

/** Both renderings, and they must agree — which is the whole point of there being one grammar. */
const both = (where: Predicate | undefined): string[] => {
  const sql = bySql(where);
  const js = byJs(where);
  assert.deepEqual(js, sql, `the two renderings disagree: SQL ${sql.join(',')} vs JS ${js.join(',')}`);
  return sql;
};

/* ── the operators ───────────────────────────────────────────────────────── */

test('is and not, and a row with no value is not "not" nothing — it is not anything', () => {
  assert.deepEqual(both({ field: 'state', is: 'open' }), ['a', 'd', 'e']);
  // `d` has a state; `not paid` includes it. A row with NO value for the field is included too,
  // because a field nobody set is not equal to anything.
  assert.deepEqual(both({ field: 'state', not: 'paid' }), ['a', 'c', 'd', 'e']);
  assert.deepEqual(both({ field: 'due', not: '2026-10-01' }), ['a', 'c', 'd', 'e']);
});

test('in and not_in', () => {
  assert.deepEqual(both({ field: 'state', in: ['open', 'part'] }), ['a', 'c', 'd', 'e']);
  assert.deepEqual(both({ field: 'state', not_in: ['paid', 'written_off'] }), ['a', 'c', 'd', 'e']);
});

test('the ordered ones, and a row with no value is before nothing and after nothing', () => {
  // A missing date in an overdue list is a row somebody would act on for no reason.
  assert.deepEqual(both({ field: 'due', before: '2026-09-06' }), ['a', 'c']);
  assert.deepEqual(both({ field: 'due', after: '2026-09-06' }), ['b', 'e']);
  assert.deepEqual(both({ field: 'n', gte: 3 }), ['a', 'b']);
  assert.deepEqual(both({ field: 'n', lt: 3 }), ['c', 'e']);
  assert.deepEqual(both({ field: 'due', between: ['2026-09-01', '2026-12-31'] }), ['b', 'c', 'e']);
});

test('the textual ones, and a percent sign in the value is a percent sign', () => {
  // A search for "50%" that matched every row would read as a search that found a lot.
  assert.deepEqual(both({ field: 'what', contains: 'Invoice' }), ['a']);
  assert.deepEqual(both({ field: 'what', starts: 'Retainer' }), ['b']);
  assert.deepEqual(both({ field: 'what', ends: 'deposit' }), ['e']);
  assert.deepEqual(both({ field: 'what', contains: '50%' }), ['e']);
  assert.deepEqual(both({ field: 'what', contains: '%' }), ['e'], 'the wildcard leaked out of the value');
});

test('empty and present are about the FIELD, not about its value', () => {
  assert.deepEqual(both({ field: 'amount', empty: true }), ['d']);
  assert.deepEqual(both({ field: 'amount', present: true }), ['a', 'b', 'c', 'e']);
  // Zero is a number somebody measured, and it is present.
  assert.deepEqual(both({ field: 'n', present: true }), ['a', 'b', 'c', 'e']);
});

test('has and lacks look inside a list', () => {
  assert.deepEqual(both({ field: 'tags', has: 'urgent' }), ['a']);
  assert.deepEqual(both({ field: 'tags', lacks: 'urgent' }), ['b', 'c', 'd', 'e']);
});

/* ── money carries its currency ──────────────────────────────────────────── */

test('A MONEY COMPARISON CARRIES ITS CURRENCY, because two currencies are two quantities', () => {
  // `b` and `c` hold the same NUMBER — 24,000 — in GBP and EUR. Comparing the numbers is the exact
  // mistake minor units exist to make impossible.
  assert.deepEqual(both({ field: 'amount', is: { amount: 24_000, currency: 'GBP' } }), ['b']);
  assert.deepEqual(both({ field: 'amount', is: { amount: 24_000, currency: 'EUR' } }), ['c']);
  assert.deepEqual(both({ field: 'amount', gte: { amount: 24_000, currency: 'GBP' } }), ['a', 'b', 'e']);
});

/* ── groups ──────────────────────────────────────────────────────────────── */

test('all, any and none', () => {
  assert.deepEqual(both({ all: [{ field: 'state', is: 'open' }, { field: 'due', before: '2026-09-06' }] }), ['a']);
  assert.deepEqual(both({ any: [{ field: 'state', is: 'paid' }, { field: 'n', gte: 3 }] }), ['a', 'b']);
  assert.deepEqual(both({ none: [{ field: 'state', is: 'open' }] }), ['b', 'c']);
});

test('NONE IS NOT-ANY, AND WITH ONE CHILD YOU CANNOT TELL', () => {
  // Every `none` case in this file had exactly one child, where `NOT (a)` and `NOT (a OR b)` are the
  // same string — so `compile` joined with AND, meaning "not ALL", and passed every row that failed
  // only one of the two. Two children is the smallest case that can tell them apart, and the sweep
  // at the bottom of this file went twenty-three predicates without one.
  const none = both({ none: [{ field: 'state', is: 'open' }, { field: 'n', gt: 0 }] });
  const any = both({ any: [{ field: 'state', is: 'open' }, { field: 'n', gt: 0 }] });
  assert.deepEqual(
    none,
    ROWS.map((r) => r.id).filter((id) => !any.includes(id)),
    'none is not the complement of any',
  );
  assert.ok(none.length > 0 && none.length < ROWS.length, 'the fixture makes this vacuous');
  // Three children, in case two happened to agree.
  both({ none: [{ field: 'state', is: 'open' }, { field: 'n', gt: 0 }, { field: 'due', empty: true }] });
});

test('THE THREE STRING OPERATORS ARE CASE-FOLDED IN BOTH RENDERINGS', () => {
  // SQLite's LIKE is ASCII case-insensitive and `evaluate` used `includes`, so a rule firing
  // mid-write and the list drawn afterwards disagreed about the same row — the failure this
  // module's own header names.
  assert.deepEqual(both({ field: 'what', contains: 'invoice' }), ['a']);
  assert.deepEqual(both({ field: 'what', contains: 'INVOICE' }), ['a']);
  assert.deepEqual(both({ field: 'what', starts: 'RETAINER' }), ['b']);
  assert.deepEqual(both({ field: 'what', ends: 'DEPOSIT' }), ['e']);
  assert.deepEqual(both({ field: 'what', contains: 'HoStInG' }), ['c']);
});

test('AND THE QUALIFIER TRAVELS THROUGH EVERY OPERATOR, not only the two written first', () => {
  // `in`, `not_in` and `between` compiled to bare comparisons of the amounts, so 24,000 EUR matched
  // a list holding 24,000 GBP — the exact mistake the `is` branch was written to prevent, in the
  // branch beside it. `between` was wrong in BOTH renderings, so comparing them flagged nothing:
  // a shared bug is invisible to a test that only checks the two against each other.
  assert.deepEqual(both({ field: 'amount', in: [{ amount: 24_000, currency: 'GBP' }] }), ['b']);
  /* AND A FOREIGN-CURRENCY ROW IS NOT A MATCH EVEN UNDER NEGATION — `34-GRAMMARS` §1.5. `c` holds
     EUR 240.00, and it is not "an amount that is not GBP 240.00": it is not the thing being talked
     about at all, the same way `is` does not match it. The alternative reads as an answer about
     euros to a question asked in sterling. */
  assert.deepEqual(both({ field: 'amount', not_in: [{ amount: 24_000, currency: 'GBP' }] }), ['a', 'd', 'e']);
  assert.deepEqual(both({ field: 'amount', not: { amount: 24_000, currency: 'GBP' } }), ['a', 'd', 'e']);
  assert.deepEqual(both({ field: 'amount', not: { amount: 24_000, currency: 'EUR' } }), ['d'], 'only the row with no amount');
  assert.deepEqual(
    both({ field: 'amount', between: [{ amount: 20_000, currency: 'GBP' }, { amount: 30_000, currency: 'GBP' }] }),
    ['b'],
    'a EUR row is inside a GBP range',
  );
  // And a quantity's unit, which never travelled at all.
  assert.deepEqual(both({ field: 'effort', is: { value: 2, unit: 'days' } }), ['a']);
  assert.deepEqual(both({ field: 'effort', is: { value: 2, unit: 'hours' } }), [], 'two days matched two hours');
});

test('a field id that is a property of every object is still not a field', () => {
  // `constructor` passes the identifier grammar and resolves against `Object.prototype`, so it
  // compiled to a clause that matched nothing — a filter that quietly returned an empty list, which
  // is the failure this module exists to prevent.
  const c = compile({ field: 'constructor', is: 'x' }, SCHEMA);
  assert.equal(c.bad[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(evaluate({ field: 'constructor', is: 'x' }, ROWS[0]!.fields, SCHEMA), false);
});

test('an empty group is not an empty question', () => {
  // `all: []` is true of everything and `any: []` of nothing, which is what the two words mean.
  // Guessing either way is a filter that silently passes or silently blocks.
  assert.equal(both({ all: [] }).length, ROWS.length);
  assert.equal(both({ any: [] }).length, 0);
  assert.equal(both(undefined).length, ROWS.length);
});

test('groups nest', () => {
  assert.deepEqual(
    both({
      all: [
        { field: 'state', not: 'paid' },
        { any: [{ field: 'n', gte: 3 }, { field: 'amount', empty: true }] },
      ],
    }),
    ['a', 'd'],
  );
});

/* ── it refuses rather than matching nothing ─────────────────────────────── */

test('A FIELD THE REGISTER DOES NOT HAVE IS REFUSED, and the refusal lists what it does', () => {
  const c = compile({ field: 'nope', is: 'x' }, SCHEMA);
  assert.equal(c.bad[0]?.code, 'FIELD_UNKNOWN');
  assert.ok(c.bad[0]?.allowed?.includes('what'));
});

test('a value the enum does not have is refused — the failure that motivated the evaluator', () => {
  // `state is not done` on a register with no `done` state was true of every row, so a filter that
  // looked like it had worked returned the whole register.
  const c = compile({ field: 'state', not: 'done' }, SCHEMA);
  assert.equal(c.bad[0]?.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(c.bad[0]?.allowed, ['open', 'part', 'paid', 'written_off']);
  // And inside a list, every value is checked, not only the first.
  assert.equal(compile({ field: 'state', in: ['open', 'done'] }, SCHEMA).bad[0]?.code, 'ENUM_VALUE_UNKNOWN');
});

test('an operator the type cannot take is refused by name', () => {
  assert.equal(compile({ field: 'what', gt: 3 }, SCHEMA).bad[0]?.code, 'WHERE_OPERATOR_UNSUPPORTED');
  assert.equal(compile({ field: 'amount', contains: 'x' }, SCHEMA).bad[0]?.code, 'WHERE_OPERATOR_UNSUPPORTED');
  assert.equal(compile({ field: 'what', has: 'x' }, SCHEMA).bad[0]?.code, 'WHERE_OPERATOR_UNSUPPORTED');
});

test('a leaf with no test, and a grammar shape this build does not read, are both named', () => {
  assert.equal(compile({ field: 'what' } as never, SCHEMA).bad[0]?.code, 'WHERE_MALFORMED');
  for (const shape of [{ matches: 'x' }, { predicate: 'p' }, { field: 'what', near: { text: 'x' } }, { field: 'what', is: 'x', via: 'party' }])
    assert.match(compile(shape as never, SCHEMA).bad[0]?.code ?? '', /WHERE_UNSUPPORTED/, JSON.stringify(shape));
});

test('a refused predicate compiles to something that matches NOTHING', () => {
  // Belt and braces: a caller that ignores `bad` must not get the whole register.
  const c = compile({ field: 'nope', is: 'x' }, SCHEMA);
  assert.ok(c.bad.length);
  const d = db();
  const rows = d.prepare(`SELECT id FROM entry WHERE ${c.sql}`).all(...(c.params as never[]));
  d.close();
  assert.equal(rows.length, 0, 'a refused predicate passed rows through');
});

/* ── nothing is inlined ──────────────────────────────────────────────────── */

test('EVERY VALUE IS BOUND, and the only thing inlined is a field id that matched the grammar', () => {
  const c = compile(
    { all: [{ field: 'what', contains: "'; DROP TABLE entry; --" }, { field: 'state', is: 'open' }] },
    SCHEMA,
  );
  assert.deepEqual(c.bad, []);
  assert.ok(!c.sql.includes('DROP'), 'a value reached the SQL');
  assert.ok(c.params.some((p) => String(p).includes('DROP')), 'the value was not bound');
  // The field ids are the only identifiers in the string, and each matched `^[a-z][a-z0-9_]{0,31}$`.
  for (const m of c.sql.matchAll(/\$\.([a-z0-9_]+)/g)) assert.ok(SCHEMA.fields[m[1]!], `${m[1]} is not a field`);
  assert.equal(jsonPath('what'), '$.what');
});

/* ── and the two renderings agree, over everything ───────────────────────── */

test('COMPILE AND EVALUATE ANSWER THE SAME QUESTION, over every predicate above', () => {
  // Each `both()` above already compares them. This one sweeps a wider set in one go, because the
  // disagreement that matters is the one nobody wrote a test for.
  const predicates: Predicate[] = [
    { field: 'state', is: 'open' },
    { field: 'state', not: 'open' },
    { field: 'state', in: ['open', 'paid'] },
    { field: 'state', not_in: ['open'] },
    { field: 'due', before: '2026-09-05' },
    { field: 'due', after: '2026-09-05' },
    { field: 'due', empty: true },
    { field: 'due', present: true },
    { field: 'n', gt: 0 },
    { field: 'n', gte: 0 },
    { field: 'n', lt: 9 },
    { field: 'n', lte: 9 },
    { field: 'n', between: [1, 3] },
    { field: 'what', contains: 'o' },
    { field: 'what', starts: 'H' },
    { field: 'what', ends: 't' },
    { field: 'amount', gt: { amount: 24_000, currency: 'GBP' } },
    { field: 'amount', is: { amount: 24_000, currency: 'EUR' } },
    { field: 'tags', has: 'design' },
    { field: 'tags', lacks: 'design' },
    { all: [{ field: 'state', is: 'open' }, { field: 'tags', has: 'urgent' }] },
    { any: [{ field: 'due', empty: true }, { field: 'n', gte: 9 }] },
    { none: [{ field: 'amount', present: true }] },
    /* THE ONES THE FIRST SWEEP DID NOT REACH, and each was a real disagreement: a `none` with more
       than one child, the three string operators against a different case, and every operator that
       compares a compound value. A sweep is only as wide as its list. */
    { none: [{ field: 'state', is: 'open' }, { field: 'n', gt: 0 }] },
    { none: [{ field: 'due', empty: true }, { field: 'tags', has: 'urgent' }, { field: 'n', lt: 1 }] },
    { field: 'what', contains: 'INVOICE' },
    { field: 'what', starts: 'hOsT' },
    { field: 'what', ends: 'DEPOSIT' },
    { field: 'amount', in: [{ amount: 24_000, currency: 'GBP' }, { amount: 48_000, currency: 'GBP' }] },
    { field: 'amount', not_in: [{ amount: 24_000, currency: 'EUR' }] },
    { field: 'amount', between: [{ amount: 20_000, currency: 'GBP' }, { amount: 60_000, currency: 'GBP' }] },
    { field: 'effort', present: true },
    { field: 'effort', is: { value: 2, unit: 'days' } },
    { field: 'effort', is: { value: 2, unit: 'hours' } },
    { field: 'n', is: 0 },
    { field: 'n', not: 0 },
  ];
  for (const p of predicates) both(p);
});

/* ── two backends, one answer ────────────────────────────────── */

test('`contains` IS `instr` AND NEVER `LIKE`, because a LIKE pattern has two different ceilings', () => {
  /* One platform caps a `LIKE` pattern at fifty bytes and the other at fifty thousand, so a
     forty-nine character `contains` works on a laptop and fails in production — which is the shape
     of failure a two-host product must not have in its most-used operator. */
  const c = compile({ field: 'what', contains: 'invoice' }, SCHEMA);
  assert.match(c.sql, /instr\(lower\(/);
  assert.equal(c.sql.includes('LIKE'), false, 'contains still compiles to LIKE');

  // A `%` in the value is a `%`, not a wildcard, and needs no escape now there is no pattern.
  assert.deepEqual(both({ field: 'what', contains: '50%' }), ['e']);

  // A prefix IS a pattern, so those keep LIKE — and every literal is held under one ceiling.
  assert.match(compile({ field: 'what', starts: 'Inv' }, SCHEMA).sql, /LIKE/);
  assert.equal(compile({ field: 'what', contains: 'x'.repeat(41) }, SCHEMA).bad[0]?.code, 'CONTAINS_TOO_LONG');
  assert.equal(compile({ field: 'what', starts: 'x'.repeat(41) }, SCHEMA).bad[0]?.code, 'CONTAINS_TOO_LONG');
  assert.equal(compile({ field: 'what', contains: 'x'.repeat(40) }, SCHEMA).bad.length, 0);
});

test('AND `empty` IS THE THREE WAYS A VALUE IS ABSENT, because an import carries what it carries', () => {
  /* A write stores none of them — null, '' and [] all remove the key — but a row that arrived in a
     `.dog` file, or was written by an older build, may hold an empty string. `IS NULL` alone read
     those as PRESENT, so `note is empty` missed exactly the rows somebody was looking for. */
  const rows = [
    { id: 'x', fields: { what: 'a', tags: [] } },
    { id: 'y', fields: { what: 'a', note: '' } },
    { id: 'z', fields: { what: 'a', note: 'said' } },
  ];
  const schema = { register: 'r', fields: { what: { type: 'text' }, note: { type: 'text' }, tags: { type: 'list' } } };

  assert.deepEqual(rows.filter((r) => evaluate({ field: 'note', empty: true }, r.fields, schema)).map((r) => r.id), ['x', 'y']);
  assert.deepEqual(rows.filter((r) => evaluate({ field: 'note', present: true }, r.fields, schema)).map((r) => r.id), ['z']);
  assert.deepEqual(rows.filter((r) => evaluate({ field: 'tags', empty: true }, r.fields, schema)).map((r) => r.id), ['x', 'y', 'z']);

  const c = compile({ field: 'note', empty: true }, schema);
  assert.match(c.sql, /= ''/);
  assert.match(c.sql, /= '\[\]'/);
});

/* ── the two spellings of one grammar ─────────────────────────────────── */

/**
 * A second, smaller set — rows the shared fixture would have to change shape to hold.
 *
 * SEPARATE ON PURPOSE. Adding an imported row to `ROWS` would change the expected answer of every
 * test above it, which is how a fixture stops being a fixture and becomes a thing you edit to make
 * tests pass.
 */
const ODD: Row[] = [
  /* A SCALAR WHERE A LIST BELONGS. This is what an import leaves behind: the `.dog` reader writes
     `fields` without coercing them, so a record that held `tags` as a string arrives holding one. */
  { id: 'imported', fields: { what: 'Imported', tags: 'urgent', open: true } },
  { id: 'listed', fields: { what: 'Listed', tags: ['urgent'], open: false } },
  { id: 'bare', fields: { what: 'Bare' } },
];

const oddSql = (where: Predicate | undefined): string[] => {
  const c = compile(where, SCHEMA);
  assert.deepEqual(c.bad, [], c.bad[0]?.fix);
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, fields TEXT, deleted_at TEXT)');
  for (const row of ODD)
    d.prepare('INSERT INTO entry (id, register, fields, deleted_at) VALUES (?, ?, ?, NULL)').run(row.id, 'obligations', JSON.stringify(row.fields));
  const out = d.prepare(`SELECT id FROM entry WHERE ${c.sql} ORDER BY id`).all(...(c.params as never[])) as { id: string }[];
  d.close();
  return out.map((r) => r.id);
};

const oddBoth = (where: Predicate | undefined): string[] => {
  const sql = oddSql(where);
  const js = ODD.filter((r) => evaluate(where, r.fields, SCHEMA)).map((r) => r.id).sort();
  assert.deepEqual(js, sql, `the two renderings disagree: SQL ${sql.join(',')} vs JS ${js.join(',')}`);
  return sql;
};

test('A `has` ON A ROW HOLDING A SCALAR DOES NOT TAKE THE QUERY DOWN WITH IT', () => {
  /* `json_each` RAISES on a bare string, so one imported row holding `tags: 'urgent'` made the whole
     query throw and lost every other row's answer. `json_each(NULL)` is fine, so an absent row was
     never the problem. A scalar is not a list, so it holds nothing. */
  assert.deepEqual(oddBoth({ field: 'tags', has: 'urgent' }), ['listed']);
});

test('and `lacks` counts it as holding nothing, rather than as an error', () => {
  assert.deepEqual(oddBoth({ field: 'tags', lacks: 'urgent' }), ['bare', 'imported']);
});

test('A BOOL WRITTEN EITHER WAY BINDS THE SAME', () => {
  /* The sentence grammar resolves `open is yes` to the STRING `'true'`; `json_extract` answers the
     integer `1`; and `1 = 'true'` is false in SQLite. So the sentence form matched nothing and its
     negation matched everything — the clause that quietly matches every row, which this module's
     own header is written against. */
  assert.deepEqual(oddBoth({ field: 'open', is: true }), ['imported']);
  assert.deepEqual(oddBoth({ field: 'open', is: 'true' as never }), ['imported'], 'the sentence spelling matched nothing');
  assert.deepEqual(oddBoth({ field: 'open', is: false }), ['listed']);
  assert.deepEqual(oddBoth({ field: 'open', is: 'false' as never }), ['listed']);
});

test('and its negation does not match everything', () => {
  // The unset row is in it because a row with no value is not "not" anything — the rule the `not`
  // branch already states. What matters is that the row which IS true is out.
  assert.deepEqual(oddBoth({ field: 'open', not: 'true' as never }), ['bare', 'listed']);
});

test('AND `not_in` BINDS AS MANY PARAMETERS AS IT HAS PLACEHOLDERS', () => {
  /* `put` was called once per value and the resulting clause STRINGS were then deduplicated — and
     they are identical, because the `?` in them is literal. Two GBP values gave three placeholders
     and four parameters: `node:sqlite` raises `column index out of range` and the list, the metric
     or the page fails outright. A driver that tolerated it would shift every binding by a place and
     return a value that IS in the list. */
  const gbp = (amount: number) => ({ amount, currency: 'GBP' });
  const c = compile({ field: 'amount', not_in: [gbp(48_000), gbp(24_000)] }, SCHEMA);
  assert.deepEqual(c.bad, []);
  assert.equal((c.sql.match(/\?/g) ?? []).length, c.params.length, 'the SQL and its parameters are different lengths');
  assert.ok(!both({ field: 'amount', not_in: [gbp(48_000), gbp(24_000)] }).includes('a'));
});

test('and three currencies in one `not_in` still balance', () => {
  const c = compile(
    { field: 'amount', not_in: [{ amount: 1, currency: 'GBP' }, { amount: 2, currency: 'EUR' }, { amount: 3, currency: 'USD' }] },
    SCHEMA,
  );
  assert.equal((c.sql.match(/\?/g) ?? []).length, c.params.length);
});

test('A RANGE IN TWO CURRENCIES IS NOT A RANGE', () => {
  /* The qualifier was taken from the low bound alone, so a range written from GBP 200 to USD 300
     silently reread the ceiling as GBP 300 — a plausible answer to a question nobody asked. */
  const c = compile(
    { field: 'amount', between: [{ amount: 20_000, currency: 'GBP' }, { amount: 30_000, currency: 'USD' }] },
    SCHEMA,
  );
  assert.equal(c.bad[0]?.code, 'MIXED_CURRENCY');
  // And one currency on both bounds still works.
  assert.deepEqual(both({ field: 'amount', between: [{ amount: 20_000, currency: 'GBP' }, { amount: 50_000, currency: 'GBP' }] }), ['a', 'b']);
});

test('AND `not_in` PAIRS EACH AMOUNT WITH ITS OWN CURRENCY', () => {
  /* The currencies were collected into a SET and the amounts negated against the union of it, so
     `not_in [GBP 480, EUR 240]` excluded the GBP 240 row — a value that is not in the list — because
     240 was in the amounts and GBP was in the currencies. The two halves were never put back
     together, and `evaluate` pairs them, so the two renderings disagreed. */
  const out = both({
    field: 'amount',
    not_in: [
      { amount: 48_000, currency: 'GBP' },
      { amount: 24_000, currency: 'EUR' },
    ],
  });
  assert.ok(out.includes('b'), 'GBP 240.00 was excluded by a list that holds EUR 240.00');
  assert.ok(!out.includes('a'), 'GBP 480.00 is in the list and came back anyway');
  assert.ok(!out.includes('c'), 'EUR 240.00 is in the list and came back anyway');
});
