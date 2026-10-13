/**
 * ACTIVITY'S FILTERS ARE DRAWN THROUGH THE ONE PART (`lib/ui/Segmented.svelte`), as a list's view switch is
 * (DIRECTION 39).
 *
 * WHAT WAS MEASURED. The track was written by hand (`<div class="segmented filters">`), which has no `data-slides`, so
 * `controls.css` drew its chosen segment with the hairline and shadow of a hand-written track and never moved it.
 *
 * A TEXT TEST OVER MARKUP, as `lib/ui/segmented-callers.test.ts` is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The screen's source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const text = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const style = /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
const markup = text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const tracks = [...markup.matchAll(/<Segmented\b([^>]*)>([\s\S]*?)<\/Segmented>/gu)];

test('Activity imports the part and writes no track by hand', () => {
  assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u);
  assert.doesNotMatch(markup, /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u, 'a track written by hand does not slide');
});

test('the filters are one track, a named group, and every segment is inside it and says when it narrows', () => {
  assert.equal(tracks.length, 1);
  const [, tag, held] = tracks[0]!;
  assert.match(tag!, /\bclass="filters"/u);
  assert.match(tag!, /\brole="group"/u);
  assert.match(tag!, /\baria-label=\{historyWords\.filters\}/u, 'a group of filters with no name');
  const outside = markup.replace(/<Segmented\b[\s\S]*?<\/Segmented>/u, '');
  assert.doesNotMatch(outside, /\bclass="segment[\s"]/u, 'a segment outside the part has no track');
  const segments = held!.match(/<(?:button|span|select)\b[^>]*\bclass="segment[\s"][^>]*>/gu) ?? [];
  assert.equal(segments.length, 4, 'everything, who, what and the day');
  for (const segment of segments) assert.match(segment, /\bdata-on=/u, 'the part finds the chosen segment by data-on');
});

test('no rule needs the track to be this screen\'s own element', () => {
  /* The track is the part's element, so a scoped `.filters` or `.segmented` rule would match nothing and be dropped. */
  const scoped = style.replaceAll(/:global\([^)]*\)/gu, '');
  assert.doesNotMatch(scoped, /\.filters\b|\.segmented\b/u, 'a scoped rule for an element this screen does not draw');
  assert.match(style, /\.tools :global\(\.filters\)/u, "the track's rule is not held to this screen's toolbar");
});
