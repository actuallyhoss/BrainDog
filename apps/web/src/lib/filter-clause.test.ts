/**
 * THE READING LINE OVER A FILTERED LIST, HELD AGAINST THE OPERATORS THE CHIPS ACTUALLY RUN.
 *
 * `copy.filterClause` is the sentence a saved view and a `⌥V` title are written in, and it knew four
 * operators out of the six a chip can carry: `before`, `after`, `not-in`, and everything else is
 * `is`. So `repos:has:portage` and `repos:lacks:portage` BOTH printed `Repositories is portage` —
 * one clause saying the opposite of the filter it describes, the other saying an equality over a
 * test for membership. Measured before the fix, against the compiler that answers the chips: that
 * sentence comes back *"repos is a list, which cannot be asked \"is\""*, so the printed line was not
 * merely the wrong words, it was a line the record itself refuses.
 *
 * SO EVERY CLAUSE IS ROUND-TRIPPED THROUGH `compile` RATHER THAN COMPARED TO A STRING. A reading
 * line a person can type back is the whole point of it not being the `where` dialect (`copy.ts`
 * says why), and the compiler takes a field by its LABEL as well as by its id (`fieldOf`), so the
 * line the screen prints is a sentence that can be handed straight back to the engine. A printer
 * checked only against itself is how the two words above were missing together.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './record/fixtures/fill.ts';
import { copy } from './copy.ts';
import { compile } from './record/where.ts';

/** The reading line, and what the engine makes of it. */
const said = (register: string, label: string, values: string[], op: string): { line: string; bad: string[] } => {
  const line = copy.filterClause(label, values, op);
  return { line, bad: compile(register, line).bad };
};

test('THE TWO LIST OPERATORS HAVE THEIR OWN TWO WORDS, and both printed `is`', () => {
  /* `things.repos` is the field both sides measured on: `repos has portage` answers one row, and
     `repos is portage` answers a refusal. */
  assert.equal(copy.filterClause('Repositories', ['portage'], 'has'), 'Repositories has portage');
  assert.equal(copy.filterClause('Repositories', ['portage'], 'lacks'), 'Repositories lacks portage');

  /* ONE VALUE, BECAUSE THAT IS WHAT THE CHIP RUNS. `whereOf` sends `f.values[0]` and `where.ts`
     types the clause `values: [string]`, since the operator looks for a single element inside a
     list. Joining the rest on ` or ` would print `has urgent or soon`, which compiles clean as an
     element literally called that and matches nothing for ever. */
  assert.equal(copy.filterClause('Repositories', ['portage', 'tallow'], 'has'), 'Repositories has portage');
  assert.equal(copy.filterClause('Repositories', ['portage', 'tallow'], 'lacks'), 'Repositories lacks portage');
});

test('EVERY OPERATOR A CHIP CAN CARRY PRINTS A CLAUSE THE RECORD TAKES BACK, labels and all', () => {
  /**
   * The six `clauseOf` reads out of a saved view's predicate, plus the question about absence, which
   * arrives as `is empty` and `is set` rather than as an operator of its own. Each one is a field of
   * the seed's own registers, named by the label its column is drawn under.
   */
  const cases: [register: string, label: string, values: string[], op: string][] = [
    ['obligations', 'Which way', ['owed to me'], 'in'],
    ['obligations', 'Status', ['open', 'part'], 'in'],
    ['obligations', 'Status', ['paid'], 'not-in'],
    ['obligations', 'Status', ['open'], 'is'],
    ['obligations', 'Due', ['today'], 'before'],
    ['obligations', 'Due', ['today'], 'after'],
    ['obligations', 'Due', ['empty'], 'is'],
    ['obligations', 'Due', ['set'], 'is'],
    ['things', 'Repositories', ['portage'], 'has'],
    ['things', 'Repositories', ['portage'], 'lacks'],
  ];
  /**
   * A LIST OF REFS IS NOT ON THAT LIST, AND THE PRINTER IS NOT WHY. `skills.because` is a
   * `list<ref>` into `learnings`, and `Learnings behind it has 4` comes back "there is no learnings
   * called 4": the sentence dialect resolves a ref element by the target's TITLE and not by the
   * number the address carries. Asking by the title does not work either, because every `learnings`
   * lesson in the seed contains a comma and a comma separates clauses, so the one clause comes back
   * as two refusals. That is a gap in `where.ts`, not in this function, and it is recorded here
   * because it is why that chip is proven against the record itself instead: see `remote.test.ts`,
   * "A LIST OF REFS IS ASKED IN THE IDS THE RECORD STORES".
   */
  const refused = cases
    .map(([register, label, values, op]) => ({ op, ...said(register, label, values, op) }))
    .filter((c) => c.bad.length > 0)
    .map((c) => `${c.op}: "${c.line}" was refused: ${c.bad.join('; ')}`);
  assert.deepEqual(refused, [], 'the reading line printed a clause the engine behind the chips refuses');
});
