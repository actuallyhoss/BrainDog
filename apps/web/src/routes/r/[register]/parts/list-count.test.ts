/**
 * The head counts the list, not what has been loaded: Numbers read "200+ of 2,527" and
 * the Ledger "200+ of 322" over lists the record had already counted. The head says the list's count, and the foot says
 * what is shown while the rest is still to come.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { headCount, shownSaid } from './list.ts';

test('THE HEAD SAYS THE ANSWER\'S COUNT, never a floor of what is loaded', () => {
  assert.equal(headCount({ matched: 2527, drawn: 200 }), 2527);
  assert.equal(headCount({ matched: 322, drawn: 200 }), 322);
});

test('A ROW TYPED HERE BEFORE THE RECORD COUNTED IT IS COUNTED', () => {
  assert.equal(headCount({ matched: 12, drawn: 13 }), 13);
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
