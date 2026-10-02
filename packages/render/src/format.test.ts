/**
 * A headline's money: whole amounts without `.00`, one mark of currency, and a ledger's figures left exact.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { headlineFigure, headlineMoney, money, symbolFigure, symbolText } from './format.ts';

test('A HEADLINE SAYS A WHOLE AMOUNT WITHOUT ITS ZEROS, and keeps a fraction that is part of the amount', () => {
  assert.equal(headlineFigure(money(3_385_000, 'GBP')), '£33,850');
  assert.equal(headlineFigure(money(41_230_000, 'EGP')), 'EGP 412,300', 'a currency with no symbol keeps its code in front');
  assert.equal(headlineFigure(money(3_385_050, 'GBP')), '£33,850.50');
  assert.equal(headlineFigure(money(-129_900, 'GBP')), '−£1,299');
  assert.equal(headlineFigure(money(-129_900, 'EGP')), 'EGP −1,299');
  assert.equal(headlineFigure(money(1_299, 'JPY')), 'JP¥1,299', 'a currency with no minor unit has nothing to drop');
  assert.equal(headlineFigure(money(1_500, 'KWD')), 'KWD 1.500', 'three places that are not all zeros stay');
  assert.equal(headlineFigure(money(1_000_000, 'CLF')), 'CLF 100');
  assert.equal(headlineMoney(3_385_000, 'GBP'), '£33,850');
  assert.equal(headlineMoney(0.5, 'GBP'), '—', 'a fractional minor unit is still no figure');
});

test('A HEADLINE NEVER SAYS A CURRENCY TWICE: a symbol with its code after it is said by the code', () => {
  assert.equal(headlineFigure('$4,800.00 USD'), 'US$4,800');
  assert.equal(headlineFigure('E£43,700.00 EGP'), 'EGP 43,700');
  assert.equal(headlineFigure('−$39.50 USD'), '−US$39.50');
  assert.equal(headlineFigure('£24,800.00'), '£24,800', 'a symbol alone is kept as written');
  assert.equal(headlineFigure('+GBP 850.00'), '+£850', 'a sign written for money in stays in front');
});

test('SEVERAL AMOUNTS ARE EACH SAID AS A HEADLINE, and what is not money comes back as written', () => {
  assert.equal(headlineFigure('EGP 43,700.00 · GBP 24,800.00'), 'EGP 43,700 · £24,800');
  assert.equal(headlineFigure('EGP 43,700.00 · GBP 24,800.50'), 'EGP 43,700 · £24,800.50');
  for (const text of ['2026', '1,200', '41 days', '3 Sep 2026', '—', '12%', 'Q3 −1,299.00', '']) assert.equal(headlineFigure(text), text);
});

test('A LEDGER STAYS EXACT: money, symbolFigure and a sentence not marked as a headline keep every minor unit', () => {
  assert.equal(money(3_385_000, 'GBP'), 'GBP 33,850.00');
  assert.equal(symbolFigure(money(3_385_000, 'GBP')), '£33,850.00');
  assert.equal(symbolText('Cash is GBP 33,850.00 across 2 accounts'), 'Cash is £33,850.00 across 2 accounts');
  assert.equal(symbolText('Cash is GBP 33,850.00 and EGP 412,300.00', true), 'Cash is £33,850 and EGP 412,300');
});
