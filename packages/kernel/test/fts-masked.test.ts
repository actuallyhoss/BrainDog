/**
 * A search for a figure, by a caller from whom amounts are hidden, matches only where the figure is still in the text
 * once its amounts are taken out (`figuresStillIn`, `maskedMatched`, sharing plan §2.7).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { figuresStillIn, searchWords } from '../src/fts.ts';
import { maskMoneyText } from '../src/mail-read.ts';

const finds = (text: string, q: string, inside = false) => figuresStillIn(text, searchWords(q), maskMoneyText, inside);

test('A FIGURE WRITTEN AS AN AMOUNT IS NOT FOUND, AND ONE WRITTEN AS ANY OTHER NUMBER IS', () => {
  assert.equal(finds('Paid £923.47 for clay', '923.47'), false);
  assert.equal(finds('Paid £923.47 for clay', '923'), false);
  assert.equal(finds('Quote GBP 1,250 for the kiln', '1250'), false);
  assert.equal(finds('Room 923, paid £40', '923'), true);
  assert.equal(finds('Room 923, paid £40', 'room 923'), true);
  /* WORDS WITH NO DIGIT ARE NEVER HELD BACK: taking an amount out takes no word. */
  assert.equal(finds('Paid £923.47 for clay', 'clay'), true);
  assert.equal(finds('Paid £923.47 for clay', 'paid clay'), true);
});

test('THE CONTAINS SEARCH HOLDS THE FIGURE ANYWHERE IN THE TEXT, AS ITS LIKE DOES', () => {
  assert.equal(finds('ref A923 paid £10', '923', true), true);
  assert.equal(finds('paid £1923', '923', true), false);
});
