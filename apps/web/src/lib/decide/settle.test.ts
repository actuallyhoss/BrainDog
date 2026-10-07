/**
 * AN ANSWERED CARD SETTLES (`settle.ts`), and the card reads as a form with its side on a wide tile, read without a DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { msOf, SETTLE_MOST, settleOf } from './settle.ts';

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a card that became its line plays from the height it had to the line’s own, and nothing plays for less motion', () => {
  assert.deepEqual(settleOf(304, 72, 180, false), [{ blockSize: '304px' }, { blockSize: '72px' }]);
  assert.deepEqual(settleOf(72, 304, 180, false), [{ blockSize: '72px' }, { blockSize: '304px' }], 'Undo opens the card out of the line');
  assert.equal(settleOf(304, 72, 180, true), null, 'a reader who asked for less motion sees the line at once');
  assert.equal(settleOf(304, 304.4, 180, false), null, 'a change under a pixel plays nothing');
  assert.equal(settleOf(304, 72, 0, false), null, 'no time to play it in');
  assert.equal(settleOf(Number.NaN, 72, 180, false), null);
});

test('the step is the skin’s `--d-rows`, in either unit, and never past the scale’s 300ms', () => {
  assert.equal(msOf('180ms', 0), 180);
  assert.equal(msOf('0.12s', 0), 120);
  assert.equal(msOf('', 180), 180, 'an unset token takes the scale’s rows step');
  assert.equal(msOf('2s', 0), SETTLE_MOST);
  assert.ok(SETTLE_MOST < 300);
});

test('the card measures before the change and settles after it, on the answer, on Undo and on the reason line', () => {
  const card = src('./DecisionCard.svelte');
  assert.match(card, /const from = footprint\(phase === 'answered' \? done : cardEl\);\n\s+change\(\);\n\s+await tick\(\);\n\s+settle\(/u);
  assert.match(card, /await morph\(\(\) => \{\n\s+phase = 'answered';\n\s+holding = hold\(/u, 'the answer is not held in the same step that draws its line');
  assert.match(card, /await morph\(\(\) => \(phase = 'open'\)\);/u, 'Undo puts the card back in one frame');
  assert.match(card, /void morph\(\(\) => \(phase = 'answered'\)\);\n\s+void send\(chosen, reason\);/u);
});

test('on a wide tile the card has a 280px side with who asked, why and what it changes; one column on a narrow one', () => {
  const card = src('./DecisionCard.svelte');
  for (const part of ['class="dc-main"', 'class="dc-side"', 'dc-part-by', 'dc-part-why', 'dc-part-changes', '{cardWords.askedBy}', '{cardWords.why}', '{cardWords.changes}'])
    assert.ok(card.includes(part), `the card no longer draws ${part}`);
  assert.match(card, /@container \(inline-size >= 52rem\) \{\n\s+\.dc:not\(\[data-compact\]\) \{\n\s+grid-template-columns: minmax\(0, 1fr\) 280px;/u);
  /* ONE COLUMN BY DEFAULT: the wrappers are let go of, so a compact card and a narrow slot read as they always did. */
  assert.match(card, /\.dc-main,\n\s+\.dc-side,\n\s+\.dc-part \{\n\s+display: contents;/u);
  /* WHO ASKED AND WHEN STAY ON SCREEN, now the by-line is a part's and not the card's own child. */
  assert.match(card, /\.queue-by > :is\(\.queue-when, \.dc-from\) \{\n\s+opacity: 1;/u);
});

test('Not now stands in the row with the answers, not at the far end of the form’s measure', () => {
  const form = src('./form.css');
  assert.doesNotMatch(form, /\.dc-later \{\n\s+margin-inline-start: auto;/u, 'Not now floats in the middle of a wide row again');
  assert.match(form, /\.dc-actions > \.dc-later \{\n\s+margin-inline-start: var\(--sp-2\);/u);
});

test('the question’s own page has the same side: who asked and why beside the answers on a wide page', () => {
  const gate = src('../../routes/decide/[id]/+page.svelte');
  for (const part of ['<div class="gate-form">', '<div class="gate-side">', '<div class="gate-main">', '{cardWords.askedBy}', '{cardWords.why}'])
    assert.ok(gate.includes(part), `the gate no longer draws ${part}`);
  assert.match(gate, /grid-template-columns: minmax\(0, 1fr\) 280px;/u);
  assert.ok(gate.indexOf('<div class="gate-side">') < gate.indexOf('<section class="options"'), 'who asked and why are read after the answers');
});
