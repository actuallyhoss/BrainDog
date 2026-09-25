/**
 * A metric's parameter is one value in its sentence here, written as the kernel writes it.
 *
 * `withParam` PUT THE NAME IN RAW (`loop/research-audit-2026-09-25-layouts.md` §9). The kernel's `fill` has written a
 * parameter through the grammar's `quoteValue` since the where quoting fix, and this copy went on cutting the sentence
 * on every comma and substituting the name as it stood. Measured over the shipped `project-owed` template: a project
 * called `not Kiln` became `thing is not Kiln`, and the tile's link opened `f=thing:not-in:Kiln`, the opposite rows; a
 * name holding `, or state is paid` put an `or` into the figure's scope; and `Wax, wick and scent` became the clause
 * `thing is Wax` and a second clause about a field called `wick`. So the two engines are held here to one string for
 * `where` and one for `within`, which is the only way they can be held to the same rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fill } from '@braindog/kernel';

import './fixtures/fill.ts';
import { METRICS } from './declared.ts';
import { read, withParam, type MetricDecl } from './metrics.ts';
import { NOW } from './fixtures/sample.ts';
import { compile } from './where.ts';

const NAMES = [
  'Kiln',
  'not Kiln',
  'Kiln, or state is paid',
  'Wax, wick and scent',
  `' ” ’ ", or state is open, or what is x`,
  /* A `$` PATTERN IN A STRING REPLACEMENT IS EXPANDED, so `replaceAll(PARAM, it)` wrote the text after the placeholder
     in place of `$'`, and the placeholder itself in place of `$&`. */
  "Kiln $' x",
  'A$&B',
];

test('A PARAMETER IS WRITTEN INTO `where` AND `within` BYTE FOR BYTE AS THE KERNEL WRITES IT', () => {
  const decl = METRICS['project-owed']!;
  for (const name of NAMES) {
    const ours = withParam(decl, name);
    const theirs = fill(decl, null, name) as MetricDecl;
    assert.equal(ours.where, theirs.where, name);
    assert.equal(ours.within, theirs.within, name);
  }
});

test('A PROJECT CALLED `not Kiln` IS ASKED FOR BY ITS NAME, and its link does not open every other project', () => {
  const said = withParam(METRICS['project-owed']!, 'not Kiln');
  /* NO SEED PROJECT HAS THAT NAME, so the reference refuses it, and the figure is the honest nothing. Unquoted, the
     scope compiled to `{ op: 'is not', values: ['Kiln'] }` and counted every other project's money. */
  const scope = compile('obligations', said.within, NOW);
  assert.ok(
    scope.clauses.every((c) => c.op === 'is'),
    `the scope ${said.within} compiled to ${JSON.stringify(scope.clauses)}`,
  );
  assert.match(scope.bad[0] ?? '', /not Kiln/);
  assert.doesNotMatch(read(said, NOW).href ?? '', /thing:not-in/);
});

test('A NAME WITH A COMMA OR AN `or` IN IT IS ONE CLAUSE OF THE SCOPE', () => {
  for (const name of NAMES) {
    const said = withParam(METRICS['project-owed']!, name);
    const scope = compile('obligations', said.within, NOW);
    /* A REF THAT NAMES NO ROW IS REFUSED BY THE REFERENCE, which is the right answer for a project that does not exist;
       what must not happen is a second clause, or an `or` that widens the scope past the one project. */
    assert.equal(scope.any, undefined, `${name}: ${said.within}`);
    assert.ok(scope.clauses.length + scope.bad.length <= 1, `${name}: ${said.within} is ${JSON.stringify(scope)}`);
  }
});
