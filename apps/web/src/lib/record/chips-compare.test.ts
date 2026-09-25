/**
 * THE SIX COMPARE WORDS, CARRIED BY A CHIP, and the chips joined by "or" under one address word.
 *
 * `where.ts` reads `more than`, `at least`, `less than`, `at most`, `between` and `contains`, and a
 * chip could say none of them: `whereOf` read seven chip operators and sent every other one to its
 * last line, `<field> is <value>`. Measured before the fix, on the seed's obligations:
 * `amount at least GBP 2400` admits 25 of 40 rows, and the chip `amount:gte:GBP 2400` came back as
 * `amount is GBP 2400`, which drew none. `what contains rent` admits three, and `what:contains:rent`
 * came back as `what is rent`, which drew none either.
 *
 * THE CHIPS ARE READ THROUGH `chipsOf`, the route's own parser, never through a copy of it, which is
 * the rule `list-chips.test.ts` gives its reasons for.
 *
 * THE LIST ON A RECORD DOES NOT READ CHIPS THROUGH `whereOf`, which is why this file's last test was
 * a tripwire. `treeOf` in `remote.ts` turns each chip into one of the record's leaves on its own,
 * and it read neither the six words nor the join: the minted `amount:gte:GBP 2400` reached the record
 * as `{ field: 'amount', is: 'GBP 2400' }` and was refused `MONEY_LITERAL_NEEDS_CURRENCY`. It reads
 * both now, and `remote-compare.test.ts` holds it to the sample's rows on a real kernel.
 *
 * AND `registerHref` STILL HANDS OVER THE WIDE ADDRESS FOR THESE, which the last test holds, for the
 * reasons written above its guards in `where.ts`: the register route never reads `join`, and two
 * other test files pin the wide address.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { chipsOf, joinOf, whereOf } from './api.ts';
import { list } from './fixtures/readers.ts';
import { NOW, REGISTERS, ROWS } from './fixtures/sample.ts';
import { treeOf } from './remote.ts';
import { compile, matches, registerHref, type Clause } from './where.ts';

/** A clause as a chip, spelled the way `registerHref` spells every other one: the compiled operator, the value encoded. */
const chipOf = (c: Clause): string => {
  const said = 'day' in c ? c.day : c.values.join(',');
  return `f=${c.field}:${c.op}:${encodeURIComponent(said)}`;
};

/** The rows a sentence admits in the sample, in `seq` order. */
const admitted = (register: string, sentence: string): number[] =>
  (ROWS[register] ?? [])
    .filter((e) => matches(e, compile(register, sentence), NOW))
    .map((e) => e.seq)
    .sort((a, b) => a - b);

/** The rows an address opens, read the way the register route reads one. */
const opened = (register: string, query: string, join?: 'any'): { said: string; seqs: number[] } => {
  const filters = chipsOf(new URLSearchParams(query));
  const said = whereOf(filters, join);
  const w = compile(register, said);
  return {
    said,
    seqs: (ROWS[register] ?? [])
      .filter((e) => matches(e, w, NOW))
      .map((e) => e.seq)
      .sort((a, b) => a - b),
  };
};

test('A COMPARE CHIP READS BACK AS THE CLAUSE IT WAS SPELLED FROM, for every ordered and every text field in the mirror', () => {
  /* THE BOUNDS ARE WORDS EACH TYPE TAKES, and the sweep is over the declarations rather than a few
     hand-picked fields, so a type added to `ORDERED` with no reader here shows up as a failure. */
  const one: Record<string, string> = { int: '3', duration: '3', decimal: '0.5', money: 'GBP 2400', quantity: '5 kg', day: 'today', instant: 'today' };
  const two: Record<string, string> = { int: '1 and 5', duration: '1 and 5', decimal: '0.1 and 0.9', money: 'GBP 10 and GBP 2400', quantity: '1 kg and 5 kg', day: 'today and +30d', instant: '-30d and today' };
  const textual = new Set(['text', 'document', 'url', 'email']);
  let swept = 0;
  for (const [register, decl] of Object.entries(REGISTERS)) {
    for (const field of decl.fields) {
      const sentences: string[] = [];
      if (one[field.type]) {
        for (const word of ['more than', 'at least', 'less than', 'at most']) sentences.push(`${field.id} ${word} ${one[field.type]}`);
        sentences.push(`${field.id} between ${two[field.type]}`);
      }
      if (textual.has(field.type)) {
        /* A NEEDLE THE SEED HOLDS, so the rows are a real answer and not always none. */
        const held = (ROWS[register] ?? []).map((e) => e.fields[field.id]).find((v): v is string => typeof v === 'string' && /[a-z]{3}/i.test(v));
        const needle = held ? /[a-z]{3,}/i.exec(held)![0] : 'the';
        sentences.push(`${field.id} contains ${needle}`);
      }
      for (const sentence of sentences) {
        const w = compile(register, sentence);
        assert.deepEqual(w.bad, [], `${register}: ${sentence} did not compile, so the sweep is not asking what it means to`);
        /* A RANGE OF DAYS IS TWO CLAUSES, `gte` AND `lte`, AND THEREFORE TWO CHIPS, which is how the
           record spells it; the two ANDed read back to the same pair. */
        const back = opened(register, w.clauses.map(chipOf).join('&'));
        assert.deepEqual(compile(register, back.said).clauses, w.clauses, `${register}: ${sentence} came back as ${back.said}`);
        assert.deepEqual(back.seqs, admitted(register, sentence), `${register}: ${sentence} opened other rows than it admits`);
        swept += 1;
      }
    }
  }
  assert.ok(swept >= 200, `only ${swept} clauses were swept, so this test stopped measuring anything`);
});

