/**
 * THE BLOCK EDITOR'S SEGMENTED CONTROLS ARE THE ONE PART (`lib/ui/Segmented.svelte`), so each of them slides.
 *
 * WHAT WAS MEASURED. Three tracks in the sheet were written by hand (`<div class="segmented">`): which way a list is
 * sorted, how wide the block is, and which column it sits in. A track written by hand has no `data-slides`, and
 * `controls.css` leaves it the fill that fades out in one place and in at another.
 *
 * A TEXT TEST OVER MARKUP, for the reason `people-names.test.ts` gives: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The editor's source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const TEXT = readFileSync(new URL('./BlockEditor.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const SCRIPT = /<script lang="ts">([\s\S]*?)<\/script>/u.exec(TEXT)?.[1] ?? '';
const STYLE = /<style[^>]*>([\s\S]*?)<\/style>/u.exec(TEXT)?.[1] ?? '';
const MARKUP = TEXT.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');

/** An element of the page's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;

/** Each track the part draws: its opening tag and what it holds. */
const TRACKS = [...MARKUP.matchAll(/<Segmented\b([^>]*)>([\s\S]*?)<\/Segmented>/gu)].map((m) => ({ tag: m[1]!, held: m[2]! }));

test('the editor imports the part', () => {
  assert.match(SCRIPT, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u);
});

test('no track is written by hand', () => {
  assert.doesNotMatch(MARKUP, BY_HAND, 'a track written by hand does not slide');
});

test('the three tracks are the part, each a named group', () => {
  assert.equal(TRACKS.length, 3);
  const named = TRACKS.map((t) => t.tag.trim());
  assert.deepEqual(named, [
    'role="group" aria-label={blockWords.sortDir}',
    'role="group" aria-labelledby="{uid}-width"',
    'role="group" aria-labelledby="{uid}-area"',
  ]);
});

test('the labels the width and the column are named by keep their ids', () => {
  assert.match(MARKUP, /<span class="label" id="\{uid\}-width">\{blockWords\.width\}<\/span>/u);
  assert.match(MARKUP, /<span class="label" id="\{uid\}-area">\{blockWords\.area\}<\/span>/u);
});

test('every segment sits inside a track, and says whether it is chosen', () => {
  const outside = MARKUP.replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
  assert.doesNotMatch(outside, /\bclass="segment[\s"]/u, 'a segment outside the part has no track');
  for (const { held } of TRACKS) {
    const segments = held.match(/<(?:button|span)\b[^>]*\bclass="segment"[^>]*>/gu) ?? [];
    assert.ok(segments.length > 0, 'a track with no segment');
    for (const segment of segments) assert.match(segment, /\bdata-on\b/u, 'the part finds the chosen segment by data-on');
  }
});

test('a width that is no longer a step is still drawn as the chosen one', () => {
  assert.match(TRACKS[1]!.held, /<span class="segment" data-on aria-current="true">\{spanLabel\(width\)\}<\/span>/u);
});

test('the sheet has no track rule of its own', () => {
  assert.doesNotMatch(STYLE, /\.segmented\b/u, 'the track is drawn by controls.css through the part');
});
