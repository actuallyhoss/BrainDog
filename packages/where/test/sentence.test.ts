/**
 * `where:` as a sentence, and the four ways a sentence can be well-formed and wrong.
 *
 * Every assertion about a REFUSAL here is about a clause that used to parse cleanly and match
 * everything — which is the worst failure a declarative surface can have, because the block draws
 * the whole register and looks exactly like a block that filtered. The thing writing most of these
 * declarations is an agent, and an agent cannot see the difference.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, evaluate, fieldSql, parseWhere, resolveDay, type Schema } from '../src/index.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS: Schema = {
  register: 'obligations',
  fields: {
    what: { type: 'text' },
    /* WITH THE LABEL THE SCREEN SHOWS, which is what a page prints its filter back with. */
    direction: { type: 'enum', values: ['owed_by_me', 'owed_to_me'], label: 'Which way' },
    state: { type: 'enum', values: ['open', 'part', 'paid', 'written_off'] },
    amount: { type: 'money' },
    due: { type: 'day' },
    n: { type: 'int' },
    thing: { type: 'ref', to: 'things' } as never,
    urgent: { type: 'bool' },
  },
};

const THINGS: Record<string, string> = { Kiln: '01ABCDEFGHJKMNPQRSTVWXYZ00', 'Marlow & Co': '01ABCDEFGHJKMNPQRSTVWXYZ01' };
const deps = { nowMs: NOW, refByTitle: (register: string, title: string) => (register === 'things' ? THINGS[title] ?? null : null) };

const parse = (text: string) => parseWhere(text, OBLIGATIONS, deps);
const good = (text: string) => {
  const out = parse(text);
  assert.deepEqual(out.bad.map((b) => b.fix), [], `${text} was refused`);
  return out.predicate;
};
const bad = (text: string) => {
  const out = parse(text);
  assert.ok(out.bad.length > 0, `${text} was accepted`);
  /* THE SECOND ASSERTION USED TO BE `predicate === undefined`, WHICH THE FIRST ONE GUARANTEES.
     `parseWhere` returns `{ predicate: undefined, bad }` on every path where `bad` is non-empty, so
     once the line above holds the line below cannot fail, and every refusal case in this file goes
     through this helper. What is worth asserting about a refusal is that it CARRIES something a
     caller can act on: `10 §7`'s fourth rule is that the refusal is the teacher, and a code with an
     empty sentence teaches nothing. */
  const said = out.bad[0]!;
  assert.match(said.code, /^[A-Z][A-Z0-9_]+$/u, `${text} was refused with ${JSON.stringify(said.code)}`);
  assert.ok(said.fix.trim().length > 0, `${text} was refused with no sentence`);
  return said;
};

/* ── the grammar ─────────────────────────────────────────────────────────── */

test('THE SENTENCE COMPILES TO THE PREDICATE THE STRUCTURED FORM PRODUCES', () => {
  // Which is the whole reason it is in this package: a declaration is read by the record, by the
  // interface and by an agent, and a sentence one of them parses and another cannot is two
  // languages — the one that drifts being the one nobody is testing.
  assert.deepEqual(good('state is open'), { field: 'state', is: 'open' });
  assert.deepEqual(good('state is open or part'), { field: 'state', in: ['open', 'part'] });
  assert.deepEqual(good('state is not paid'), { field: 'state', not: 'paid' });
  assert.deepEqual(good('state is not paid or written off'), { field: 'state', not_in: ['paid', 'written_off'] });
  assert.deepEqual(good('due before 2026-10-01'), { field: 'due', before: '2026-10-01' });
  assert.deepEqual(good('due on 2026-10-01'), { field: 'due', is: '2026-10-01' });

  // Clauses are ANDed on the comma.
  assert.deepEqual(good('direction is owed to me, state is open'), {
    all: [
      { field: 'direction', is: 'owed_to_me' },
      { field: 'state', is: 'open' },
    ],
  });
});

test('AN ENUM IS WRITTEN IN THE WORDS A SCREEN SHOWS', () => {
  // `owed to me` is what a person reads and `owed_to_me` is what the column holds. A stored form
  // that is not also the readable form makes `where:` a second language somebody has to learn.
  assert.deepEqual(good('direction is owed to me'), { field: 'direction', is: 'owed_to_me' });
  assert.deepEqual(good('direction is owed_to_me'), { field: 'direction', is: 'owed_to_me' }, 'the stored form is accepted too');
  assert.deepEqual(good('direction is OWED TO ME'), { field: 'direction', is: 'owed_to_me' });
});

