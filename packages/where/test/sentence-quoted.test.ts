/**
 * A value in quotes is one value, wherever it sits in a sentence.
 *
 * THE COMMA SPLIT A NAME IN TWO. A clause ends at a comma, so `part is Wax, wick and scent` was the clause `part is Wax`
 * and a second clause asking for a field called `wick`, refused `FIELD_UNKNOWN`. That is the sentence a template page
 * writes for a row with that name (`fill` in `packages/kernel/src/pages.ts`), so every block filtered by the name on its
 * page was refused. Quoting is how this grammar already says "these words are text" (`contains "uber or lyft"`), so a
 * quoted value is read whole after `is`, `is not`, `has` and `lacks`, and a comma inside the marks does not end the
 * clause. `quoteValue` writes a value the way this reads it, and writes it bare where the bare words already read back
 * as that one value, so a filter a page prints stays the filter it always printed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseWhere, quoteValue, type Schema } from '../src/index.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const deps = { nowMs: NOW };

const PARTS: Schema = {
  register: 'parts',
  fields: {
    name: { type: 'text' },
    kind: { type: 'enum', values: ['wax', 'box'] },
    tags: { type: 'list', of: 'text' },
    n: { type: 'int' },
  },
};

const parse = (s: string) => parseWhere(s, PARTS, deps);

test('A QUOTED VALUE HOLDING A COMMA IS ONE VALUE, and the clause after it is still a clause', () => {
  assert.deepEqual(parse('name is "Wax, wick and scent", n is 2').predicate, {
    all: [{ field: 'name', is: 'Wax, wick and scent' }, { field: 'n', is: 2 }],
  });
  assert.deepEqual(parse('name is not "Wax, wick"').predicate, { field: 'name', not: 'Wax, wick' });
});

test('INSIDE THE MARKS, or, not and the operator words are the text', () => {
  assert.deepEqual(parse('name is "Salt or sugar"').predicate, { field: 'name', is: 'Salt or sugar' });
  assert.deepEqual(parse('name is "not now"').predicate, { field: 'name', is: 'not now' });
  assert.deepEqual(parse('name is "empty"').predicate, { field: 'name', is: 'empty' });
  assert.deepEqual(parse('name is ‘More than words’').predicate, { field: 'name', is: 'More than words' });
  assert.deepEqual(parse('tags has "a, b"').predicate, { field: 'tags', has: 'a, b' });
  assert.deepEqual(parse('tags lacks "x or y"').predicate, { field: 'tags', lacks: 'x or y' });
  /* AN ENUM IS STILL ASKED WHAT IT DECLARES. */
  assert.deepEqual(parse('kind is "box"').predicate, { field: 'kind', is: 'box' });
  assert.equal(parse('kind is "boxes"').bad[0]?.code, 'ENUM_VALUE_UNKNOWN');
});

test('A QUOTE INSIDE A VALUE IS HELD BY THE OTHER KIND OF MARK, and a quote with nothing in it is refused', () => {
  assert.deepEqual(parse(`name is 'Say "hi", then go'`).predicate, { field: 'name', is: 'Say "hi", then go' });
  assert.deepEqual(parse(`name is "The maker's mark, first"`).predicate, { field: 'name', is: "The maker's mark, first" });
  assert.equal(parse('name is ""').bad[0]?.code, 'REQUIRED_MISSING');
});

test('WHAT WAS NEVER QUOTED READS AS IT ALWAYS DID', () => {
  assert.deepEqual(parse('name is McDonald’s, n is 1').predicate, { all: [{ field: 'name', is: 'McDonald’s' }, { field: 'n', is: 1 }] });
  assert.deepEqual(parse('kind is wax or box').predicate, { field: 'kind', in: ['wax', 'box'] });
  assert.equal(parse('name is empty').predicate && (parse('name is empty').predicate as { empty?: boolean }).empty, true);
  /* A MARK THAT NEVER CLOSES OPENS NOTHING, so the comma after it still ends the clause. */
  assert.equal(parse("name is 'tis, wick is lit").bad[0]?.code, 'FIELD_UNKNOWN');
});

test('`quoteValue` WRITES A VALUE THE GRAMMAR READS BACK WHOLE, and a plain one bare', () => {
  for (const plain of ['The box', 'parts#2', '2026-10-01', 'Wax and wicks', 'McDonald’s']) assert.equal(quoteValue(plain), plain);
  const odd = ['Wax, wick and scent', 'Say "hi", then go', "it's 'quoted', twice", 'Salt or sugar', 'not now', 'Not', 'empty', 'SET', 'more than words', 'between us', 'or', ' padded ', 'x" , y', '“curly”, too', '"', ''];
  for (const v of odd) {
    assert.notEqual(quoteValue(v), v, v);
    const said = parse(`name is ${quoteValue(v)}, n is 1`);
    if (v === '') {
      assert.equal(said.bad[0]?.code, 'REQUIRED_MISSING');
      continue;
    }
    assert.deepEqual(said.bad, [], v);
    assert.deepEqual(said.predicate, { all: [{ field: 'name', is: v }, { field: 'n', is: 1 }] }, v);
  }
});
