/**
 * AN ANSWERED CARD SETTLES (`settle.ts`), and the card reads as a form with its side on a wide tile, read without a DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { leaveOf, msOf, rideOf, SETTLE_MOST } from './settle.ts';

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('what is under a card that became its line glides from where it stood on transform alone, and nothing plays for less motion', () => {
  assert.deepEqual(rideOf(232, 180, false), [{ transform: 'translateY(232px)' }, { transform: 'translateY(0)' }]);
  assert.deepEqual(rideOf(-232, 180, false), [{ transform: 'translateY(-232px)' }, { transform: 'translateY(0)' }], 'Undo opens the card out of the line');
  assert.equal(rideOf(232, 180, true), null, 'a reader who asked for less motion sees the line at once');
  assert.equal(rideOf(0.4, 180, false), null, 'a move under a pixel plays nothing');
  assert.equal(rideOf(232, 0, false), null, 'no time to play it in');
  assert.equal(rideOf(Number.NaN, 180, false), null);
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
  assert.match(card, /const before = snapshot\(phase === 'answered' \? done : cardEl\);\n\s+change\(\);\n\s+await tick\(\);\n\s+settle\(/u);
  assert.match(card, /await morph\(\(\) => \{\n\s+phase = 'answered';\n\s+holding = hold\(/u, 'the answer is not held in the same step that draws its line');
  assert.match(card, /await morph\(\(\) => \(phase = 'open'\)\);/u, 'Undo puts the card back in one frame');
  assert.match(card, /void morph\(\(\) => \(phase = 'answered'\)\);\n\s+void send\(chosen, reason\);/u);
});

test('on a wide tile a card with why or what it changes has a 280px side; one column on a narrow one, and with neither', () => {
  const card = src('./DecisionCard.svelte');
  for (const part of ['class="dc-main"', 'class="dc-side"', 'dc-part-why', 'dc-part-changes', '{cardWords.askedBy}', '{cardWords.why}', '{cardWords.changes}'])
    assert.ok(card.includes(part), `the card no longer draws ${part}`);
  assert.match(card, /@container \(inline-size >= 52rem\) \{\n\s+\.dc\[data-side\]:not\(\[data-compact\]\) \{\n\s+grid-template-columns: minmax\(0, 1fr\) 280px;/u);
  /* ONE COLUMN BY DEFAULT: the wrappers are let go of, so a compact card and a narrow slot read as they always did. */
  assert.match(card, /\.dc-main,\n\s+\.dc-side,\n\s+\.dc-part \{\n\s+display: contents;/u);
  /* WHO ASKED AND WHEN STAY ON SCREEN, now the by-line is the form's and not the card's own child. */
  assert.match(card, /\.queue-by > :is\(\.queue-when, \.dc-from\) \{\n\s+opacity: 1;/u);
});

test('Not now stands in the row with the answers, not at the far end of the form’s measure', () => {
  const form = src('./form.css');
  assert.doesNotMatch(form, /\.dc-later \{\n\s+margin-inline-start: auto;/u, 'Not now floats in the middle of a wide row again');
  assert.match(form, /\.dc-actions > \.dc-later \{\n\s+margin-inline-start: var\(--sp-2\);/u);
});

test('the question’s own page is two tiles on a wide board: the answers, and beside them why, what it changes and the comments (today F9)', () => {
  const gate = src('../../routes/decide/[id]/+page.svelte');
  /* THE SECOND TILE IS DRAWN WHERE IT HAS SOMETHING TO SAY; who asked is the quiet line over the answers either way. */
  for (const part of ["<div class=\"gate-grid\" data-aside={aside ? '' : undefined}>", '<Tile class="gate-aside">', '{cardWords.askedBy}', '{gate.whyAsked}', '{gate.changes}'])
    assert.ok(gate.includes(part), `the gate no longer draws ${part}`);
  /* TWO THIRDS AND A THIRD FROM 1100px, only where there is a second tile. */
  assert.match(gate, /@media \(width >= 1100px\) \{\n\s+\.gate-grid\[data-aside\] \{\n\s+grid-template-columns: minmax\(0, 8fr\) minmax\(0, 4fr\);/u);
  assert.ok(gate.indexOf('<section class="options"') < gate.indexOf('<Tile class="gate-aside">'), 'the answers are no longer read first');
});

test('a sent answer’s row closes to nothing with the gap under it, so the read that takes it out moves nothing', () => {
  assert.deepEqual(leaveOf(84, 12, 180, false), [
    { blockSize: '84px', marginBlockEnd: '0px', opacity: 1 },
    { blockSize: '0px', marginBlockEnd: '-12px', opacity: 0 },
  ]);
  assert.equal(leaveOf(84, 12, 180, true), null, 'less motion: gone at once, to the same end');
  assert.equal(leaveOf(0.4, 12, 180, false), null, 'a row with no height has nothing to play');
  assert.deepEqual(leaveOf(84, Number.NaN, 180, false)?.[1], { blockSize: '0px', marginBlockEnd: '0px', opacity: 0 });
  const card = src('./DecisionCard.svelte');
  assert.match(card, /await pointerOff\(row\.parentElement\);/u, 'it waits for the mouse to leave its queue first');
  assert.match(card, /data-held=\{holding \|\| busy \|\| leaving \? '' : undefined\}/u, 'and holds the page’s read until it has gone');
  assert.match(card, /answerWritten\(question\.id\);[\s\S]*void goOut\(\);/u, 'it goes once the record wrote it');
});
