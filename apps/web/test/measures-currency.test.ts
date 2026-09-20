/**
 * The figure a measure tile draws, against the exponent the renderer actually divides by.
 *
 * ONE EXPONENT OR THE FIGURE IS WRONG BY A POWER OF TEN. `figureOf` turns a major-unit reading into
 * the minor units `money()` takes, and `money()` turns them back. If the two steps read different
 * tables the reading survives neither trip: `IQD` is 3 in the record's table and 0 in CLDR, so a
 * reading of 1.5 multiplied by CLDR's 1 and divided by the record's 1000 draws `IQD 0.002`. A
 * founder acting on a thousandth of their revenue is the failure this file exists to stop.
 *
 * AND MEMBERSHIP IS A SEPARATE QUESTION FROM THE EXPONENT. `Intl.NumberFormat` accepts any three
 * ASCII letters and answers 2 for the ones it has never heard of, so asking it "is this a currency"
 * is asking a question it cannot refuse. `VAT` is a column heading in somebody's spreadsheet and
 * `ABC` is a placeholder, and neither is money.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exponentOf, money, quantity } from 'braindog-render';

import { figureOf } from '../src/lib/record/measures.ts';

/**
 * The codes where CLDR and the record's table disagree, and two where they agree.
 *
 * THE AGREEING PAIR IS NOT PADDING. A check that only holds the disagreements passes the day
 * somebody makes `figureOf` return the empty string, so `GBP` and `JPY` are here to say that the
 * ordinary cases still draw what they drew.
 */
const READINGS: readonly (readonly [string, number, string])[] = [
  ['IQD', 1.5, 'IQD 1.500'],
  ['MGA', 1.5, 'MGA 1.50'],
  ['JPY', 1.5, 'JPY 2'],
  ['GBP', 1.5, 'GBP 1.50'],
];

test('a measure draws its money against the exponent the renderer divides by', () => {
  for (const [unit, value, drawn] of READINGS) assert.equal(figureOf(value, unit), drawn, `${unit}: the tile multiplied by one exponent and the renderer divided by another`);
});

test('every code the renderer overrides survives the trip into minor units and back', () => {
  /* BY PROPERTY AND NOT BY LIST, because a list is what let this through: a check naming the codes
     somebody remembered cannot see the one they did not. `money()` is the only thing that knows how
     many minor units a currency has, so the expectation is written with it rather than typed out. */
  for (const code of ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND', 'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'EUR', 'USD', 'HUF']) {
    const minor = Math.round(2.5 * 10 ** exponentOf(code));
    assert.equal(figureOf(2.5, code), money(minor, code), `${code}: the figure a tile draws is not the figure the renderer draws for the same reading`);
  }
});

test('three letters that ISO 4217 does not assign are a unit, not money', () => {
  /* `Intl.NumberFormat` NEVER REFUSES A WELL-FORMED CODE, so the `-1` sentinel the old reader
     caught was unreachable and every three-letter unit was money. `VAT` reading `VAT 1.50` is a tax
     line drawn as a currency. */
  for (const unit of ['VAT', 'ABC', 'ZZZ']) assert.equal(figureOf(1.5, unit), quantity(1.5, unit), `${unit}: three letters are not a currency just because they are three letters`);
});
