/**
 * The arithmetic behind a press on `/decide`.
 *
 * WHAT IS CHECKED IS WHAT WOULD BE SILENTLY WRONG. Every assertion here is a case that draws
 * correctly and means the wrong thing: an option pressed on a settled question, a key that is not on
 * the card, an undo that clears a neighbour, a reason field bound to a question with no answer, a
 * reason that is only whitespace. None of them throws and none of them looks
 * broken in a screenshot, which is why they are here rather than in a browser gate.
 *
 * The markup is not tested and is not testable here: `optionsOf` says which buttons exist, and
 * whether a button is a `<button>` is `13 §5.2`'s business and the layout gate's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REASON_FLOOR,
  answerFor,
  optionsOf,
  reasonState,
  record,
  setReason,
  withdraw,
  type Answer,
} from './answer.ts';
import { DECIDED, QUESTIONS } from './data.ts';
import type { Question } from './schema.ts';

const AT = '2026-09-09T09:00:00.000Z';

const q: Question = {
  id: 'SG99',
  title: 'Does the card answer the question, or only print it?',
  cost: 'Every day it prints, the answer is two screens away.',
  rank: 1,
  opened: '2026-08-01T09:00:00.000Z',
  options: [
    { key: 'print', title: 'Print them', body: 'A sentence that reads as three controls and is one.' },
    { key: 'press', title: 'Press them', body: 'Three controls that are three controls.', recommended: true },
  ],
};

/* ── which options a question offers ──────────────────────────────────────── */

test('an open question offers every option it declares, in order, numbered from one', () => {
  assert.deepEqual(
    optionsOf(q).map((o) => [o.n, o.key]),
    [
      [1, 'print'],
      [2, 'press'],
    ],
  );
});

test('`recommended` arrives as a boolean whether the seed set it or left it out', () => {
  // The bug this catches: `exactOptionalPropertyTypes` makes the absent case `undefined`, and a
  // card that tested it loosely would draw a recommendation mark on every option or on none.
  assert.deepEqual(optionsOf(q).map((o) => o.recommended), [false, true]);
});

test('A DECIDED QUESTION OFFERS NOTHING TO PRESS', () => {
  // Its row is immutable. The options are history, so the card prints them and presses nothing.
  // `answerFor` refuses for the same reason, because the guard is worth nothing if only the
  // drawing half has it.
  const settled: Question = { ...q, decided: { option: 'press', reason: 'It reads as a control.', by: 'you', at: AT } };
  assert.deepEqual(optionsOf(settled), []);
  assert.equal(answerFor(settled, 'press', AT), null);
});

test('a missing question offers nothing rather than throwing', () => {
  assert.deepEqual(optionsOf(undefined), []);
  assert.equal(answerFor(undefined, 'press', AT), null);
});

/* ── what an answer records ───────────────────────────────────────────────── */

test('one press records the option, its title, when, and who', () => {
  assert.deepEqual(answerFor(q, 'press', AT), {
    question: 'SG99',
    option: 'press',
    title: 'Press them',
    reason: '',
    at: AT,
    by: 'you',
  });
});

test('AN ANSWER WITH NO REASON IS STILL AN ANSWER', () => {
  // The whole point of the change. Answering used to require prose before the button would turn on,
  // so the common case cost a second screen and a paragraph. The reason is asked for after the
  // press, on the card, and the record says plainly that it has not got one yet.
  const a = answerFor(q, 'print', AT);
  assert.ok(a);
  assert.equal(a.reason, '');
  assert.equal(reasonState(a.reason), 'missing');
});

test('a key the question does not offer answers nothing', () => {
  // A stale card, a shortcut, a URL. The alternative is an answer naming an option that does not
  // exist, which nothing downstream would show as wrong.
  assert.equal(answerFor(q, 'defer', AT), null);
  assert.equal(answerFor(q, '', AT), null);
  assert.equal(answerFor(q, 'PRESS', AT), null);
});

/* ── the reason, weighed and never refused ────────────────────────────────── */

test('a reason is missing, thin, or written, and none of the three blocks anything', () => {
  assert.equal(reasonState(''), 'missing');
  assert.equal(reasonState('   '), 'missing');
  assert.equal(reasonState('x'), 'thin');
  assert.equal(reasonState('a'.repeat(REASON_FLOOR - 1)), 'thin');
  assert.equal(reasonState('a'.repeat(REASON_FLOOR)), 'written');
});

