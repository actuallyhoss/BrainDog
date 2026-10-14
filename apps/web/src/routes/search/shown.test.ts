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

import { BY_MEANING } from '../../lib/record/search-live.ts';
import { byMeaningOf, meaningLine, sentenceOf, shownState, topOf, whereSaid } from './shown.ts';

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

/* ── the sentence and the tile ─────────────────────────────────────────── */

const g = (kind: string, total: number) => ({ kind, total });

test('the sentence counts the answer, names the list most of it is in, and names none on a tie', () => {
  assert.equal(sentenceOf('renewal', { total: 9, groups: [g('Tasks', 6), g('People', 3)] }), '9 matches for “renewal” in 2 lists; most in Tasks.');
  assert.equal(sentenceOf('renewal', { total: 8, groups: [g('Tasks', 4), g('People', 4)] }), '8 matches for “renewal” in 2 lists.');
  assert.equal(sentenceOf(' kiln ', { total: 1, groups: [g('Projects', 1)] }), '1 match for “kiln” in Projects.');
  assert.equal(sentenceOf('kiln', { total: 0, groups: [] }), null, 'nothing matched is the empty state, not a sentence');
  assert.equal(sentenceOf('', { total: 3, groups: [g('Tasks', 3)] }), null);
});

test('the top list is the strictly largest one, and a tie at the top is no top', () => {
  assert.deepEqual(topOf([g('A', 1), g('B', 5), g('C', 2)]), g('B', 5));
  assert.equal(topOf([g('A', 5), g('B', 5), g('C', 2)]), null);
  assert.equal(topOf([]), null);
});

test('the reading under the bars says how many the top list holds, or which lists share it', () => {
  assert.equal(whereSaid({ total: 9, groups: [g('Tasks', 6), g('People', 3)] }), '6 of 9 are in Tasks.');
  assert.equal(whereSaid({ total: 3, groups: [g('Tasks', 1), g('People', 1), g('Pages', 1)] }), 'Tasks, People and Pages hold 1 each, of 3.');
  assert.equal(whereSaid({ total: 4, groups: [g('Tasks', 1), g('People', 3)] }), '3 of 4 are in People.');
  assert.equal(whereSaid({ total: 3, groups: [g('Tasks', 1), g('People', 2)] }).startsWith('2 of 3 are'), true);
});

/* ── the quiet line about meaning ──────────────────────────────────────── */

test('hits found by meaning are counted in one line, one and many', () => {
  assert.equal(meaningLine('vehicle cover', { total: 4, byMeaning: 1 }, 'fused'), '1 of these share no word with “vehicle cover”: Slash found them by meaning.');
  assert.equal(meaningLine(' vehicle cover ', { total: 4, byMeaning: 2 }, 'fused'), '2 of these share no word with “vehicle cover”: Slash found them by meaning.');
  assert.equal(meaningLine('kiln', { total: 3, byMeaning: 0 }, 'fused'), null, 'every hit shares a word, so there is nothing to say');
});

test('nothing found says why it was searched by words only, and only when the record said why', () => {
  const none = { total: 0, byMeaning: 0 };
  assert.equal(meaningLine('kiln', none, 'off'), 'Searched by its words only: Slash reading on its own is off. Turn it on in Settings, under Agents.');
  assert.equal(meaningLine('kiln', none, 'spent'), "Searched by its words only: this month's searches by meaning are used.");
  assert.equal(meaningLine('kiln', none, 'failed'), 'Searched by its words only: the model did not answer this time.');
  for (const quiet of ['none', 'words', undefined] as const) assert.equal(meaningLine('kiln', none, quiet), null, `${quiet} says nothing`);
  assert.equal(meaningLine('', { total: 0, byMeaning: 0 }, 'off'), null, 'an empty query is no search at all');
  assert.equal(meaningLine('  ', { total: 2, byMeaning: 2 }, 'fused'), null);
});

test('the hits by meaning are the ones whose line says so', () => {
  const hit = (detail: string) => ({ title: 'Marlow kiln', detail, href: '/r/tasks/1', kind: 'Tasks', icon: 'rows' as const });
  assert.equal(byMeaningOf({ hits: [hit(BY_MEANING), hit(''), hit(BY_MEANING)] as never }), 2);
  assert.equal(byMeaningOf({ hits: [] }), 0);
});

test('the screen draws the line under the sentence and under the empty state', () => {
  assert.match(page, /meaningLine\(q, \{ total: found\.total, byMeaning: byMeaningOf\(found\) \}/u);
  assert.match(page, /below=\{shown === 'hits' && meaningSaid \? meaningBelow : undefined\}/u);
  assert.match(page, /<\/Empty>\s*\{#if meaningSaid\}<p class="reading">\{meaningSaid\}<\/p>\{\/if\}/u);
});