test('the two cases measured before the fix open the rows their sentences admit', () => {
  const amount = opened('obligations', 'f=amount:gte:GBP%202400');
  assert.equal(amount.said, 'amount at least GBP 2400');
  assert.deepEqual(amount.seqs, admitted('obligations', 'amount at least GBP 2400'));
  assert.equal(amount.seqs.length, 25, 'the seed moved, so the measurement in the header is stale');

  const rent = opened('obligations', 'f=what:contains:rent');
  assert.equal(rent.said, 'what contains rent');
  assert.equal(rent.seqs.length, 3, 'the seed moved, so the measurement in the header is stale');

  /* AND `between` WITH ONE VALUE IS THE COMPILER'S REFUSAL, not a range that quietly lost its top. */
  assert.match(compile('obligations', opened('obligations', 'f=amount:between:GBP%2010').said).bad.join(' '), /between takes two values/);
});

test('UNDER join=any THE CHIPS ARE JOINED WITH ", or", and read back as the or-group they came from', () => {
  const sentence = 'state is open, or due before today';
  const w = compile('tasks', sentence);
  assert.deepEqual(w.bad, []);
  assert.ok(w.any, 'the sentence is no longer an or-group, so this test asks nothing');
  const query = w.any.map((member) => member.map(chipOf).join('&')).join('&');

  /* `due` IS THE LABEL OF THE FIELD `by`, and the chip carries the id, so the sentence it reads back
     as names `by`: the same clauses, which is what is compared. */
  const any = opened('tasks', query, 'any');
  assert.equal(any.said, 'state is open, or by before today');
  assert.deepEqual(compile('tasks', any.said).any, w.any);
  assert.deepEqual(any.seqs, admitted('tasks', sentence));

  /* WITHOUT THE WORD THEY ARE ANDED, as every address written before it is. */
  assert.equal(opened('tasks', query).said, 'state is open, by before today');
  assert.notDeepEqual(opened('tasks', query).seqs, any.seqs, 'the seed answers the same rows either way, so this test cannot tell "and" from "or"');
});

test('THE RECORD’S READER HOLDS BOTH NOW, and registerHref stays wide until the route reads the join', () => {
  /* THE TRIPWIRE, FLIPPED. These two held the old answers, `{ field: 'amount', is: 'GBP 2400' }` and
     an `all` group, and failed the day `treeOf` learnt the words, as they were written to. What they
     hold now is the record's own literal, the money in minor units with its currency, and an `any`. */
  assert.deepEqual(treeOf('obligations', chipsOf(new URLSearchParams('f=amount:gte:GBP%202400')), '', new Map()), {
    field: 'amount',
    gte: { amount: 240000, currency: 'GBP' },
  });
  assert.deepEqual(treeOf('obligations', chipsOf(new URLSearchParams('f=what:contains:rent')), '', new Map()), { field: 'what', contains: 'rent' });
  const params = new URLSearchParams('f=state:in:open&f=by:before:today&join=any');
  assert.deepEqual(treeOf('tasks', chipsOf(params), '', new Map(), joinOf(params)), {
    any: [
      { field: 'state', is: 'open' },
      { field: 'by', before: 'today' },
    ],
  });

  assert.equal(registerHref('obligations', 'amount at least GBP 2400'), '/r/obligations');
  assert.equal(registerHref('obligations', 'what contains rent'), '/r/obligations');
  assert.equal(registerHref('tasks', 'state is open, or due before today'), '/r/tasks');
});
