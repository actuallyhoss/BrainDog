/**
 * "UPDATE ALL" SAYS WHAT IT PASSED OVER, as well as what it installed.
 *
 * WHAT WAS WRONG. The run counts an update only when it installs it, and passes over one whose version an earlier update
 * of the same run already brought in. The line at the end was said only for two or more installs and counted those
 * alone: three updates of which the second was already in read "2 add-ons are updated." and the third name was nowhere,
 * and one install beside one passed over said nothing at all, so the sheet closed on a list one shorter than was pressed.
 *
 * THE WORDS ARE TRIED AS A FUNCTION; the run is in the page, and is read as text for the two things it must do (keep the
 * name of each one passed over, and hand both to the words), as `segmented.test.ts` reads markup: there is no component
 * test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { words } from './words.ts';

test('three updates where the second is already in: two are counted and the third is named', () => {
  assert.equal(words.updatedAll(2, ['Invoices']), '2 plugins are updated. Invoices was already in.');
});

test('one update and one passed over still says so', () => {
  assert.equal(words.updatedAll(1, ['Invoices']), '1 plugin is updated. Invoices was already in.');
});

test('several passed over are each named, in the order they were met', () => {
  assert.equal(words.updatedAll(1, ['Invoices', 'Clients']), '1 plugin is updated. Invoices and Clients were already in.');
  assert.equal(
    words.updatedAll(2, ['Invoices', 'Clients', 'Stock']),
    '2 plugins are updated. Invoices, Clients and Stock were already in.',
  );
});

test('a single update with nothing passed over stays quiet, and so does a run that installed nothing', () => {
  assert.equal(words.updatedAll(1, []), null);
  assert.equal(words.updatedAll(0, []), null);
});

test('two or more with nothing passed over read as they did', () => {
  assert.equal(words.updatedAll(2, []), '2 plugins are updated.');
  assert.equal(words.updatedAll(3, []), words.updated(3));
});

test('nothing a person reads here carries an em dash', () => {
  assert.doesNotMatch(words.updatedAll(2, ['Invoices', 'Clients']) ?? '', /—/u);
});

/** The page without its comments, so a comment that quotes the old line counts for nothing. */
const PAGE = readFileSync(new URL('./Installed.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('the run keeps the name of each update it passes over', () => {
  assert.match(PAGE, /if \(done > 0 && landed\(fresh\.planned\)\) \{\s*passed\.push\(u\.title\);\s*continue;\s*\}/u, 'a passed-over update is not kept by name');
});

test('the run hands the count and the names to the words, and no longer says the count alone', () => {
  assert.match(PAGE, /words\.updatedAll\(done, passed\)/u, 'the run does not ask the words for its last line');
  assert.doesNotMatch(PAGE, /if \(done > 1\) toasts\.push\(words\.updated\(done\)/u, 'the old count-only line is still there');
});

test('a run that stopped short says no good news: a refusal or a plan that asks again is the last word', () => {
  assert.match(PAGE, /const ended = whole \? words\.updatedAll\(done, passed\) : null;/u, 'the last line is said after a run that broke');
  /* Whole only once the last update is reached, and not when it then asks again or is refused. */
  assert.match(PAGE, /whole = i === plans\.length - 1;/u);
  assert.equal(PAGE.match(/whole = false;\s*break;/gu)?.length, 2);
  assert.ok(PAGE.indexOf('if (!fresh.ok) {') < PAGE.indexOf('whole = i === plans.length - 1;'), 'a refused plan is counted as reached');
});
