/**
 * WHICH ARM `/search` DRAWS, AND WHICH QUERY THE ANSWER ON SCREEN WAS COMPUTED FOR.
 *
 * THE DEFECT THIS FILE HOLDS SHUT: `answer` is never cleared when the query changes, which is right
 * for hits and wrong for a verdict. Landing on `/search` with nothing typed resolves `find('')`
 * without sending anything and leaves `answer` holding a total of zero. The first real query then
 * re-renders before the request it triggered has been answered and falls through to the zero arm, so
 * the screen states `Nothing matches "<the words just typed>"` over a record nobody has asked about
 * them, and offers to check the spelling.
 *
 * IT USED TO COMPOUND ON A LIST NOTHING COULD FIND: `personal` ships `budgets` with no `search: true`
 * on any of its four fields, and until `2dc32e2f` indexed every row's title that register answered no
 * query at all. It is found by its category now, so the landing on an empty `find('')` is the whole
 * of the defect held shut here.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { shownState } from './shown.ts';

const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
const answered = (total: number) => ({ from: 'live' as const, value: { hits: [], total, groups: [] } });
const refused = { from: 'refused' as const, fix: 'The record changed while it was being read.' };

test('the five arms, in the two states the page is really in', () => {
  assert.equal(shownState('', null, null), 'idle', 'the ordinary way in from the nav');
  assert.equal(shownState('kiln', null, null), 'waiting', 'nothing answered yet');
  assert.equal(shownState('kiln', answered(3) as never, 'kiln'), 'hits');
  assert.equal(shownState('kiln', answered(0) as never, 'kiln'), 'none', 'a verdict about the words in the box');
  assert.equal(shownState('kiln', refused as never, 'kiln'), 'refused');
});

test('A VERDICT COMPUTED FOR ANOTHER QUERY IS NOT DRAWN OVER THIS ONE, and hits are', () => {
  /* THE ONE THAT WAS ON SCREEN: an empty answer left by `find('')`, and a query just typed. */
  assert.equal(shownState('kiln', answered(0) as never, ''), 'waiting', 'this is the false verdict');
  assert.equal(shownState('kiln', answered(0) as never, 'marlow'), 'waiting');
  assert.equal(shownState('kiln', refused as never, 'marlow'), 'waiting', 'a refusal is a claim about words that were sent');

  /* AND HITS STAY, because content is visibly about something and blanking it would flash the page
     on every pause in typing. */
  assert.equal(shownState('kiln', answered(7) as never, 'marlow'), 'hits');
});

test('the screen draws the arm this module names, rather than asking the answer itself', () => {
  assert.match(page, /import \{ shownState \} from '\.\/shown\.ts';/u);
  for (const arm of ['idle', 'waiting', 'refused', 'none'])
    assert.match(page, new RegExp(`shown === '${arm}'`, 'u'), `the ${arm} arm is decided somewhere else`);
  /* THE OLD CONDITIONS ARE GONE AND NOT MERELY UNUSED: either of these back in the chain is the
     stale verdict back on the screen. */
  assert.doesNotMatch(page, /\{:else if found\.total === 0\}/u);
  assert.doesNotMatch(page, /\{:else if !answer\}/u);
});
