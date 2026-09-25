/**
 * An element of a `list<ref>`, asked for by the row number the address carries.
 *
 * WHY THIS FILE EXISTS: THE SAMPLE REFUSED THE ONE ADDRESS THE LIVE ENGINE WAS BUILT TO ANSWER.
 * `remote.test.ts`'s *"A LIST OF REFS IS ASKED IN THE IDS THE RECORD STORES, and the address carries
 * a number"* drives the chip `because:has:4` against a real kernel and asserts it answers skills#1
 * and #4. The sample answered *"because has 4: there is no learnings called 4"* over the same seed,
 * which is the two-languages failure `where.ts` and `remote.ts` are held against: one address, two
 * answers, and the wrong one on the surface the product demonstrates itself on.
 *
 * AND THE NUMBER IS THE ONLY ADDRESS THREE OF THOSE SEVEN ELEMENTS HAVE. A comma separates clauses,
 * so a title carrying one comes apart in the sentence grammar before any lookup runs; three of the
 * seven `learnings` titles in the mirror carry a comma. `remote.test.ts` records this as *"every
 * `learnings` title in the seed contains a comma"*, which is measured below and is three of seven,
 * not seven of seven. Either way the number is the address those three elements have, and refusing
 * it left one shipped `list<ref>` field partly unfilterable on the sample alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chipsOf, whereOf } from './api.ts';
import { NOW, REGISTERS, ROWS } from './data.ts';
import { compile, matches, registerHref } from './where.ts';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';

/** The seqs of the rows of `register` a sentence admits, in order. */
const rowsFor = (register: string, sentence: string): number[] => {
  const w = compile(register, sentence);
  assert.deepEqual(w.bad, [], `the sentence was refused: ${sentence}`);
  return (ROWS[register] ?? []).filter((e) => matches(e, w, NOW)).map((e) => e.seq).sort((a, b) => a - b);
};

/** A minted URL read back the way the register page reads one: chips, then the sentence they mean. */
const backThrough = (href: string): string => {
  const at = href.indexOf('?');
  return whereOf(chipsOf(new URLSearchParams(at === -1 ? '' : href.slice(at + 1))));
};

test('A LIST OF REFS IS ASKED BY ROW NUMBER TOO, and the sample answers the rows the record answers', () => {
  /* The rows the seed's own `because` column says cite learnings#4. `remote.test.ts` drove the same
     two seqs out of a running record for the same chip, so this is the sample's half of that pair
     rather than a second opinion about the seed. */
  const held = (ROWS.skills ?? [])
    .filter((e) => Array.isArray(e.fields.because) && (e.fields.because as unknown[]).includes(4))
    .map((e) => e.seq)
    .sort((a, b) => a - b);
  assert.deepEqual(held, [1, 4], 'the seed no longer has exactly skills#1 and #4 citing learnings#4');

  assert.deepEqual(rowsFor('skills', 'because has 4'), held);
  assert.deepEqual(
    rowsFor('skills', 'because lacks 4'),
    (ROWS.skills ?? []).map((e) => e.seq).filter((seq) => !held.includes(seq)).sort((a, b) => a - b),
    'a row citing nothing lacks everything',
  );
});

test('AND A NUMBER THAT NAMES NO ROW IS STILL THE REFUSAL IT WAS, in the record’s own sentence', () => {
  /* The refusal is the reason the number could be taught at all: `allowed` admits a ref's `seq` on
     the scalar path and refuses one that names nothing, so `thing is 99` is a refusal and not a
     comparison against the characters `99`. This is that rule, one element type along. */
  assert.deepEqual(compile('skills', 'because has 999').bad, ['because has 999: there is no learnings called 999']);
  assert.deepEqual(compile('skills', 'because has 0').bad, ['because has 0: there is no learnings called 0']);
});

test('THREE OF THE SEVEN TITLES CANNOT BE SAID IN A SENTENCE AT ALL, which is what the number is for', () => {
  const title = REGISTERS.learnings?.title;
  assert.ok(title, 'learnings declares no title field');
  const all = (ROWS.learnings ?? []).map((e) => String(e.fields[title] ?? ''));
  const commaed = all.filter((t) => t.includes(','));
  assert.equal(all.length, 7, 'the mirror no longer holds seven learnings');
  assert.equal(commaed.length, 3, 'the count of comma-carrying titles moved, so the measurement above is stale');

  /* A COMMA SEPARATES CLAUSES BEFORE ANY LOOKUP RUNS, so the title comes back as two refusals and
     neither of them names the element. Driven rather than argued, because it is the whole reason the
     number is the address for these three. */
  const refused = compile('skills', `because has ${commaed[0]}`);
  assert.equal(refused.clauses.length, 0);
  assert.equal(refused.bad.length, 2, 'the comma no longer splits the sentence, so this measurement is stale');

  /* And every title without one still resolves by name, which is the spelling a person types. */
  for (const t of all.filter((x) => !x.includes(','))) assert.equal(compile('skills', `because has ${t}`).clauses.length, 1, t);
});

test('THE MINTED CHIP COMES BACK AS ONE CLAUSE OVER THE SAME ROWS, whatever the title holds', () => {
  /* `registerHref` mints the element as somebody would write it, and `chipsOf` splits a chip's value
     on commas, so a title carrying one is minted as a value that arrives as two and `whereOf` keeps
     the first: a link that reads as the filter it came from and opens a different list. Both shipped
     `list<ref>` fields are driven here, because only one of them has a target title with a comma in
     it and a test over the other alone would not have seen this. */
  for (const [register, field, target] of [
    ['skills', 'because', 'learnings'],
    ['people', 'projects', 'things'],
  ] as const) {
    for (const row of ROWS[target] ?? []) {
      const sentence = `${field} has ${row.seq}`;
      const said = backThrough(registerHref(register, sentence));
      assert.equal(compile(register, said).clauses.length, 1, `the chip for "${sentence}" came back as ${said}`);
      assert.deepEqual(rowsFor(register, said), rowsFor(register, sentence), `the chip for "${sentence}" opens a different list`);
    }
  }
});
