/**
 * EVERY SEGMENTED CONTROL OVER A LIST IS THE ONE PART (`lib/ui/Segmented.svelte`), so every one of them slides.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`<div class="segmented">`) has no `data-slides`, and `controls.css` leaves it the fill that fades out in one place
 * and in at another. Two tracks here were written by hand after `ViewSwitch` took the part: the direction of a sort in
 * the Display sheet, and a field of two values in the bar over the list.
 *
 * A TEXT TEST OVER MARKUP, as the one beside Settings' areas is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const HERE = new URL('./', import.meta.url);

/** Each part's source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const PARTS = readdirSync(HERE)
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
const styles = (text: string): string => /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
const part = (name: string): string => PARTS.find((p) => p.name === name)?.text ?? '';

test('the parts are read, and the ones known to hold a track are among them', () => {
  const holding = PARTS.filter((p) => SEGMENT.test(markup(p.text))).map((p) => p.name);
  for (const name of ['ChipsBar.svelte', 'DisplayMenu.svelte', 'ViewSwitch.svelte']) {
    assert.ok(holding.includes(name), `${name} no longer draws a segment; re-measure`);
  }
});

for (const { name, text } of PARTS) {
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
    /* The track is the part's element, not this file's, so a scoped rule for it matches nothing and is dropped. */
    const scoped = styles(text).replaceAll(/:global\([^)]*\)/gu, '');
    assert.doesNotMatch(scoped, /\.segmented\b/u, 'a scoped rule for the track is a rule for nothing');
    for (const cls of /<Segmented\b[^>]*?\bclass="([^"]+)"/gu[Symbol.matchAll](markup(text))) {
      for (const word of cls[1]!.split(/\s+/u).filter(Boolean)) {
        assert.ok(!new RegExp(`\\.${word}(?![\\w-])`, 'u').test(scoped), `.${word} is scoped, and the track is not this file's element`);
      }
    }
  });
}

test('the bar: a second value that is on keeps a fill of its own', () => {
  /* A FIELD'S VALUES ARE TOGGLES, so both of two can be on. The thumb sits under the first, and `controls.css` takes
     the fill off every chosen segment under a thumb, which would leave the second one looking off. */
  assert.match(
    styles(part('ChipsBar.svelte')),
    /:global\(\.sift-track\[data-thumb\]\)\s+\.segment\[data-on\]\s*~\s*\.segment\[data-on\]\s*\{[^}]*background:\s*var\(--tile\)/u,
  );
});
