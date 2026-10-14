/**
 * EVERY SEGMENTED CONTROL IN SETTINGS IS THE ONE PART (`lib/ui/Segmented.svelte`), so every one of them slides.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`<div class="segmented">`) has no `data-slides`, and `controls.css` leaves it the fill that fades out in one place
 * and in at another. Eight tracks in these areas were written by hand: three on Appearance, two on People, and one
 * each where an agent is connected, where a key of your own is made, and on the look sheets.
 *
 * A TEXT TEST OVER MARKUP, for the reason `people-names.test.ts` gives: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const HERE = new URL('./', import.meta.url);

/** Each area's source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const AREAS = readdirSync(HERE)
  .filter((name) => name.endsWith('.svelte'))
  .map((name) => ({
    name,
    text: readFileSync(new URL(name, HERE), 'utf8')
      .replaceAll(/<!--[\s\S]*?-->/gu, '')
      .replaceAll(/\/\*[\s\S]*?\*\//gu, ''),
  }));

/** An element of the page's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button or link a track holds. */
const SEGMENT = /\bclass="segment[\s"]/u;

const markup = (text: string): string => text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = (text: string): string => (/<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '');

test('the areas are read, and the ones known to hold a track are among them', () => {
  const holding = AREAS.filter((a) => SEGMENT.test(markup(a.text))).map((a) => a.name);
  for (const name of ['Appearance.svelte', 'Look.svelte', 'MyTokens.svelte', 'People.svelte']) {
    assert.ok(holding.includes(name), `${name} no longer draws a segment; re-measure`);
  }
});

for (const { name, text } of AREAS) {
  test(`${name}: no track is written by hand`, () => {
    assert.doesNotMatch(markup(text), BY_HAND, 'a track written by hand does not slide');
  });

  test(`${name}: every segment sits in the part's track`, () => {
    const page = markup(text);
    if (!SEGMENT.test(page)) return;
    assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u, 'the part is not imported');
    /* Outside every `<Segmented>…</Segmented>` there is no segment left. */
    const outside = page.replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
    assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
  });

  test(`${name}: a rule for the track reaches the part's element`, () => {
    /* The track is the part's element, not this area's, so a scoped `.segmented` matches nothing and is dropped. */
    const scoped = styles(text).replaceAll(/:global\([^)]*\)/gu, '');
    assert.doesNotMatch(scoped, /\.segmented\b/u, 'a scoped rule for the track is a rule for nothing');
  });
}
