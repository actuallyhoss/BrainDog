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

import { compile, evaluate, fieldSql, fieldSqlIn, jsonPath, parseWhere, type Predicate, type Schema } from '../src/index.ts';

/** The record's clock, fixed, so a sentence carrying a relative word is a sentence about one day. */
const NOW = Date.UTC(2026, 8, 5, 12);

const SCHEMA: Schema = {
  register: 'obligations',
  /* THE REGISTER SAYS WHICH FIELD IS ITS LIFECYCLE, which is what makes the mirrored column
     readable. Going by the name would be wrong in both directions, and `Schema.state`'s paragraph
     in the source has the two cases from the shipped seed. */
  state: 'state',
  fields: {
    what: { type: 'text' },
    amount: { type: 'money' },
    due: { type: 'day' },
    effort: { type: 'quantity' },
    n: { type: 'int' },
    open: { type: 'bool' },
    state: { type: 'enum', values: ['open', 'part', 'paid', 'written_off'] },
    tags: { type: 'list' },
    /* Stored to the second, which is the whole subject of the instant test below. */
    at: { type: 'instant' },
  },
};

/**
 * A ROW IS ITS COLUMNS AND ITS `fields`, AND THIS FIXTURE USED TO BE ONLY THE SECOND HALF.
 *
 * `02 §6` makes six names addressable in any `where:` without a register declaring them, five of
 * which live in COLUMNS of `entry` rather than in the JSON blob beside them, and `state` lives in
 * both. A fixture with no columns can assert nothing about any of the six, which is how
 * `created_at after -7d` came to be a `FIELD_UNKNOWN` that no test here noticed: the differential
 * below could only ever compare the questions the fixture was able to hold.
 */
