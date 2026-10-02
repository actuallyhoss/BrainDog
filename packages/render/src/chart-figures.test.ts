/**
 * Money on a chart: a bar's value grouped (`£11,200`, never `11200`) and an axis label compact (`£31k`),
 * each keeping the unit and the sign the figure was written with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { axisFigure, barFigure, money, symbolFigure } from './format.ts';

test('A BAR\'S VALUE IS GROUPED, and a zero minor part is dropped while any other is kept', () => {
  assert.equal(barFigure('11200'), '11,200');
  assert.equal(barFigure('£11,200.00'), '£11,200');
  assert.equal(barFigure('£11200.50'), '£11,200.50');
  assert.equal(barFigure(money(1_120_000, 'GBP')), 'GBP 11,200');
  assert.equal(barFigure('$4,800.00 USD'), 'US$4,800', 'one mark of currency, never a symbol and its code');
  assert.equal(barFigure('−£39.00'), '−£39');
  assert.equal(barFigure('+£850.00'), '+£850');
  // A hyphen is the minus it stands for.
  assert.equal(barFigure('-11200'), '−11,200');
  // A figure too large for a float keeps every digit.
  assert.equal(barFigure('12345678901234567890'), '12,345,678,901,234,567,890');
});

test('AN AXIS LABEL IS COMPACT, in the unit the figure was written in', () => {
  assert.equal(axisFigure('£31,240.55'), '£31k');
  assert.equal(axisFigure('£4,200.00'), '£4.2k');
  assert.equal(axisFigure('−£1,600.00'), '−£1.6k');
  assert.equal(axisFigure(money(-160_000, 'GBP')), 'GBP −1.6k');
  assert.equal(axisFigure(symbolFigure(money(250_000_000, 'USD')) ?? ''), 'US$2.5m');
  assert.equal(axisFigure('CHF 58,185.54'), 'CHF 58k');
  assert.equal(axisFigure('£850.40'), '£850');
  assert.equal(axisFigure('4'), '4');
  assert.equal(axisFigure('3200000000'), '3.2bn');
});

test('THE STEP IS CHOSEN AFTER THE ROUNDING, so no label says a thousand of a step', () => {
  assert.equal(axisFigure('£999.60'), '£1k');
  assert.equal(axisFigure('£999,700.00'), '£1m');
  assert.equal(axisFigure('£9,960.00'), '£10k');
  // Rounded to nothing, the sign goes with it.
  assert.equal(axisFigure('−£0.04'), '£0');
});

test('TEXT THAT IS NOT ONE FIGURE COMES BACK AS IT WAS WRITTEN', () => {
  for (const text of ['', 'Q3', 'about 11200', '12%', '1,2345', '−GBP −5.00', '11 200', 'n/a']) {
    assert.equal(barFigure(text), text, `bar: ${text}`);
    assert.equal(axisFigure(text), text, `axis: ${text}`);
  }
});
