/**
 * Activity as a page the record composes (PGS-C24 job 8), at `/audit?declared` until his yes: the record's page
 * `activity` drawn by the one renderer, and the screen as it was left where it is.
 *
 * THE PURE HALF IS CALLED, AND THE SCREEN IS READ FROM ITS SOURCE, as `r/[register]/declared.test.ts` reads its own:
 * which of the two a visit draws is one test of the address, the composed page is fetched only when it is asked for,
 * and the screen as it was keeps every read it had.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classicHref, declaredHref, declaredSays, PAGE, wantsDeclared, words } from './declared.ts';

const SCREEN = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const COMPOSED = readFileSync(new URL('./DeclaredActivity.svelte', import.meta.url), 'utf8');

const at = (search: string) => new URL(`https://record.test/audit${search}`);

test('THE DEFAULT IS THE SCREEN AS IT WAS: only `?declared` asks for the page', () => {
  assert.equal(wantsDeclared(at('')), false);
  assert.equal(wantsDeclared(at('?who=p_1&kind=entry.created')), false);
  assert.equal(wantsDeclared(at('?declared')), true);
  assert.equal(wantsDeclared(at('?declared=')), true);
  assert.equal(wantsDeclared(at('?who=p_1&declared')), true);
  /* A WORD THAT HOLDS IT AS A VALUE, OR STARTS WITH IT, IS ANOTHER KEY. */
  assert.equal(wantsDeclared(at('?list=declared')), false);
  assert.equal(wantsDeclared(at('?declaredly')), false);
  assert.equal(wantsDeclared(at('?classic')), false);
});

test('EACH WAY ACROSS KEEPS EVERY OTHER WORD of the address, and its place', () => {
  assert.equal(declaredHref(at('')), '/audit?declared');
  assert.equal(declaredHref(at('?who=p_1&kind=entry.created')), '/audit?declared&who=p_1&kind=entry.created');
  assert.equal(declaredHref(at('?declared&everything=1')), '/audit?declared&everything=1', 'the key is never doubled');
  assert.equal(declaredHref(at('?day=2026-10-14#top')), '/audit?declared&day=2026-10-14#top');

  assert.equal(classicHref(at('?declared')), '/audit');
  assert.equal(classicHref(at('?declared&who=p_1&kind=entry.created')), '/audit?who=p_1&kind=entry.created');
  assert.equal(classicHref(at('?list=tasks&declared=')), '/audit?list=tasks');
  assert.equal(classicHref(at('?who=p_1')), '/audit?who=p_1', 'an address without the key is left as it is');

  /* THERE AND BACK IS WHERE THE READER STARTED. */
  const from = at('?who=p_1&everything=1');
  assert.equal(classicHref(new URL(declaredHref(from), from)), '/audit?who=p_1&everything=1');
});

test('ONE SENTENCE IN PLACE OF THE PAGE: none for a drawn page, the record’s own for a refusal, ours for the rest', () => {
  assert.equal(declaredSays(null), null, 'nothing is said while the read is out');
  assert.equal(declaredSays({ from: 'live', page: { page: { page: PAGE, title: 'Activity' } as never, blocks: [] }, now: 0 }), null);

  /* A RECORD WITHOUT THE PAGE says so, and names it: no People, or People from before the page shipped. */
  const missing = declaredSays({ from: 'missing', held: [{ address: 'home', title: 'Home' }] });
  assert.equal(missing, words.missing);
  assert.match(missing ?? '', /Activity/);

  /* THE RECORD'S REFUSAL IS ITS OWN SENTENCE, word for word, and an empty one is not drawn as a blank. */
  assert.equal(declaredSays({ from: 'refused', fix: 'Sign in again to read this record.' }), 'Sign in again to read this record.');
  assert.equal(declaredSays({ from: 'refused', fix: '  ' }), words.none);
  assert.equal(declaredSays({ from: 'none' }), words.none);

  /* EVERY SENTENCE IS ONE, PLAIN, AND NAMES NO ID. */
  for (const said of [words.missing, words.none, words.trying]) {
    assert.match(said, /^[A-Z][^.]*\.$/, `one sentence: ${said}`);
    assert.doesNotMatch(said, /—|\brow\b|\bentity\b/);
  }
});

test('THE SCREEN AS IT WAS: one test of the address, the page fetched only when asked, and a quiet way across', () => {
  assert.match(SCREEN, /wantsDeclared\(route\.url\)/);
  /* NEVER IMPORTED STATICALLY: the screen as it was does not load it, so its first paint and the entry stay as they were. */
  assert.doesNotMatch(SCREEN, /^\s*import\s+DeclaredActivity/m);
  assert.match(SCREEN, /import\('\.\/DeclaredActivity\.svelte'\)/);
  assert.match(SCREEN, /declaredHref\(route\.url\)/);
  assert.match(SCREEN, /[wW]ords\.asPage\}/);
  /* ITS READS STAND DOWN while the page is drawn, and come back when it is left. */
  assert.ok((SCREEN.match(/if \(composed\) return/g) ?? []).length >= 3, 'the log read, the unseen read and the listener');
});

test('THE COMPOSED PAGE: the record’s page, through the one reader, with its sentence and the way back', () => {
  assert.match(COMPOSED, /import PageView from '\$lib\/page\/PageView\.svelte'/);
  assert.match(COMPOSED, /<PageView slug=\{PAGE\}/);
  assert.match(COMPOSED, /pageReader\(/);
  assert.match(COMPOSED, /declaredSays\(/);
  assert.match(COMPOSED, /classicHref\(route\.url\)/);
  assert.match(COMPOSED, /words\.back/);
  /* NO TILE OF ITS OWN: the feed and the three figures are the record's blocks, drawn by the renderer. */
  assert.doesNotMatch(COMPOSED, /import (Tile|Bars|Swimlanes|HeatGrid|Stacked) /);
});
