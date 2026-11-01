/**
 * The lowest point of a walk ahead says over which window it is the lowest (finish F2): Money home read "Lowest £X on
 * 7 Nov" with no window, while Today says "in the next 13 weeks".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { copy } from '../copy.ts';
import { aheadWindowSaid } from './page-live.ts';

test('A WALK AHEAD OF WHOLE WEEKS IS SAID IN WEEKS, any other in days', () => {
  assert.equal(aheadWindowSaid(84), '12 weeks');
  assert.equal(aheadWindowSaid(91), '13 weeks');
  assert.equal(aheadWindowSaid(30), '30 days');
  assert.equal(aheadWindowSaid(7), '7 days');
  assert.equal(aheadWindowSaid(1), '1 day');
});

test('THE LOWEST IS TWO WORDS AND A DAY, HELD WHOLE', () => {
  assert.equal(copy.cashLowest('−£16,200', 'on 7 Nov', '12 weeks'), 'Lowest\u00a0{{bad:−\u2060£16,200}}\u00a0on\u00a07\u00a0Nov');
  /* THE MINUS IS HELD TO ITS FIGURE, so a wrapped line never leaves "−" at its end (finish F49). */
  assert.equal(copy.cashLowest('£16,200', 'today', '12 weeks'), 'Lowest\u00a0£16,200\u00a0today');
});
