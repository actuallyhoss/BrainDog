/**
 * One clause, once, ever.
 *
 * The failure this replaces is not a bug in a mechanism — there was no mechanism. Five definitions
 * sat in `first-run.ts`, imported by nothing, under a comment stating the policy in the past tense,
 * while `row`, `pack`, `page` and `block` each reached a screen with nothing explaining them. So the
 * first thing these tests assert is the thing a `grep` would have caught: that the strings are
 * reachable from the component that renders them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from './copy.ts';
import { NOUNS, forget, taught, teach, type Noun } from './define.svelte.ts';

/* `pref` writes to `document.cookie`, and there is no document under `node --test`. The store's own
   read and write already answer `{}` and do nothing without one — which is what makes this testable
   at all — so what is under test here is the in-memory half: teach once, never twice. */

test('EVERY NOUN THE BUILD TEACHES HAS A CLAUSE, and every clause is taught', () => {
  /* THE DEAD-STRING TEST, which is the one that was missing. A definition in `copy.ts` that no noun
     names is a sentence nobody will ever read; a noun with no definition renders an em-dash and
     nothing after it. */
  for (const noun of NOUNS) {
    const said = copy.defines[noun];
    assert.ok(said, `${noun} is taught and has no clause`);
    assert.ok(said.length > 20, `${noun}'s clause is too short to define anything: ${said}`);
    /* It is a clause, not a sentence: it joins a line that already names the word. */
    assert.ok(!said.endsWith('.') || said.includes('. '), `${noun}'s clause reads as its own sentence`);
  }
  for (const key of Object.keys(copy.defines))
    assert.ok((NOUNS as readonly string[]).includes(key), `copy.defines.${key} is a definition nothing teaches`);
});

test('a noun is explained the first time and NEVER AGAIN', () => {
  forget();
  for (const noun of NOUNS) {
    assert.equal(teach(noun), true, `${noun} was not explained the first time`);
    assert.equal(teach(noun), false, `${noun} was explained twice`);
    assert.equal(teach(noun), false, `${noun} was explained a third time`);
  }
  assert.deepEqual([...taught()].sort(), [...NOUNS].sort());
});

test('and the mark goes down in the same tick, not in an effect', () => {
  /* TWO `Define`s FOR ONE NOUN IN ONE RENDER PASS MUST NOT BOTH TEACH. A guard that waited for an
     effect would let both through, and the reader would meet the same clause twice on one screen —
     which is exactly the "never again" the rule is about. */
  forget();
  const answers = [teach('list'), teach('list'), teach('list')];
  assert.deepEqual(answers, [true, false, false]);
});

test('a clause defines its word without needing a word this build does not define', () => {
  /* A definition that leans on undefined jargon is a glossary entry, not a definition. The four
     lean only on each other and on ordinary English — `page` says "made of blocks" and `block` is
     taught; `row` says "in a list" and `list` is taught. Nothing reaches outside the set. */
  const BANNED = ['register', 'predicate', 'declaration', 'projection', 'primitive', 'ceiling', 'scope'];
  for (const noun of NOUNS)
    for (const word of BANNED)
      assert.ok(
        !new RegExp(String.raw`\b${word}s?\b`, 'i').test(copy.defines[noun]),
        `${noun}'s clause explains it with "${word}", which the user is never told either`,
      );
});

test('forget is a real reset, so a cleared cookie really does re-teach', () => {
  forget();
  assert.equal(taught().size, 0);
  teach('row' satisfies Noun);
  assert.equal(taught().size, 1);
  forget();
  assert.equal(teach('row'), true, 'clearing the cookie did not bring the definition back');
});