test('and a ref is written by NAME, because that is what a person says', () => {
  assert.deepEqual(good('thing is Kiln'), { field: 'thing', is: THINGS.Kiln });
  assert.deepEqual(good('thing is Kiln or Marlow & Co'), { field: 'thing', in: [THINGS.Kiln, THINGS['Marlow & Co']] });
});

test('a bool takes the words a person would use for one', () => {
  assert.deepEqual(good('urgent is yes'), { field: 'urgent', is: 'true' });
  assert.deepEqual(good('urgent is false'), { field: 'urgent', is: 'false' });
  assert.equal(bad('urgent is maybe').code, 'VALUE_MALFORMED');
});

/* ── the four that parsed and were wrong ─────────────────────────────────── */

test('`state is not done` IS A REFUSAL, because obligations have no such state', () => {
  /* This was true of every row in the register: `done` is a TASK state, the clause was well-formed,
     and nothing anywhere said the filter had done nothing. A grammar check tells you a sentence is
     a sentence; it does not tell you the sentence is about anything. */
  const out = bad('state is not done');
  assert.equal(out.code, 'ENUM_VALUE_UNKNOWN');
  assert.match(out.fix, /has no value done/);
  assert.deepEqual(out.allowed, ['open', 'part', 'paid', 'written off']);
});

test('a relative day is resolved to an absolute one, so it compares as a date', () => {
  /* `due after -7d` compared the operand as a string, and `'2' > '-'` is true — so it matched all
     thirty-eight rows. `due before +30d` did the same in the other direction and matched none.
     Resolving before the compiler sees it is what makes the comparison a comparison. */
  assert.deepEqual(good('due after -7d'), { field: 'due', after: '2026-08-29' });
  assert.deepEqual(good('due before +30d'), { field: 'due', before: '2026-10-05' });
  assert.deepEqual(good('due before eom'), { field: 'due', before: '2026-09-30' });
  assert.deepEqual(good('due after today'), { field: 'due', after: '2026-09-05' });
});

test('THE TEMPORAL LITERALS ARE THE SET THE DATA MODEL SETTLED ON, and a month is clamped', () => {
  assert.equal(resolveDay('today', NOW), '2026-09-05');
  assert.equal(resolveDay('tomorrow', NOW), '2026-09-06');
  assert.equal(resolveDay('yesterday', NOW), '2026-09-04');
  assert.equal(resolveDay('bom', NOW), '2026-09-01');
  assert.equal(resolveDay('eom', NOW), '2026-09-30');
  assert.equal(resolveDay('boy', NOW), '2026-01-01');
  assert.equal(resolveDay('eoy', NOW), '2026-12-31');
  assert.equal(resolveDay('2026-02-11', NOW), '2026-02-11');
  assert.equal(resolveDay('next tuesday', NOW), null);

  /* CLAMPED, because adding to the month number rolls 31 January into 3 March and nobody means that
     by "a month". The same arithmetic `expandRepeat` uses, for the same reason. */
  const jan31 = Date.UTC(2026, 0, 31, 12);
  assert.equal(resolveDay('+1m', jan31), '2026-02-28');
  assert.equal(resolveDay('+2m', jan31), '2026-03-31');

  /**
   * AND A YEAR IS NOT A UNIT. `34 §1.1`'s EBNF is `unit = "d" | "w" | "m"`, and this test used to
   * assert `-1y` resolving — an assertion that a fourth spelling exists, in a grammar table that
   * does not have it and in one of the two implementations only. The browser's compiler refused
   * `+2y` while this one turned it into a real date two years out, so the same declaration meant
   * different things to a person and to an agent. The test was asserting the divergence.
   */
  assert.equal(resolveDay('-1y', NOW), null);
  assert.equal(resolveDay('+2y', NOW), null);
});

/* ── what cannot be resolved is refused ──────────────────────────────────── */

