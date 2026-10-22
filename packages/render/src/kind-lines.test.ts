/**
 * Every kind has its line, and the lines are words a person could be read.
 *
 * A KIND WITH NO LINE IS A KIND NO AGENT IS TOLD ABOUT: the grammar it is handed lists the kinds with their lines
 * (`packages/record/src/grammar.ts` `kinds`), so one missing here is one an agent never reaches for. `Record<Kind, ...>`
 * already refuses to compile without it; this holds it at run time too, for a line that is there and empty.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, type Kind } from './kinds.ts';
import { KIND_LINES, REACH_FOR, kindLine } from './kind-lines.ts';

const kinds = Object.keys(KINDS) as Kind[];

test('EVERY ONE OF THE FORTY-TWO KINDS HAS A LINE, and no line is for a kind the table does not have', () => {
  assert.equal(kinds.length, 42);
  for (const kind of kinds) {
    const line = KIND_LINES[kind];
    assert.ok(line, `${kind} has no line`);
    assert.ok(line.for.trim().length > 0 && line.cells.trim().length > 0, `${kind}'s line says nothing`);
  }
  assert.deepEqual(Object.keys(KIND_LINES).sort(), [...kinds].sort());
});

test('A LINE SAYS WHAT THE KIND IS FOR, ITS CELLS AND ITS FORMS, and spec is the one to reach for most', () => {
  assert.equal(kindLine('spec'), 'the block to reach for most: a name, a value, a note. name | value | note.');
  assert.match(kindLine('progress'), /Forms: budget, range\./u);
  assert.match(kindLine('table'), /Reads a list, on a page only\./u);
  assert.match(kindLine('embed'), /On a page only\./u);
  for (const kind of kinds) assert.ok(Buffer.byteLength(kindLine(kind)) <= 200, `${kind}'s line is longer than one line`);
});

test('THE TEN LINES OF WHAT TO REACH FOR NAME ONLY KINDS THAT EXIST', () => {
  assert.equal(REACH_FOR.length, 10);
  for (const line of REACH_FOR) {
    const named = line.slice(line.lastIndexOf(':') + 1).split(' or ').map((k) => k.trim());
    for (const kind of named) assert.ok(Object.hasOwn(KINDS, kind), `${line} names ${kind}, which is not a kind`);
  }
});

test('NO LINE CALLS AN ENTRY A ROW, NAMES AN ID OR CARRIES AN EM DASH', () => {
  for (const said of [...kinds.map(kindLine), ...REACH_FOR]) {
    assert.doesNotMatch(said, /\brows?\b/iu, said);
    assert.doesNotMatch(said, /—/u, said);
    assert.doesNotMatch(said, /#\d/u, said);
  }
});
