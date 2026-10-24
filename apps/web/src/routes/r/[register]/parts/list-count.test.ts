/**
 * The head counts the list, not what has been loaded (the audit of 25 October, Y18): Numbers read "200+ of 2,527" and
 * the Ledger "200+ of 322" over lists the record had already counted. The head says the list's count, and the foot says
 * what is shown while the rest is still to come.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { headCount, shownSaid } from './list.ts';

test('THE HEAD SAYS THE LIST\'S COUNT, never a floor of what is loaded', () => {
  assert.deepEqual(headCount({ matched: 2527, total: 2527, drawn: 200, narrowed: false }), { count: 2527 });
  assert.deepEqual(headCount({ matched: 322, total: 322, drawn: 200, narrowed: false }), { count: 322 });
});

test('A FILTERED LIST SAYS HOW MANY MATCH OF HOW MANY IT HOLDS', () => {
  assert.deepEqual(headCount({ matched: 41, total: 2527, drawn: 41, narrowed: true }), { count: 41, total: 2527 });
});

test('A ROW TYPED HERE BEFORE THE RECORD COUNTED IT IS COUNTED', () => {
  assert.deepEqual(headCount({ matched: 12, total: 12, drawn: 13, narrowed: false }), { count: 13 });
});

test('THE FOOT SAYS WHAT IS SHOWN while the rest is on its way', () => {
  assert.equal(shownSaid(200, 2527), 'Showing 200 of 2,527. More as you scroll.');
});

test('THE LIST PAGE COUNTS ITS HEAD THIS WAY AND SAYS ITS FOOT', () => {
  const page = readFileSync(new URL('../+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /headCount\(/u);
  assert.match(page, /shownSaid\(/u);
  assert.doesNotMatch(page, /atLeast=\{/u, 'the head counts a floor again');
});
