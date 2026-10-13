/**
 * EVERY SEGMENTED CONTROL WHERE THE LOOK IS EDITED IS THE ONE PART (`lib/ui/Segmented.svelte`), so every one slides.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`<div class="segmented">`) has no `data-slides`, and `controls.css` leaves it the fill that fades out in one place
 * and in at another. Four tracks in `LookEditor.svelte` were written by hand: the three ways to change a colour, the
 * corners, the density, and light or dark over the specimen.
 *
 * A TEXT TEST OVER MARKUP, as `routes/packs/segmented.test.ts` is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NAME = 'LookEditor.svelte';

/** The editor without its comments, so a comment quoting the old markup counts for nothing. */
const text = readFileSync(new URL(`./${NAME}`, import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** An element of the editor's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button a track holds. */
const SEGMENT = /\bclass="segment[\s"]/gu;
/** The tracks the editor draws: the way a colour is changed, the corners, the density, and the specimen's scheme. */
const TRACKS = 4;

const markup = text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';

test(`${NAME}: it still draws its four tracks`, () => {
  assert.equal(markup.match(SEGMENT)?.length ?? 0, TRACKS, `${NAME} no longer draws four kinds of segment; re-measure`);
  assert.equal(markup.match(/<Segmented\b/gu)?.length ?? 0, TRACKS, 'a track is missing, or one more is drawn');
});

test(`${NAME}: no track is written by hand`, () => {
  assert.doesNotMatch(markup, BY_HAND, 'a track written by hand does not slide');
});

test(`${NAME}: every segment sits in the part's track`, () => {
  assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u, 'the part is not imported');
  /* Outside every `<Segmented>…</Segmented>` there is no segment left. */
  const outside = markup.replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
  assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
});

test(`${NAME}: every track is still a named group`, () => {
  /* What the hand-written track said to a screen reader lands on the part's element. */
  for (const [open] of markup.matchAll(/<Segmented\b[^>]*>/gu)) {
    assert.match(open, /\brole="group"/u, `${open} is not a group`);
    assert.match(open, /\baria-label=\{/u, `${open} has no name`);
  }
});

test(`${NAME}: a rule for the track reaches the part's element`, () => {
  /* The track is the part's element, not the editor's, so a scoped rule for it matches nothing and is dropped. */
  const scoped = styles.replaceAll(/:global\([^)]*\)/gu, '');
  assert.doesNotMatch(scoped, /\.segmented(?![\w-])/u, 'a scoped .segmented is a rule for nothing');
});
