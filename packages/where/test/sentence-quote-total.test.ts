/**
 * `quoteValue` is total: every string it is handed reads back as exactly that one string, beside other clauses.
 *
 * ONE CRAFTED NAME TURNED A ONE-ROW FILTER INTO ALL 24 OPEN OBLIGATIONS (`loop/research-audit-2026-09-25-layouts.md` §3).
 * A value holding all four closing marks, each followed by a space, a comma or its end, had no pair of marks that could
 * hold it, and `quoteValue` fell back to the straight pair anyway. The grammar had no escape, so the quote closed at the
 * first `"` and the rest of the value became clauses: `' ” ’ ", or state is open, or what is x` filled into
 * `what is {{what}}` read as three conditions joined by `or`, one of them `state is open`. A template page is filtered
 * by whatever a row holds, and whoever can write the row writes the value. Of 50,000 quote-built values measured then,
 * 529 could not be written whole.
 *
 * THE GRAMMAR HAS AN ESCAPE NOW: inside a quote, a closing mark written twice is one mark of the value and closes
 * nothing. `quoteValue` still writes bare where the bare words read back and in the first pair whose closing mark the
 * value never holds in a closing place, so every filter a page printed before prints the same. Only a value no pair
 * fits is written in the straight pair with each `"` doubled. The fuzz below is random runs of the four marks, commas,
 * the grammar's own words and every kind of whitespace, and each value is asked of `clausesOf` and of `parseWhere`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clausesOf, parseWhere, quoteValue, unquoted, type Schema } from '../src/index.ts';

const deps = { nowMs: Date.UTC(2026, 8, 25, 12) };

const PARTS: Schema = {
  register: 'parts',
  fields: {
    name: { type: 'text' },
    tags: { type: 'list', of: 'text' },
    n: { type: 'int' },
  },
};

const parse = (s: string) => parseWhere(s, PARTS, deps);

/** A seeded generator, so a failure names a value that fails again on the next run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* THE PIECES A HOSTILE NAME IS BUILT FROM: every mark the grammar opens or closes a quote with, the comma that ends a
   clause, the words it reads for itself, and whitespace of every width, including a line break. */
const PIECES = [
  '"', "'", '“', '”', '‘', '’', '""', '”,', ',', ', ', ' ', '  ', '\t', '\n',
  'or', ' or ', 'not', 'is', 'empty', 'set', 'in', 'starts', 'ends', 'more than', 'between', 'state is open', 'x', 'Kiln', 'é',
];

/* AND THE PIECES THAT CORNER `quoteValue`: each closing mark where a quote can close. Drawn from the list above alone, a
   value almost never holds all four, and a first version of this fuzz passed 20,000 values against the code the audit
   had just broken with one. Half the values are built from these. */
const CORNERS = ['" ', "' ", '” ', '’ ', '",', "',", '”,', '’,', '"', "'", '”', '’', 'x', ' or ', ', or state is open'];

function values(n: number, seed: number): string[] {
  const next = mulberry32(seed);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const from = i % 2 === 0 ? PIECES : CORNERS;
    let v = '';
    const len = 1 + Math.floor(next() * 12);
    for (let j = 0; j < len; j++) v += from[Math.floor(next() * from.length)]!;
    out.push(v);
  }
  return out;
}

const PAYLOAD = `' ” ’ ", or state is open, or what is x`;

test('THE AUDIT\'S NAME IS ONE VALUE, not three conditions joined by or', () => {
  const q = quoteValue(PAYLOAD);
  assert.equal(clausesOf(`name is ${q}`).length, 1, q);
  assert.deepEqual(parse(`name is ${q}`).predicate, { field: 'name', is: PAYLOAD });
  assert.deepEqual(parse(`name is ${q}, n is 1`).predicate, { all: [{ field: 'name', is: PAYLOAD }, { field: 'n', is: 1 }] });
});

test('EVERY VALUE `quoteValue` WRITES IS ONE CLAUSE AND READS BACK BYTE FOR BYTE, after is, is not, has and contains', () => {
  const wrong: string[] = [];
  const failed = new Set<string>();
  for (const v of values(20_000, 25_09_2026)) {
    const q = quoteValue(v);
    const why = (what: string) => {
      failed.add(v);
      wrong.push(`${JSON.stringify(v)} as ${JSON.stringify(q)}: ${what}`);
    };
    if (clausesOf(`name is ${q}`).length !== 1) why('more than one clause');
    if (clausesOf(`name is ${q}, n is 1`).length !== 2) why('the clause after it was swallowed');
    const is = parse(`name is ${q}, n is 1`);
    if (JSON.stringify(is.predicate) !== JSON.stringify({ all: [{ field: 'name', is: v }, { field: 'n', is: 1 }] }))
      why(`is read ${JSON.stringify(is.predicate ?? is.bad)}`);
    const not = parse(`name is not ${q}`);
    if (JSON.stringify(not.predicate) !== JSON.stringify({ field: 'name', not: v })) why(`is not read ${JSON.stringify(not.predicate ?? not.bad)}`);
    const has = parse(`tags has ${q}`);
    if (JSON.stringify(has.predicate) !== JSON.stringify({ field: 'tags', has: v })) why(`has read ${JSON.stringify(has.predicate ?? has.bad)}`);
    /* `contains` HAS ITS OWN READING OF A QUOTE, and a needle past forty bytes is the compiler's refusal, not this one's. */
    if (new TextEncoder().encode(v).length <= 40) {
      const holds = parse(`name contains ${q}`);
      if (JSON.stringify(holds.predicate) !== JSON.stringify({ field: 'name', contains: v }))
        why(`contains read ${JSON.stringify(holds.predicate ?? holds.bad)}`);
    }
  }
  assert.deepEqual(wrong.slice(0, 8), [], `${failed.size} of 20,000 values did not read back`);
});

test('A CLOSING MARK WRITTEN TWICE INSIDE A QUOTE IS ONE MARK OF THE VALUE', () => {
  assert.deepEqual(parse('name is "a"", b", n is 1').predicate, { all: [{ field: 'name', is: 'a", b' }, { field: 'n', is: 1 }] });
  assert.equal(unquoted('""""'), '"');
  assert.equal(unquoted('“a”” b”'), 'a” b');
  /* AND A QUOTE WITH NOTHING IN IT IS STILL REFUSED, which is the one value no quoting writes. */
  assert.equal(parse('name is ""').bad[0]?.code, 'REQUIRED_MISSING');
  assert.equal(parse('name is """"').bad.length, 0);
});

test('A VALUE STARTING WITH A WORD THE BROWSER READS AS AN OPERATOR IS QUOTED, since the record reads it as text', () => {
  /* `in`, `starts` and `ends` are operators `apps/web/src/lib/record/where.ts` names and does not read, so bare it
     refused `what is in stock` while the kernel matched the text. Quoted, both read the words. */
  for (const v of ['in stock', 'starts now', 'ends here', 'In', 'ENDS']) {
    assert.notEqual(quoteValue(v), v, v);
    assert.deepEqual(parse(`name is ${quoteValue(v)}`).predicate, { field: 'name', is: v });
  }
  for (const v of ['inside', 'starter', 'endless', 'The end']) assert.equal(quoteValue(v), v, v);
});
