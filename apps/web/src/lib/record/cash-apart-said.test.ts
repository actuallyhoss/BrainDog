/**
 * Money's first line keeps its currencies apart: each currency's amount joined as a sentence joins them, then about what
 * they come to at the rate, in whole units, and the day of that rate as any day is said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { money } from 'braindog-render';

import './fixtures/fill.ts';
import { resolverOf } from './page-live.ts';

test('EACH CURRENCY APART IS SAID AS A SENTENCE SAYS IT, and about the sum with no pennies', () => {
  const said = resolverOf({
    'cash-now.apart': [
      { amount: 4_000_000, currency: 'EGP' },
      { amount: 1_000_050, currency: 'USD' },
    ],
    'cash-now.converted': { amount: 54_502_500, currency: 'EGP' },
    'cash-now.rate_on': '2026-09-28',
    'cash-now': [{ amount: 1, currency: 'EGP' }, { amount: 2, currency: 'USD' }],
  });
  /* FROM A THOUSAND UP A SENTENCE SAYS WHOLE UNITS, half a unit rounding up (dd6b3b9bf, the one rule for cents d9bab2403). */
  assert.equal(said('cash-now.apart'), 'EGP 40,000 and USD 10,001');
  assert.equal(said('cash-now.converted'), money(54_502_500, 'EGP').replace(/\.00$/u, ''));
  assert.doesNotMatch(said('cash-now.converted') ?? '', /\.\d\d$/u);
  assert.match(said('cash-now.rate_on') ?? '', /28 Sep/u);
  /* A FIGURE IN PARTS THAT IS NOT A LINE'S IS WRITTEN AS A TILE WRITES IT, as before. */
  assert.doesNotMatch(said('cash-now') ?? '', / and /u);
});
