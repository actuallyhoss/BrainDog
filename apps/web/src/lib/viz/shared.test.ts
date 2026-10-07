import { test } from 'node:test';
import assert from 'node:assert/strict';

import { figure, isQuiet, listed, ordinal, paint, rampAt, sentence, textWidth } from './shared.ts';

test('a named tone is a token, anything else is a project colour carried inline', () => {
  assert.deepEqual(paint('danger', 'ink'), { tone: 'danger', colour: undefined });
  assert.deepEqual(paint(undefined, 'g2'), { tone: 'g2', colour: undefined });
  assert.deepEqual(paint('', 'g2'), { tone: 'g2', colour: undefined });
  assert.deepEqual(paint('#B35F1F', 'ink'), { tone: 'own', colour: '#B35F1F' });
});

test('the ramp steps down from the accent through its tints and stays on "other"', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(rampAt), ['ink', 'g2', 'g3', 'g4', 'g4', 'g4']);
  assert.equal(rampAt(-1), 'ink');
});

test('greys are quiet, a highlight is not', () => {
  assert.equal(isQuiet(undefined), true);
  assert.equal(isQuiet('g2'), true);
  assert.equal(isQuiet('ink'), false);
  assert.equal(isQuiet('#123456'), false);
});

test('figures are grouped, with a true minus', () => {
  assert.equal(figure(9800), '9,800');
  assert.equal(figure(-39), '−39');
  assert.equal(figure(Number.NaN), '');
});

test('a longer label is wider, and a wider size wider still', () => {
  assert.ok(textWidth('Entertainment') > textWidth('Gifts'));
  assert.ok(textWidth('Gifts', 17) > textWidth('Gifts', 12));
  assert.equal(textWidth(''), 0);
});

test('lists, sentences and ordinals read as English', () => {
  assert.equal(listed(['a', 'b', 'c']), 'a, b and c');
  assert.equal(sentence('Kiln takings', 'from 1 to 2'), 'Kiln takings, from 1 to 2');
  assert.equal(sentence(undefined, 'from 1 to 2'), 'From 1 to 2');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), [
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st',
  ]);
});