type Fielded = { id: string; fields: Record<string, unknown> };
type Row = Fielded & {
  seq: number;
  state: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

const ROWS: Row[] = [
  { id: 'a', seq: 1, state: 'open', created_at: '2026-08-01T09:00:00.000Z', updated_at: '2026-08-03T09:00:00.000Z', version: 2, fields: { what: 'Invoice 41 — brand', amount: { amount: 48_000, currency: 'GBP' }, due: '2026-08-01', n: 3, state: 'open', tags: ['urgent', 'design'], effort: { value: 2, unit: 'days' }, at: '2026-08-01T11:57:00.000Z' } },
  { id: 'b', seq: 2, state: 'paid', created_at: '2026-08-02T09:00:00.000Z', updated_at: '2026-08-04T09:00:00.000Z', version: 5, fields: { what: 'Retainer, August', amount: { amount: 24_000, currency: 'GBP' }, due: '2026-10-01', n: 9, state: 'paid', tags: ['retainer'], at: '2026-08-02T00:00:01.000Z' } },
  { id: 'c', seq: 3, state: 'part', created_at: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-02T09:00:00.000Z', version: 1, fields: { what: 'Hosting', amount: { amount: 24_000, currency: 'EUR' }, due: '2026-09-05', n: 0, state: 'part', tags: [] } },
  { id: 'd', seq: 4, state: 'open', created_at: '2026-09-04T09:00:00.000Z', updated_at: '2026-09-04T09:00:00.000Z', version: 1, fields: { what: 'No amount at all', state: 'open' } },
  { id: 'e', seq: 5, state: 'open', created_at: '2026-09-05T09:00:00.000Z', updated_at: '2026-09-05T09:00:00.000Z', version: 3, fields: { what: '50% deposit', amount: { amount: 100_000, currency: 'GBP' }, due: '2026-12-31', n: 1, state: 'open', tags: ['deposit'] } },
];

/**
 * The same rows, in SQLite, so `compile` can be run against them for real.
 *
 * THE COLUMNS AND THE INDEX ARE `migrations/0001_kernel.ts`'s, copied rather than invented: a test
 * that asserts a predicate reads the mirrored `state` column against a table with no such column
 * is asserting about a table nobody has.
 */
function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(
    'CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT, state TEXT, version INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)',
  );
  d.exec('CREATE INDEX entry_state ON entry(register, state) WHERE deleted_at IS NULL');
  for (const row of ROWS)
    d.prepare(
      'INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
    ).run(row.id, 'obligations', row.seq, JSON.stringify(row.fields), row.state, row.version, row.created_at, row.updated_at);
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

/* THE WHOLE ROW, NOT JUST ITS `fields`. A kernel field is a column, so an evaluator handed only the
   JSON cannot answer a question about one, and answering `false` would make this differential pass
   while the two renderings disagreed about every row. See `evaluate`'s fourth argument. */
const byJs = (where: Predicate | undefined): string[] =>
  ROWS.filter((r) => evaluate(where, r.fields, SCHEMA, r)).map((r) => r.id);

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

test('AND A PERSON CAN SAY BOTH OF THEM, which is the half of the grammar that was missing', () => {
  /**
   * `empty` and `present` were operators the STRUCTURED form had and the SENTENCE form could not
   * say. `38 §2.1` publishes both among the nineteen, the two branches above compile them and
   * `evaluate` answers them, so `{field: 'amount', empty: true}` was a filter a person could write
   * in JSON and could not write in the words the pages, the filter chips and every `where:` in the
   * seed are written in. `sentence.ts`'s own header calls that two languages, and the one that
   * drifts is the one nobody is testing.
   *
   * THE CLAIM IS NOT THAT IT PARSES. It is that the sentence compiles to the same predicate the
   * JSON form writes and that both renderings then answer the same rows, which is what `both` is
   * for and why this test is in this file rather than beside the rest of the grammar.
   */
  const said = (text: string): Predicate | undefined => {
    const out = parseWhere(text, SCHEMA, { nowMs: NOW });
    assert.deepEqual(out.bad, [], out.bad[0]?.fix);
    return out.predicate;
  };

  assert.deepEqual(said('amount is empty'), { field: 'amount', empty: true });
  assert.deepEqual(said('amount is set'), { field: 'amount', present: true });
  /* `present` IS THE FORMAT'S OWN WORD, and an agent writing from `38 §2.1` writes what it read. */
  assert.deepEqual(said('amount is present'), { field: 'amount', present: true });

  /* AND THE NEGATION INVERTS. A negation compiled as its own positive is the defect the sentence
     grammar has been bitten by twice, and it answers the opposite of the question asked. */
  assert.deepEqual(said('amount is not empty'), { field: 'amount', present: true });
  assert.deepEqual(said('amount is not set'), { field: 'amount', empty: true });

  // `d` is the row with no amount at all.
  assert.deepEqual(both(said('amount is empty')), ['d']);
  assert.deepEqual(both(said('amount is set')), ['a', 'b', 'c', 'e']);
  assert.deepEqual(both(said('amount is not empty')), ['a', 'b', 'c', 'e']);
  assert.deepEqual(both(said('amount is not set')), ['d']);

  /* AND THE EMPTY LIST IS ONE OF THE THREE WAYS A VALUE IS ABSENT, which is `c`: it holds `tags:
     []`, and the compiler's own `= '[]'` is why the sentence finds it. */
  assert.deepEqual(both(said('tags is empty')), ['c', 'd']);
  assert.deepEqual(both(said('tags is set')), ['a', 'b', 'e']);

  // And it is an ordinary clause, so it ANDs on the comma like any other.
  assert.deepEqual(both(said('state is open, amount is empty')), ['d']);
});

test('and the sentence takes the operator on exactly the types the structured form takes it on', () => {
  /**
   * ONE RELATION, ASKED ONCE. `operatorAllowed` decides which operators a type admits and is now
   * exported for this: the sentence form asks it rather than carrying a second copy of `38 §4.3`,
   * because a relation held in two places is two relations the day one of them is edited.
   *
   * `34 §1.2` gives `empty` and `present` to *"every type"*, so nothing below is refused today and
   * the assertion is an EQUALITY rather than a list of refusals. It fails in either direction: a
   * sentence accepted where the compiler refuses is a clause that installs clean and then matches
   * nothing for ever, and a sentence refused where the compiler accepts is the gap this whole
   * change is about. Before the sentence form learned the operator this failed on nine of the
   * sixteen, because `empty` went to the value slot and came back as ENUM_VALUE_UNKNOWN, as a day
   * that will not resolve, or as a number that is not one.
   */
  for (const type of [
    // The sixteen of `38 §2.2`, in its order.
    'text', 'document', 'int', 'decimal', 'money', 'quantity', 'day', 'instant', 'duration',
    'bool', 'enum', 'ref', 'file', 'url', 'email', 'secret', 'list', 'json',
  ]) {
    const schema: Schema = { register: 'r', fields: { f: { type, ...(type === 'enum' ? { values: ['open'] } : {}) } } };
    for (const [sentence, leaf] of [
      ['f is empty', { field: 'f', empty: true }],
      ['f is set', { field: 'f', present: true }],
    ] as const) {
      const spoken = parseWhere(sentence, schema, { nowMs: NOW });
      const structured = compile(leaf, schema);
      assert.equal(
        spoken.bad.length === 0,
        structured.bad.length === 0,
        `${type}: the sentence said ${spoken.bad[0]?.code ?? 'yes'} and the predicate said ${structured.bad[0]?.code ?? 'yes'}`,
      );
      if (spoken.bad.length === 0) assert.deepEqual(spoken.predicate, leaf, `${type}: ${sentence}`);
    }
  }
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

/* THE CODE IS `MATCH_OP_UNSUPPORTED` IN ALL FIVE, and it moved here because it was never this
   package's to mint. `30 §6`'s grammar family calls it "the one code for *this test cannot apply
   here*" and then enumerates the cases: `via has near matches starts ends` on a backend that cannot
   serve them, an operator outside its type's set, `near` off the last leaf. `WHERE_OPERATOR_UNSUPPORTED`,
   `WHERE_UNSUPPORTED` and `WHERE_MALFORMED` were three local spellings of it, in no registry, and the
   browser compiles this same grammar — so a name minted here is a name two implementations carry. */
test('an operator the type cannot take is refused by name', () => {
  assert.equal(compile({ field: 'what', gt: 3 }, SCHEMA).bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(compile({ field: 'amount', contains: 'x' }, SCHEMA).bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(compile({ field: 'what', has: 'x' }, SCHEMA).bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
});

test('a leaf with no test, and a grammar shape this build does not read, are both named', () => {
  const none = compile({ field: 'what' } as never, SCHEMA).bad[0];
  assert.equal(none?.code, 'MATCH_OP_UNSUPPORTED');
  // And it says which tests there are, rather than only that this was not one.
  assert.ok((none?.allowed ?? []).includes('is'), 'the refusal does not name the operators');
  for (const shape of [{ matches: 'x' }, { predicate: 'p' }, { field: 'what', near: { text: 'x' } }, { field: 'what', is: 'x', via: 'party' }])
    assert.match(compile(shape as never, SCHEMA).bad[0]?.code ?? '', /MATCH_OP_UNSUPPORTED/, JSON.stringify(shape));
});

test('A TEXT TEST OVER A SERIES WAS ANSWERED, and the documents say a series has no text', () => {
  /**
   * `38 §2.2` writes `series?: boolean` into the schema by name and `38 §5.3` refuses on it twice,
   * L5 for `matches` and L19 for the other four. `Schema` had no such field, so a series register
   * was asked `contains` like any other and answered. Driven against a `series: true` register:
   *
   *     list, contains over a series register    ACCEPTED rows=1
   *     list, starts over a series register      ACCEPTED rows=1
   *     list, matches over a series register     REFUSED MATCH_OP_UNSUPPORTED, "it needs the text index"
   */
  const SERIES: Schema = { register: 'campaign_day', series: true, fields: { campaign: { type: 'text' }, spend: { type: 'int' } } };
  for (const op of ['contains', 'starts', 'ends'] as const) {
    const said = compile({ field: 'campaign', [op]: 'Autumn' }, SERIES).bad[0];
    assert.equal(said?.code, 'SERIES_HAS_NO_TEXT', op);
    assert.equal(said?.at, 'campaign', op);
    assert.equal(
      said?.fix,
      `campaign: ${op} over campaign_day, which is series: true. A series has no text; filter campaign_day on its key fields or its numbers.`,
    );
  }

  /* `matches` AND `near` ARE REFUSED FOR BEING OVER A SERIES, not for this build lacking the index:
     one of those is true of every register and a deploy changes it, and the other is not. */
  for (const [leaf, at] of [
    [{ matches: 'autumn' }, 'matches'],
    [{ field: 'campaign', near: { text: 'autumn' } }, 'near'],
  ] as const) {
    const said = compile(leaf as never, SERIES).bad[0];
    assert.equal(said?.code, 'SERIES_HAS_NO_TEXT', at);
    assert.equal(said?.at, at);
  }

  // Inside a group as well, and the in-memory rendering answers false by construction.
  assert.equal(
    compile({ all: [{ field: 'spend', gt: 1 }, { field: 'campaign', contains: 'A' }] }, SERIES).bad[0]?.code,
    'SERIES_HAS_NO_TEXT',
  );
  assert.equal(evaluate({ field: 'campaign', contains: 'Autumn' }, { campaign: 'Autumn brand' }, SERIES), false);

  /* AND WHAT A SERIES IS FOR STILL COMPILES: its key fields and its numbers. `contains` on one of
     its numbers is still the type's refusal, which `38 §5.3` puts first (L18 before L19), and a
     register that is not a series is asked `contains` as before. */
  assert.deepEqual(compile({ field: 'campaign', is: 'Autumn brand' }, SERIES).bad, []);
  assert.deepEqual(compile({ field: 'spend', gt: 10 }, SERIES).bad, []);
  assert.equal(compile({ field: 'spend', contains: '1' }, SERIES).bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
  const plain: Schema = { ...SERIES, series: false };
  assert.deepEqual(compile({ field: 'campaign', contains: 'Autumn' }, plain).bad, []);
  assert.equal(evaluate({ field: 'campaign', contains: 'Autumn' }, { campaign: 'Autumn brand' }, plain), true);
  assert.equal(compile({ matches: 'x' } as never, plain).bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
});

test('a refused predicate compiles to something that matches NOTHING, INSIDE A GROUP AS WELL AS AT THE ROOT', () => {
  /* Belt and braces: a caller that ignores `bad` must not get the whole register.
     THE FIXTURE USED TO BE A TOP-LEVEL LEAF, which is the single shape where the claim held. A leaf
     at the root makes `walk` return the empty string and the whole compile falls back to `0 = 1`;
     inside a group the refused child was dropped by a `.filter(Boolean)` and the group compiled to
     its SURVIVORS. `none` is the direction that bites, because `NOT (a OR b)` losing `b` is strictly WIDER
     than what was asked, so the clause returned rows the question had excluded, and `all` widens
     the same way. A test that asserts a property at the one input where it holds is worse than no
     test, because it reads as coverage. */
  const shapes: Predicate[] = [
    { field: 'nope', is: 'x' },
    { all: [{ field: 'state', is: 'open' }, { field: 'nope', is: 'x' }] },
    { any: [{ field: 'state', is: 'open' }, { field: 'nope', is: 'x' }] },
    { none: [{ field: 'state', is: 'open' }, { field: 'nope', is: 'x' }] },
    { all: [{ any: [{ field: 'state', is: 'open' }, { field: 'nope', is: 'x' }] }] },
    { none: [{ field: 'amount', is: { amount: 1 } }] },
  ];
  for (const p of shapes) {
    const c = compile(p, SCHEMA);
    assert.ok(c.bad.length, `${JSON.stringify(p)} was not refused at all`);
    /* AND IT BINDS NOTHING. A clause of `0 = 1` handed back with the parameters bound before the
       refusal is a statement with three values and no placeholder, which `node:sqlite` answers with
       an exception, the guard becoming the crash it exists to prevent. */
    assert.deepEqual(c.params, [], `${JSON.stringify(p)} bound parameters a refused clause has no place for`);
    const d = db();
    const rows = d.prepare(`SELECT id FROM entry WHERE ${c.sql}`).all(...(c.params as never[]));
    d.close();
    assert.equal(rows.length, 0, `a refused predicate passed rows through: ${JSON.stringify(p)}`);
    // And the other rendering says the same, because a refusal is not an answer in either of them.
    assert.deepEqual(byJs(p), [], `evaluate answered a refused predicate: ${JSON.stringify(p)}`);
  }
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

  /* AND THE CEILING IS MEASURED ON THE PATTERN, NOT ON THE LITERAL. This checked the raw string,
     and the string that reaches SQLite is the escaped one plus a `%` — so forty bytes of `%`
     compiled to an eighty-one-byte `LIKE` pattern and went past the check whose own comment says it
     exists to stop a pattern reaching a platform's fifty-byte ceiling. */
  const wild = compile({ field: 'what', starts: '%'.repeat(40) }, SCHEMA);
  assert.equal(wild.bad[0]?.code, 'CONTAINS_TOO_LONG', 'forty per-cent signs escape to eighty bytes');
  assert.match(wild.bad[0]?.fix ?? '', /escape to 80/u, 'the refusal names the number it measured');

  /* Twenty-one escape to forty-two, which is over. Twenty escape to exactly forty, which is not —
     and the anchoring `%` is outside the measure, because escape DOUBLING is the defect and one
     wildcard byte is not. A forty-byte literal of ordinary characters is still allowed. */
  assert.equal(compile({ field: 'what', ends: '%'.repeat(21) }, SCHEMA).bad[0]?.code, 'CONTAINS_TOO_LONG');
  assert.equal(compile({ field: 'what', ends: '%'.repeat(20) }, SCHEMA).bad.length, 0);
  assert.equal(compile({ field: 'what', starts: 'x'.repeat(40) }, SCHEMA).bad.length, 0);

  // The escape reaches `_` and `\` too, which are the other two characters `LIKE` reads.
  assert.equal(compile({ field: 'what', starts: '_'.repeat(21) }, SCHEMA).bad[0]?.code, 'CONTAINS_TOO_LONG');

  /* A LITERAL WITH NOTHING TO ESCAPE STILL GETS THE PLAIN SENTENCE, because a refusal reading "at
     most 40 bytes, and this one is 40" is a bug report about the record rather than a fix. */
  assert.match(
    compile({ field: 'what', starts: 'x'.repeat(41) }, SCHEMA).bad[0]?.fix ?? '',
    /at most 40 bytes, and this one is 41[.]/u,
  );

  /* AND `contains` STILL MEASURES THE LITERAL, which is not an inconsistency: it compiles to `instr`
     with the value bound, so there is no pattern to overrun. Forty per-cent signs are forty bytes. */
  assert.equal(compile({ field: 'what', contains: '%'.repeat(40) }, SCHEMA).bad.length, 0);
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
/* AND IT CARRIES NO COLUMNS, because none of the questions asked of it is about one: this set is
   about a scalar arriving where a list belongs, which is entirely a fact about `fields`. */
const ODD: Fielded[] = [
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

test('A MONEY LITERAL WITH NO CURRENCY IS REFUSED, and it used to match every currency', () => {
  /* `qualifier` returned the empty string for a half that is missing, so `amount over 1000` with no
     currency compiled to a bare number comparison over `$.amount.amount`. A hundred thousand yen
     and a thousand pounds are the same integer, and the answer came back confidently mixed. This
     file's own subject is that comparing only the numbers is the mistake minor units exist to make
     impossible; the guard against a mixed RANGE was written and the guard against no currency at
     all was not.

     `30 §6` line 916 specifies the code and it was emitted by nothing. */
  for (const leaf of [
    { field: 'amount', is: { amount: 48_000 } },
    { field: 'amount', not: { amount: 48_000 } },
    { field: 'amount', gt: { amount: 1_000 } },
    { field: 'amount', lte: { amount: 1_000 } },
    { field: 'amount', between: [{ amount: 1, currency: 'GBP' }, { amount: 2 }] },
    { field: 'amount', in: [{ amount: 1, currency: 'GBP' }, { amount: 2 }] },
    { field: 'amount', not_in: [{ amount: 2 }] },
  ] as const) {
    const c = compile(leaf as never, SCHEMA);
    assert.equal(c.bad[0]?.code, 'MONEY_LITERAL_NEEDS_CURRENCY', JSON.stringify(leaf));
    assert.match(c.bad[0]?.fix ?? '', /matches every currency/u, 'the sentence does not say what it would have done');
    /* AND IT MATCHES NOTHING, which is this package's answer to a clause it could not compile: a
       refused predicate returns no rows rather than all of them, so a filter that is wrong is
       visibly wrong rather than quietly generous. */
    assert.equal(c.sql, '0 = 1', 'a refused leaf compiled to something that can match');
  }

  /* AND A COMPLETE ONE IS UNTOUCHED, which is what keeps the guard from being a filter that refuses
     the question rather than answering it. */
  assert.deepEqual(compile({ field: 'amount', is: { amount: 48_000, currency: 'GBP' } }, SCHEMA).bad, []);
});

test('and a quantity says UNIT, because that is the word the repair uses', () => {
  /* `30 §6` gives the two cases separate codes for one reason: the sentence differs by a word, and
     a person told to send a currency for a field measured in metres has been told to do something
     they cannot do. */
  const c = compile({ field: 'effort', is: { value: 3 } } as never, SCHEMA);
  assert.equal(c.bad[0]?.code, 'QUANTITY_LITERAL_NEEDS_UNIT');
  assert.match(c.bad[0]?.fix ?? '', /needs a unit/u);
  assert.deepEqual(compile({ field: 'effort', is: { value: 3, unit: 'h' } } as never, SCHEMA).bad, []);
});

test('and `empty` and `present` are not literals, so they carry no currency and are not refused', () => {
  /* They ask whether the FIELD has anything in it. Demanding a currency of a question about absence
     would refuse the one predicate that has no value to qualify. */
  assert.deepEqual(compile({ field: 'amount', empty: true }, SCHEMA).bad, []);
  assert.deepEqual(compile({ field: 'amount', present: true }, SCHEMA).bad, []);
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

/* -- a caller chooses the SHAPE as well as the contents ------------------- */

test('A `where` THAT IS NOT A PREDICATE IS A REFUSAL, and it used to be a TypeError out of the read', () => {
  /* `packages/host` JSON-decodes every query value and `list` passes `where` straight through, so
     `?where=null` and `?where=5` are things somebody can send. Each of these threw: `Cannot use
     'in' operator to search for 'matches' in null`, or `childrenOf(...).map is not a function`, and
     the read came back a 500. The kernel coerces `limit`, `cursor` and `order` at the edge for
     exactly this reason and says so in a comment; `where` was left out of that fix. */
  for (const shape of [
    null,
    5,
    true,
    'state is open',
    [{ field: 'state', is: 'open' }],
    { all: { length: 1 } },
    { all: [null] },
    { any: 5 },
    { none: 'state is open' },
  ]) {
    const c = compile(shape as never, SCHEMA);
    assert.equal(c.bad[0]?.code, 'VALUE_MALFORMED', `${JSON.stringify(shape)} was not refused`);
    assert.equal(c.sql, '0 = 1', `${JSON.stringify(shape)} compiled to something that can match`);
    assert.deepEqual(c.params, []);
    assert.equal(evaluate(shape as never, ROWS[0]!.fields, SCHEMA), false, `${JSON.stringify(shape)} evaluated`);
  }
  // An absent filter is still every row, which is the one shape that is not a refusal.
  assert.equal(compile(undefined, SCHEMA).sql, '1 = 1');
});

test('A PREDICATE NESTS THREE GROUPS, and the fourth is a refusal rather than a RangeError', () => {
  /* `02-DATA-MODEL` §6 and `38-SPEC-WHERE` §5.3's rule G1 both say three levels, counting the root
     group as the first, and a fourth is `PREDICATE_TOO_DEEP`. There was no counter at all, and
     `PREDICATE_TOO_DEEP` had sat in `REFUSAL_CODES` since the first draft with nothing emitting it. */
  const three: Predicate = { all: [{ any: [{ none: [{ field: 'state', is: 'open' }] }] }] };
  assert.deepEqual(compile(three, SCHEMA).bad, [], 'three levels is the ceiling, not two');
  assert.deepEqual(both(three), ['b', 'c']);

  const four: Predicate = { all: [{ any: [{ none: [{ all: [{ field: 'state', is: 'open' }] }] }] }] };
  const c = compile(four, SCHEMA);
  assert.equal(c.bad[0]?.code, 'PREDICATE_TOO_DEEP');
  assert.equal(c.sql, '0 = 1');
  assert.equal(evaluate(four, ROWS[0]!.fields, SCHEMA), false);

  /* AND FOUR THOUSAND DEEP IS THE SAME REFUSAL, not a stack overflow, which is the shape a stranger
     sends because `JSON.parse` accepts it happily. The rule refuses WITHOUT DESCENDING, so the
     recursion never gets past the fourth frame. */
  let deep: Predicate = { field: 'state', is: 'open' };
  for (let i = 0; i < 4_000; i++) deep = { all: [deep] };
  assert.equal(compile(deep, SCHEMA).bad[0]?.code, 'PREDICATE_TOO_DEEP');
  assert.equal(evaluate(deep, ROWS[0]!.fields, SCHEMA), false);
});

/* -- a literal is the shape its type takes, and only that shape ----------- */

test('A BOOLEAN IS A BOOL LITERAL AND NO OTHER TYPE MAY TAKE ONE, and a number is not a day', () => {
  /* `typeof value === 'boolean'` sat ABOVE the `type === 'bool'` branch in `bind`, so it answered
     for `int`, `decimal`, `duration`, `day` and `instant` too. `{field: 'n', gt: false}` compiled to
     `json_extract(...,'$.n') > 0` and returned three rows while `evaluate` returned none, because
     `numeric()` there answers `null` for a boolean. The same gap from the other side is a number on
     a `day`: SQLite orders INTEGER before TEXT, so `{field: 'due', gt: 0}` was true of every dated
     row in SQL and true of none in JavaScript. A rule and the list behind it disagreeing about the
     same row is the failure this package exists to make impossible. */
  for (const leaf of [
    { field: 'n', is: true },
    { field: 'n', gt: false },
    { field: 'n', is: '3' },
    { field: 'due', gt: 0 },
    { field: 'due', is: 20_260_801 },
    { field: 'due', before: true },
    { field: 'n', lte: true },
    { field: 'due', between: ['2026-01-01', 20_261_231] },
  ]) {
    const c = compile(leaf as never, SCHEMA);
    assert.equal(c.bad[0]?.code, 'VALUE_MALFORMED', `${JSON.stringify(leaf)} compiled`);
    assert.equal(c.sql, '0 = 1', `${JSON.stringify(leaf)} compiled to something that can match`);
    assert.deepEqual(byJs(leaf as never), [], `${JSON.stringify(leaf)} evaluated`);
  }

  // And a `bool` still takes all four spellings, which is what the branch is for.
  assert.deepEqual(oddBoth({ field: 'open', is: true }), ['imported']);
  assert.deepEqual(oddBoth({ field: 'open', is: 'true' as never }), ['imported']);
  assert.deepEqual(oddBoth({ field: 'open', is: false }), ['listed']);
  assert.deepEqual(oddBoth({ field: 'open', is: 'false' as never }), ['listed']);
});

test('A MONEY LITERAL WITH A CURRENCY AND NO AMOUNT BOUND `undefined` INTO SQLITE', () => {
  /* `bind` returned `undefined` rather than `null` for an object with no `amount` key, and every
     guard downstream is `=== null` or `.filter((v) => v !== null)`, so it walked past all of them
     and `put(undefined)` pushed it into `params`, which is typed `(string | number)[]`.
     `carriesUnit` checks the CURRENCY half, so the literal passed the money guard on its way there,
     and `node:sqlite` answered `TypeError: Provided value cannot be bound to SQLite parameter 2`: a
     throw out of a read, on a body a caller can send. `MONEY_LITERAL_NEEDS_CURRENCY` is the wrong
     code for it, because the currency is present. */
  for (const leaf of [
    { field: 'amount', is: { currency: 'GBP' } },
    { field: 'amount', not: { currency: 'GBP' } },
    { field: 'amount', gt: { currency: 'GBP' } },
    { field: 'amount', lte: { currency: 'GBP' } },
    { field: 'amount', in: [{ currency: 'GBP' }] },
    { field: 'amount', not_in: [{ currency: 'GBP' }] },
    { field: 'amount', between: [{ currency: 'GBP' }, { currency: 'GBP' }] },
    { field: 'amount', is: { amount: '48000', currency: 'GBP' } },
    { field: 'effort', is: { unit: 'days' } },
  ]) {
    const c = compile(leaf as never, SCHEMA);
    assert.equal(c.bad[0]?.code, 'VALUE_MALFORMED', `${JSON.stringify(leaf)} was not refused`);
    assert.ok(!c.params.some((p) => p === undefined), `${JSON.stringify(leaf)} bound undefined`);
    // And it reaches SQLite without throwing, which is the whole of the complaint.
    const d = db();
    assert.equal(d.prepare(`SELECT id FROM entry WHERE ${c.sql}`).all(...(c.params as never[])).length, 0);
    d.close();
  }
});

test('A LOWER-CASE CURRENCY IS THE SAME CURRENCY, because the write path upper-cases it', () => {
  /* `coerce.ts:187` ends `currency: currency.toUpperCase()` and its `CURRENCY` test is
     `/^[A-Za-z]{3}$/`, so a row written with `gbp` is stored as `GBP` while a filter written with
     `gbp` was compared against a column that can never hold one: three rows for `GBP`, none for
     `gbp`, and an empty `bad` list both times. `evaluate` compared with `===` as well, so the two
     renderings agreed by both being wrong, which is the one disagreement the sweep at the bottom of
     this file cannot see. */
  assert.deepEqual(both({ field: 'amount', is: { amount: 24_000, currency: 'gbp' } }), ['b']);
  assert.deepEqual(both({ field: 'amount', is: { amount: 24_000, currency: 'Eur' } }), ['c']);
  assert.deepEqual(both({ field: 'amount', gte: { amount: 24_000, currency: 'gbp' } }), ['a', 'b', 'e']);
  assert.deepEqual(both({ field: 'amount', in: [{ amount: 24_000, currency: 'gbp' }] }), ['b']);
  assert.deepEqual(both({ field: 'amount', not: { amount: 24_000, currency: 'gbp' } }), ['a', 'd', 'e']);
  assert.deepEqual(both({ field: 'amount', not_in: [{ amount: 24_000, currency: 'gbp' }] }), ['a', 'd', 'e']);
  // A range written in one currency spelled two ways is one range, not `MIXED_CURRENCY`.
  assert.deepEqual(
    both({ field: 'amount', between: [{ amount: 20_000, currency: 'gbp' }, { amount: 30_000, currency: 'GBP' }] }),
    ['b'],
  );

  /* A UNIT IS NOT FOLDED, because it is not a code. `coerce` only trims it, `m` is metres and `M` is
     not, and answering a question about one with the other is the mistake a unit exists to stop. */
  assert.deepEqual(both({ field: 'effort', is: { value: 2, unit: 'days' } }), ['a']);
  assert.deepEqual(both({ field: 'effort', is: { value: 2, unit: 'DAYS' } }), []);
});

/* ── an instant, against the day a person named ──────────────────────────── */

test('AN INSTANT IS COMPARED BY ITS DAY, and `is` matched nothing while `not` matched everything', () => {
  /**
   * An `instant` is stored to the second and a day is ten characters, so `at is 2026-08-01`
   * compiled to `at = '2026-08-01'` against `'2026-08-01T11:57:00.000Z'` and matched NOTHING, on
   * every record, whatever it held. Its negation therefore matched EVERYTHING. The sentence grammar
   * resolves a relative word to a day, which is right; the comparison was never made day-granular
   * to meet it, and a differential pass against the browser's copy of this grammar is what found it.
   */
  assert.deepEqual(both({ field: 'at', is: '2026-08-01' }), ['a']);
  assert.deepEqual(both({ field: 'at', not: '2026-08-01' }), ['b', 'c', 'd', 'e']);
  assert.deepEqual(both({ field: 'at', in: ['2026-08-01', '2026-08-02'] }), ['a', 'b']);

  /* AND `before`/`after` ARE EXCLUSIVE OF THE DAY NAMED, which they were not: a same-day instant
     sorts after the ten characters of its own day, so `after` kept the rows `before` excluded. */
  assert.deepEqual(both({ field: 'at', before: '2026-08-02' }), ['a']);
  assert.deepEqual(both({ field: 'at', after: '2026-08-01' }), ['b']);

  /* A FULL TIMESTAMP IS STILL COMPARED AS ONE. The day rule is about the value somebody NAMED, and
     naming a second is naming a second. */
  assert.deepEqual(both({ field: 'at', is: '2026-08-01T11:57:00.000Z' }), ['a']);
});

/* ── `none:` over a field a row has nothing in ───────────────────────────── */

test("A `none:` KEEPS THE ROWS WITH NOTHING IN THE FIELD, and SQL dropped every one of them", () => {
  /**
   * `34 §1.3` and `02 §6` both say every positive operator is FALSE on a missing value, and
   * `02 §6` names the decision it rests on: *"SQL's three-valued surprises stop at the compiler."*
   * They did not stop at `is` or at `in`. `NULL = 'x'` is NULL, a `none:` group wraps its children
   * in `NOT (...)`, and `NOT NULL` is NULL rather than true, so the row vanished from a query that
   * should have kept it. Row `d` carries no `due`, no `amount` and no `n`, and it is exactly the
   * row a person asking "none of these" means to see.
   *
   * `both()` IS THE ASSERTION. The in-memory twin has always been two-valued, because it tests
   * `absent` before it compares, so this is a disagreement between the two renderings of one
   * grammar rather than a wrong answer in one of them. Every other positive operator in the file
   * already opens with the same guard; these two are the ones a person writes most.
   *
   * AND THE TEN `none` CASES ALREADY HERE COULD NOT SEE IT, because each of them names a field
   * every fixture row happens to carry. That is the shared-mistake failure this suite's own
   * comments are about, and it is why the assertions below name `d` rather than counting rows.
   */
  assert.ok(both({ none: [{ field: 'due', is: '2026-08-01' }] }).includes('d'), 'the undated row was dropped');
  assert.ok(both({ none: [{ field: 'n', is: 3 }] }).includes('d'), 'the row with no number was dropped');
  assert.ok(
    both({ none: [{ field: 'amount', is: { amount: 48_000, currency: 'GBP' } }] }).includes('d'),
    'the row with no amount was dropped',
  );
  assert.ok(both({ none: [{ field: 'due', in: ['2026-08-01', '2026-10-01'] }] }).includes('d'), 'an `in` dropped it too');

  /* AND THE POSITIVE FORM STILL EXCLUDES IT, which is the half that makes the negation mean
     something: a row with nothing in the field is not a match for a value. */
  assert.ok(!both({ field: 'due', is: '2026-08-01' }).includes('d'));
  assert.ok(!both({ field: 'due', in: ['2026-08-01', '2026-10-01'] }).includes('d'));
});

/* ── the `in` chunk ──────────────────────────────────────────────────────── */

test('AN `in:` GOES OUT IN CHUNKS OF SIXTY-FOUR, and it used to be one unbounded OR chain', () => {
  /**
   * `34 §1.10`'s limits table, `02 §6`'s operator table and `38 §5` step 3 all publish the same
   * number and nothing implemented it: a 250-value `in:` compiled to a single OR chain of 250
   * terms. Three documents describing a shape the compiler does not emit is the drift this suite
   * exists to catch, and the shape is the part a grammar can promise. An unbounded OR chain is an
   * unbounded expression tree, and expression depth is the one Durable Object ceiling `30 §13`
   * leaves unguarded, on the argument that the compiler's output is bounded by construction.
   *
   * IT IS NOT ABOUT THE PARAMETER COUNT, and the assertion below says so out loud. `38 §5` step 3
   * and `38 §7` are both explicit that chunking does not lower the total, and `38 §4.4` is explicit
   * that this function is not the layer that owes the ceiling: *"`compile` neither counts nor
   * refuses; `params.length` is on the result."* The hundred is the adapter's (`33 §1`), and the
   * count being on the result is what lets a caller see it.
   */
  const values = Array.from({ length: 130 }, (_, i) => `t${i}`);
  const c = compile({ field: 'what', in: values }, SCHEMA);
  assert.deepEqual(c.bad, [], c.bad[0]?.fix);

  /* 130 becomes 64, 64 and 2, which is `38 §5` step 3's own worked example. */
  const groups = c.sql.match(/\(\(json_extract\(fields, '\$\.what'\) = \?\)(?: OR \(json_extract\(fields, '\$\.what'\) = \?\))*\)/g) ?? [];
  assert.deepEqual(
    groups.map((g) => (g.match(/= \?/g) ?? []).length),
    [64, 64, 2],
    `the emitted shape is ${c.sql.slice(0, 140)}`,
  );

  /* AND THE COUNT IS UNCHANGED AND STILL ON THE RESULT, which is the half a caller reads. */
  assert.equal(c.params.length, 130);

  /* `not_in` CHUNKS THE OTHER WAY: each slice negated, the slices ANDed. De Morgan, so the rows do
     not move and only the shape does. */
  const n = compile({ field: 'what', not_in: values }, SCHEMA);
  assert.deepEqual(n.bad, []);
  assert.equal((n.sql.match(/NOT \(/g) ?? []).length, 3, `the emitted shape is ${n.sql.slice(0, 140)}`);
  assert.equal(n.params.length, 130);

  /* ONE SLICE IS THE STRING THIS BRANCH ALWAYS PRODUCED, so nothing short changed shape. */
  assert.equal(
    compile({ field: 'state', in: ['open', 'part'] }, SCHEMA).sql,
    '(state IS NOT NULL AND ((state = ?) OR (state = ?)))',
  );
});

test('AND CHUNKING MOVES NO ROWS, which is the only thing a shape change may not do', () => {
  /* A list that crosses a chunk boundary and holds one value the fixture actually has: if the
     slices were joined with the wrong word, or a slice were dropped, this is where it shows. */
  const filler = Array.from({ length: 70 }, (_, i) => `nothing-${i}`);
  assert.deepEqual(both({ field: 'what', in: [...filler, 'Hosting', ...filler] }), ['c']);
  assert.deepEqual(both({ field: 'what', not_in: [...filler, 'Hosting', ...filler] }), ['a', 'b', 'd', 'e']);
});

/* ── the six the record keeps for itself ─────────────────────────────────── */

test('`state` READS THE MIRRORED COLUMN, and the index it was mirrored for was used by nothing', () => {
  /**
   * `02 §1` raises the question, says that for a state machine it is not a detail but the whole
   * thing, and settles it in bold: `state` is mirrored, and the predicate compiles against the
   * COLUMN. `34 §1.2` and `38 §5.1` restate it. `fieldSql` had no exception in it, so every leaf
   * read `json_extract(fields, '$.state')`.
   *
   * THE ANSWERS WERE ALREADY RIGHT, which is why this asserts about the SQL and not about the
   * rows: the write path stores `state` in both places, so the JSON read returned the same value.
   * What it could not do is use `entry_state`, and `EXPLAIN QUERY PLAN` is the only witness to
   * that. `migrations/0001_kernel.ts` has created that index since the first migration.
   */
  assert.equal(fieldSqlIn(SCHEMA, 'state'), 'state');
  /* AND ONLY FOR THE REGISTER THAT MIRRORS IT. A register that declares an enum called `state` and
     names no state at all leaves the column NULL on every row, and reading it would match nothing
     where the JSON holds the answer. `fieldSql` alone, which is handed a name and no register,
     cannot tell the two apart and does not try. */
  assert.equal(fieldSqlIn({ register: SCHEMA.register, fields: SCHEMA.fields }, 'state'), "json_extract(fields, '$.state')");
  assert.equal(fieldSql('state', 'enum'), "json_extract(fields, '$.state')");
  const c = compile({ field: 'state', is: 'open' }, SCHEMA);
  assert.equal(c.sql, '(state IS NOT NULL AND state = ?)');

  const d = db();
  const plan = d
    .prepare(`EXPLAIN QUERY PLAN SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND ${c.sql}`)
    .all('obligations', ...(c.params as never[])) as { detail: string }[];
  d.close();
  assert.ok(
    plan.some((p) => p.detail.includes('entry_state')),
    `the planner did not reach entry_state: ${plan.map((p) => p.detail).join(' | ')}`,
  );
});

test('THE RECORD OWNS FIVE FIELDS A `where:` MAY NAME, and every one of them was FIELD_UNKNOWN', () => {
  /**
   * `02 §6`: *"Six kernel fields are addressable in any `where:` and any aggregation without being
   * declared: `id seq state created_at updated_at version`."* `34 §1.2` and `38 §4.3` item 13 say
   * it again, with the types. The schema the kernel builds is the declared fields and nothing
   * else, so `created_at after -7d`, which is *rows added this week*, was `FIELD_UNKNOWN` on every
   * register in the product.
   *
   * `both()` IS THE ASSERTION AND NOT `bySql`, and that is the whole difficulty of this one. The
   * in-memory rendering is handed a row's `fields`, and these five live in COLUMNS beside it. A
   * name the compiler can read and the evaluator cannot is the two-languages failure this package
   * exists to prevent, so an implementation that taught only the SQL side would pass a test
   * written with `bySql` and fail this one.
   */
  assert.deepEqual(both({ field: 'created_at', after: '2026-08-15T00:00:00.000Z' }), ['c', 'd', 'e']);
  assert.deepEqual(both({ field: 'created_at', before: '2026-08-15T00:00:00.000Z' }), ['a', 'b']);
  assert.deepEqual(both({ field: 'seq', gt: 3 }), ['d', 'e']);
  assert.deepEqual(both({ field: 'seq', in: [1, 5] }), ['a', 'e']);
  assert.deepEqual(both({ field: 'version', gte: 3 }), ['b', 'e']);
  assert.deepEqual(both({ field: 'updated_at', is: '2026-09-05' }), ['e']);
  assert.deepEqual(both({ field: 'id', in: ['a', 'c'] }), ['a', 'c']);
  assert.deepEqual(both({ field: 'id', present: true }), ['a', 'b', 'c', 'd', 'e']);

  /* THEY READ COLUMNS, and not a path into the JSON, which is where a row does not keep them. */
  assert.equal(
    compile({ field: 'created_at', after: '2026-01-01T00:00:00.000Z' }, SCHEMA).sql,
    '(created_at IS NOT NULL AND created_at > ?)',
  );

  /* AND THE REFUSAL FOR A NAME THAT IS STILL UNKNOWN TEACHES THE WHOLE VOCABULARY, which is
     `38 §6`'s sentence for it: a suggestion list without them says they do not exist. */
  const nope = compile({ field: 'nope', is: 'x' }, SCHEMA);
  assert.equal(nope.bad[0]?.code, 'FIELD_UNKNOWN');
  for (const name of ['id', 'seq', 'created_at', 'updated_at', 'version'])
    assert.ok((nope.bad[0]?.allowed ?? []).includes(name), `${name} is missing from the refusal`);
});

test('AND ASKING THE IN-MEMORY RENDERING ABOUT A COLUMN WITHOUT THE ROW IS A BUG IN THE CALLER', () => {
  /**
   * The alternative was to answer `false`, and it is worse than the `FIELD_UNKNOWN` it replaced.
   * A refusal is visible and a `false` about every row is not, and this rendering is what a rule
   * runs mid-write while `compile` is what the list behind it runs: the two answering differently
   * about one row is the disagreement nobody can reproduce. `jsonPath` near the top of the
   * source makes the same call for the same reason and states it: a backstop that returns a value
   * can be ignored.
   */
  assert.throws(
    () => evaluate({ field: 'created_at', after: '2026-01-01T00:00:00.000Z' }, ROWS[0]!.fields, SCHEMA),
    /column of the row/,
  );
  /* NESTED TOO, because `any:` stops at its first true child: a check made where the leaf is read
     would fire on some rows and not on others, and an exception that depends on the data is worse
     than either answering or refusing. */
  assert.throws(
    () => evaluate({ any: [{ field: 'state', is: 'open' }, { field: 'seq', gt: 1 }] }, ROWS[0]!.fields, SCHEMA),
    /column of the row/,
  );
  /* AND A PREDICATE THE COMPILER ALREADY REFUSES IS STILL A `false` rather than a throw: an
     unreadable predicate is a refusal at this boundary, and only a readable one the caller
     under-supplied is a bug in the caller. */
  assert.equal(evaluate({ field: 'seq', contains: 'x' }, ROWS[0]!.fields, SCHEMA), false);
  /* AND THE THREE-ARGUMENT CALL STILL ANSWERS EVERYTHING IT USED TO. `state` is written to the
     column and into `fields` on the same statement, so the half a caller hands over is enough. */
  assert.equal(evaluate({ field: 'state', is: 'open' }, ROWS[0]!.fields, SCHEMA), true);
});
