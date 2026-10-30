/**
 * A tick's budget (`tick-budget.ts`): the units it counts and the wall time it reads, and the budget that never runs out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TICK_MS, TICK_PAGES, UNBOUNDED, tickBudget } from '../src/tick-budget.ts';

test('A BUDGET IS SPENT AT ITS UNITS, whatever the clock says, because a Worker\'s clock stands still while a page draws', () => {
  const now = 1_000;
  const b = tickBudget(() => now, TICK_MS, 3);
  assert.equal(b.spent(), false);
  b.spend();
  b.spend();
  assert.equal(b.spent(), false, 'two of three pages is not spent');
  b.spend();
  assert.equal(b.spent(), true, 'three of three pages is spent');
});

test('AND AT ITS MILLISECONDS, where the clock moves', () => {
  let now = 1_000;
  const b = tickBudget(() => now, 500, TICK_PAGES);
  now += 499;
  assert.equal(b.spent(), false);
  now += 1;
  assert.equal(b.spent(), true);
});

test('A STEP COUNTED AS SEVERAL PAGES SPENDS THEM AT ONCE', () => {
  const b = tickBudget(() => 0, TICK_MS, 10);
  b.spend(4);
  b.spend(4);
  assert.equal(b.spent(), false);
  b.spend(4);
  assert.equal(b.spent(), true);
});

test('UNBOUNDED NEVER RUNS OUT, so a caller that hands no budget does the whole of the work in one tick', () => {
  for (let i = 0; i < 10_000; i++) UNBOUNDED.spend(10);
  assert.equal(UNBOUNDED.spent(), false);
});
