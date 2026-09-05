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

import { compile, evaluate, parseWhere, resolveDay, type Schema } from '../src/index.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS: Schema = {
  register: 'obligations',
  fields: {
    what: { type: 'text' },
    direction: { type: 'enum', values: ['owed_by_me', 'owed_to_me'] },
    state: { type: 'enum', values: ['open', 'part', 'paid', 'written_off'] },
    amount: { type: 'money' },
    due: { type: 'day' },
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
  assert.equal(out.predicate, undefined, 'a refused sentence produced a predicate anyway');
  return out.bad[0]!;
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
  assert.equal(resolveDay('-1y', NOW), '2025-09-05');
});

/* ── what cannot be resolved is refused ──────────────────────────────────── */

test('a field the register does not have, and an operator a predicate does not say', () => {
  const field = bad('colour is red');
  assert.equal(field.code, 'FIELD_UNKNOWN');
  assert.ok((field.allowed ?? []).includes('state'), 'the refusal does not say what the register does have');

  assert.equal(bad('state equals open').code, 'OPERATOR_UNSUPPORTED');
  assert.equal(bad('state is').code, 'REQUIRED_MISSING');
});

test('`before` on something that is not a date is refused rather than compared as text', () => {
  const out = bad('what before 2026-10-01');
  assert.equal(out.code, 'OPERATOR_UNSUPPORTED');
  assert.match(out.fix, /is a text, and before is about dates/);
});

test('a name no row bears is a refusal, not a clause that matches nothing quietly', () => {
  const out = bad('thing is Atlantis');
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