test('a field the register does not have, and an operator a predicate does not say', () => {
  const field = bad('colour is red');
  assert.equal(field.code, 'FIELD_UNKNOWN');
  assert.ok((field.allowed ?? []).includes('state'), 'the refusal does not say what the register does have');

  // `MATCH_OP_UNSUPPORTED` is `30 §6`'s code for it, and the structured compiler answers the same
  // one for the same leaf: two renderings of one grammar that refuse under two names are two
  // languages again, which is what this whole module exists not to be.
  assert.equal(bad('state equals open').code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(bad('state is').code, 'REQUIRED_MISSING');
});

test('`before` on something that is not a date is refused rather than compared as text', () => {
  const out = bad('what before 2026-10-01');
  assert.equal(out.code, 'MATCH_OP_UNSUPPORTED');
  assert.match(out.fix, /is a text, and before is about dates/);
});

test('a name no row bears is a refusal, not a clause that matches nothing quietly', () => {
  const out = bad('thing is Atlantis');
  /* `REF_UNKNOWN`, AND IT IS ITS OWN CODE RATHER THAN A `VALUE_MALFORMED` — which it very nearly
     became, since that row already reads "an unresolvable id or spoken reference". `declare` lints
     a rule's `when:` and survives exactly this refusal and no other, because `owner is Kiln` names a
     row that may be written tomorrow. Merging them would make the exemption swallow a real shape
     error and install a rule that fires on nothing, for ever, in silence. Two refusals are one when
     no caller has to tell them apart; here one does. */
  assert.equal(out.code, 'REF_UNKNOWN');
  assert.match(out.fix, /no things called Atlantis/);
});

test('AN EMPTY SENTENCE IS NO FILTER, and a broken one is no predicate at all', () => {
  // The two must not both be `{}`: one means every row and the other means run nothing.
  assert.equal(parseWhere(undefined, OBLIGATIONS, deps).predicate, undefined);
  assert.equal(parseWhere('   ', OBLIGATIONS, deps).predicate, undefined);
  assert.equal(parseWhere('colour is red', OBLIGATIONS, deps).predicate, undefined);
  assert.equal(parseWhere('colour is red', OBLIGATIONS, deps).bad.length, 1);
});

test('and one bad clause refuses the whole sentence rather than half of it', () => {
  // Half a predicate is a filter that silently widened: the rows it lets through are not the rows
  // the declaration asked for, and they look exactly like they are.
  const out = parseWhere('state is open, colour is red', OBLIGATIONS, deps);
  assert.equal(out.predicate, undefined);
  assert.equal(out.bad.length, 1);
});

/* ── it runs ─────────────────────────────────────────────────────────────── */

test('THE PARSED PREDICATE COMPILES AND EVALUATES, both, over the same rows', () => {
  // The point of producing the structured form rather than SQL: both renderings read it.
  const p = good('direction is owed to me, state is open or part, due before today');
  const sql = compile(p, OBLIGATIONS);
  assert.deepEqual(sql.bad, []);
  assert.ok(sql.sql.includes('json_extract'));

  const late = { direction: 'owed_to_me', state: 'open', due: '2026-08-01' };
  const paid = { direction: 'owed_to_me', state: 'paid', due: '2026-08-01' };
  const future = { direction: 'owed_to_me', state: 'open', due: '2026-12-01' };
  assert.equal(evaluate(p, late, OBLIGATIONS), true);
  assert.equal(evaluate(p, paid, OBLIGATIONS), false);
  assert.equal(evaluate(p, future, OBLIGATIONS), false);
});

/* -- the spoken form resolves what the structured form resolves ----------- */

test('`due is today` AND `due is not today` RESOLVE THE DAY, which is what the JSON form already did', () => {
  /* `resolve()` handled `enum`, `ref` and `bool` and handed back the raw word for everything else,
     and only the `before` / `after` / `on` branch called `resolveDay`. So `due is not today`
     compiled to `(due IS NULL OR NOT (due = 'today'))`, and since `'2026-09-05' = 'today'` is false
     of every row the negation was true of every row: the whole register, out of a filter that
     looked like it had worked. `due is today` was its mirror and matched nothing.

     THE STRUCTURED FORM WAS ALREADY RESOLVED, which is what makes this a disagreement rather than a
     gap: `resolveRelative` in the kernel's `metrics.ts` has `is` and `not` in its `DATED` list, so
     `{due, not: 'today'}` answered correctly over the same rows while the sentence did not. */
  assert.deepEqual(good('due is today'), { field: 'due', is: '2026-09-05' });
  assert.deepEqual(good('due is not today'), { field: 'due', not: '2026-09-05' });
  assert.deepEqual(good('due is +30d'), { field: 'due', is: '2026-10-05' });
  assert.deepEqual(good('due is eom or boy'), { field: 'due', in: ['2026-09-30', '2026-01-01'] });
  assert.deepEqual(good('due is 2026-10-01'), { field: 'due', is: '2026-10-01' });

  // And a word no clock can read is a refusal rather than a clause that matches everything.
  assert.equal(bad('due is soon').code, 'VALUE_MALFORMED');
  assert.equal(bad('due is not soon').code, 'VALUE_MALFORMED');
  assert.equal(bad('due is 2026-13-45').code, 'VALUE_MALFORMED');

  /* AND THE CLAUSE ANSWERS THE ROWS IT SAYS IT DOES. The register coming back whole is the failure,
     so the test that matters is over rows and not over the predicate shape. */
  const rows = [
    { id: 'today', fields: { due: '2026-09-05' } },
    { id: 'later', fields: { due: '2026-12-01' } },
    { id: 'never', fields: {} },
  ];
  const of = (text: string): string[] =>
    rows.filter((r) => evaluate(good(text), r.fields, OBLIGATIONS)).map((r) => r.id);
  assert.deepEqual(of('due is today'), ['today']);
  assert.deepEqual(of('due is not today'), ['later', 'never']);
});

test('AND A NUMBER IS A NUMBER, because SQLite answers false to `3 = \'3\'`', () => {
  /* The same line stringing an integer: `parseWhere('n is 3')` yielded `{field: 'n', is: '3'}`, and
     SQLite compares across storage classes, so the one row holding three was the one row the filter
     could not find. `n is not 3` was its mirror and returned the register. */
  assert.deepEqual(good('n is 3'), { field: 'n', is: 3 });
  assert.deepEqual(good('n is not 3'), { field: 'n', not: 3 });
  assert.deepEqual(good('n is 3 or 9'), { field: 'n', in: [3, 9] });
  assert.deepEqual(good('n is -2'), { field: 'n', is: -2 });
  assert.equal(bad('n is three').code, 'VALUE_MALFORMED');
  assert.equal(bad('n is 3.5').code, 'VALUE_MALFORMED');
  assert.equal(bad('n is').code, 'REQUIRED_MISSING');

  const rows = [{ id: 'three', fields: { n: 3 } }, { id: 'nine', fields: { n: 9 } }];
  assert.deepEqual(
    rows.filter((r) => evaluate(good('n is 3'), r.fields, OBLIGATIONS)).map((r) => r.id),
    ['three'],
  );
  // And it compiles, rather than being refused by `bind` for the type it is.
  assert.deepEqual(compile(good('n is 3'), OBLIGATIONS).bad, []);
  assert.deepEqual(compile(good('n is 3'), OBLIGATIONS).params, [3]);
});

test('A VERB OFF `Object.prototype` IS NOT A VERB, and it used to parse clean', () => {
  /* `ORDERED` is an object literal, so `'constructor' in ORDERED` is true, and `toString` and
     `valueOf` are too. `due constructor 2026-10-01` therefore parsed with an EMPTY `bad` list and
     became `{field: 'due', constructor: '2026-10-01'}`. `compile` refuses that later, but
     `evaluate` merely answers false and the kernel's rule lint reads only `bad`, so a rule carrying
     it installed clean and then fired on nothing, for ever, with nothing anywhere saying so.
     `Object.hasOwn` is what the same file already uses for `schema.fields`, ten lines up. */
  for (const verb of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    const out = parse(`due ${verb} 2026-10-01`);
    assert.equal(out.bad[0]?.code, 'MATCH_OP_UNSUPPORTED', `due ${verb} 2026-10-01 parsed clean`);
    assert.equal(out.predicate, undefined);
  }
  // The three real ones still parse, which is what the table is for.
  assert.deepEqual(good('due before 2026-10-01'), { field: 'due', before: '2026-10-01' });
  assert.deepEqual(good('due after 2026-10-01'), { field: 'due', after: '2026-10-01' });
  assert.deepEqual(good('due on 2026-10-01'), { field: 'due', is: '2026-10-01' });
});

test('A FILTER THAT IS NOT A SENTENCE IS A REFUSAL, and it used to be a TypeError out of the read', () => {
  /* `if (!text?.trim())` guards `null` and `undefined` and nothing else, and `packages/host`
     JSON-decodes every query value, so `?where={"length":1}` reached `.trim` and came back out of
     `k.list` as `TypeError: text?.trim is not a function`. A 500 on a read a stranger can send. */
  for (const shape of [{ length: 1 }, 5, true, ['state is open'], { all: [] }]) {
    const out = parseWhere(shape as never, OBLIGATIONS, deps);
    assert.equal(out.bad[0]?.code, 'VALUE_MALFORMED', `${JSON.stringify(shape)} was not refused`);
    assert.equal(out.predicate, undefined);
  }
  // `null` and `undefined` are still no filter at all, which is not the same as a broken one.
  assert.deepEqual(parseWhere(null as never, OBLIGATIONS, deps), { predicate: undefined, bad: [] });
  assert.deepEqual(parseWhere(undefined, OBLIGATIONS, deps), { predicate: undefined, bad: [] });
});

/* ── the sentence a page prints back ─────────────────────────────────────── */

test('A FIELD IS FOUND BY ITS LABEL, and the sentence a page prints was FIELD_UNKNOWN', () => {
  /**
   * A page prints its own `where:` back to the reader using each field's LABEL, so
   * `direction is owed_to_me` appears on screen as `which way is owed to me`. Typed back, or pasted
   * back, that was `FIELD_UNKNOWN: obligations has no field called which` - and a label is more than
   * one word, so the parser had also taken the wrong number of words for the field. Seven of the
   * eleven filters the shipped pages print could not be read by the record that printed them. The
   * browser's copy of this grammar has accepted labels all along, which is why nobody noticed.
   */
  const byId = parse('direction is owed_to_me');
  const byLabel = parse('which way is owed to me');
  assert.deepEqual(byLabel.bad, [], byLabel.bad[0]?.fix);
  assert.deepEqual(byLabel.predicate, byId.predicate);

  /* CASE FOLDED, because `Which way` is how it is printed and `which way` is how it is typed. */
  assert.deepEqual(parse('Which Way is owed to me').predicate, byId.predicate);

  /* AND THE ID STILL WINS, EXACTLY, so a label somebody chooses tomorrow cannot shadow a filter
     that works today. */
  assert.deepEqual(parse('state is open').predicate, { field: 'state', is: 'open' });
});

test('and `or` separates alternatives however it is capitalised', () => {
  /* A page prints `state is open or part` and a person types `state is open OR part`. `Or` is not a
     value any register declares, so reading it as one gave `ENUM_VALUE_UNKNOWN` over a sentence that
     is ordinary English. */
  const lower = parse('state is open or part');
  const upper = parse('state is open OR part');
  assert.deepEqual(upper.bad, [], upper.bad[0]?.fix);
  assert.deepEqual(upper.predicate, lower.predicate);
});

/* ── the one string the index, the filter and the sort all have to be ────── */

test('`fieldSql` IS ONE STRING FOR THREE PLACES, and nothing was asking it anything', () => {
  /**
   * It is exported for one reason, and `31 §2` states it in these terms: this package owns
   * `jsonPath`, so `CREATE INDEX ... json_extract(fields,'$.due')` and
   * `WHERE json_extract(fields,'$.due') < ?` are the same string, which is the difference between
   * the planner using the partial expression index and scanning it. An `ORDER BY` is the third
   * place, and the kernel calls this for it.
   *
   * NO TEST ANYWHERE EXERCISED IT. The whole value of the export is that three call sites cannot
   * drift apart, and the only thing holding them together was that one function is one function.
   */
  assert.equal(fieldSql('due', 'day'), "json_extract(fields, '$.due')");

  /* A MONEY SORTS BY ITS NUMBER, which is the reason this is a function rather than a caller
     building a path: sorting the object sorts the JSON text, so `GBP 9.00` lands above
     `GBP 10.00`. */
  assert.equal(fieldSql('amount', 'money'), "json_extract(fields, '$.amount.amount')");
  assert.equal(fieldSql('effort', 'quantity'), "json_extract(fields, '$.effort.value')");

  /* AND THE FILTER AND THE SORT ARE THE SAME STRING, which is the claim rather than either half of
     it. `compile` builds the filter through this function, so the sort the kernel writes has to
     appear in the SQL the filter produces, character for character. */
  const c = compile({ field: 'amount', gt: { amount: 1, currency: 'GBP' } }, OBLIGATIONS);
  assert.deepEqual(c.bad, [], c.bad[0]?.fix);
  assert.ok(c.sql.includes(fieldSql('amount', 'money')), `the filter reads ${c.sql}`);

  /* AN EXPLICIT PART WINS OVER THE TYPE'S OWN, which is how the qualifier half is reached. */
  assert.equal(fieldSql('amount', 'money', '.currency'), "json_extract(fields, '$.amount.currency')");
});