test('one character used to be enough, and the floor is what says otherwise', () => {
  // `/decide/<id>` enabled its commit button on one character and then asked "That will not mean
  // anything in six weeks. Keep it anyway?", which is a real argument made at the one moment it
  // could only read as an obstacle. `thin` is the same argument with nothing riding on it.
  assert.equal(reasonState('k'), 'thin');
  assert.equal(reasonState('Both clients quote per product, and the September issue has to say so.'), 'written');
});

/* ── what undo restores ───────────────────────────────────────────────────── */

const answered = (id: string): Answer => ({
  question: id,
  option: 'press',
  title: 'Press them',
  reason: '',
  at: AT,
  by: 'you',
});

test('UNDO RESTORES EXACTLY WHAT WAS THERE BEFORE THE PRESS', () => {
  const before = new Map([['SG29', answered('SG29')]]);
  const after = record(before, answered('SG99'));
  assert.deepEqual([...withdraw(after, 'SG99')], [...before]);
});

test('undo takes back one answer and leaves every other one alone', () => {
  // The failure this catches is the one the research measured: thirteen of eighty-five human writes
  // reversed the write before them, and a reversal that took a neighbour with it would be found by
  // nobody, because the neighbour's card would simply be back to how it looks when untouched.
  const two = record(record(new Map(), answered('SG29')), answered('SG31'));
  const left = withdraw(two, 'SG31');
  assert.deepEqual([...left.keys()], ['SG29']);
  assert.deepEqual(left.get('SG29'), answered('SG29'));
});

test('undoing something that was never answered changes nothing', () => {
  const one = record(new Map(), answered('SG29'));
  assert.deepEqual([...withdraw(one, 'SG31')], [...one]);
});

test('recording does not mutate the map it was handed', () => {
  // Svelte 5 proxies objects and arrays and NOT `Map`, so a screen holding one re-assigns it to
  // re-render. A helper that mutated in place would pass a naive test and draw nothing at all.
  const before = new Map<string, Answer>();
  const after = record(before, answered('SG99'));
  assert.equal(before.size, 0);
  assert.equal(after.size, 1);
  assert.notEqual(before, after);
});

test('answering the same question twice replaces the answer rather than keeping both', () => {
  const first = record(new Map(), answered('SG99'));
  const second = record(first, { ...answered('SG99'), option: 'print', title: 'Print them' });
  assert.equal(second.size, 1);
  assert.equal(second.get('SG99')?.title, 'Print them');
});

/* ── the reason, written onto an answer that exists ───────────────────────── */

test('a reason lands on the answer it belongs to, untrimmed', () => {
  const one = record(new Map(), answered('SG99'));
  const said = setReason(one, 'SG99', 'Per product, because ');
  // Untrimmed: this is bound to a field somebody is still typing in, and trimming on the way in
  // eats the space between two words at the moment it is pressed.
  assert.equal(said.get('SG99')?.reason, 'Per product, because ');
  assert.equal(said.get('SG99')?.option, 'press', 'the rest of the answer survived');
});

test('a reason for a question nobody answered is dropped, not invented', () => {
  const empty = new Map<string, Answer>();
  assert.deepEqual([...setReason(empty, 'SG99', 'why')], []);
});

/* ── against the record as seeded ─────────────────────────────────────────── */

test('EVERY OPEN QUESTION IN THE RECORD OFFERS AT LEAST TWO OPTIONS, WITH DISTINCT KEYS', () => {
  // Both halves are now load-bearing in a way they were not while the options were a printed
  // sentence. A question with one option is a card with one button, which is not a decision; two
  // options sharing a key are two buttons that answer identically, and the card would look right.
  for (const seeded of QUESTIONS) {
    const offered = optionsOf(seeded);
    assert.ok(offered.length >= 2, `${seeded.id} offers ${offered.length} option(s)`);
    assert.equal(new Set(offered.map((o) => o.key)).size, offered.length, `${seeded.id} repeats an option key`);
  }
});

test('and every question the record has already settled chose a key it actually offered', () => {
  for (const settled of DECIDED)
    assert.ok(
      settled.options.some((o) => o.key === settled.decided?.option),
      `${settled.id} was decided as "${settled.decided?.option}", which is not one of its options`,
    );
});

test('a press on a seeded question records that question, not the one beside it', () => {
  const [first] = QUESTIONS;
  assert.ok(first);
  const offered = optionsOf(first);
  const second = offered[1];
  assert.ok(second);
  const a = answerFor(first, second.key, AT);
  assert.deepEqual(
    a && { question: a.question, option: a.option, title: a.title },
    { question: first.id, option: second.key, title: second.title },
  );
});
