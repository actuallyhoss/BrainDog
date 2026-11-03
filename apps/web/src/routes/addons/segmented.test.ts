/**
 * EVERY SEGMENTED CONTROL UNDER PACKS IS THE ONE PART (`lib/ui/Segmented.svelte`), so every one of them slides.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`<div class="segmented">`) has no `data-slides`, and `controls.css` leaves it the fill that fades out in one place
 * and in at another. Four tracks here were written by hand: the order and the categories where packs are browsed, the
 * three tabs on the packs page, and a setting with a few choices on a pack's own page.
 *
 * A TEXT TEST OVER MARKUP, as `settings/[area]/areas/segmented.test.ts` is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HERE = new URL('./', import.meta.url);

/** The four files that draw a track (Add-ons' two halves moved to `AddonsTabs.svelte` on 20 October), each without its comments, so a comment quoting the old markup counts for nothing. */
/* THE STORE AND SHARE MOVED TO `/plugins` (3 Nov); the installed page's half stays here. */
const PAGES = ['[id]/Installed.svelte', '../plugins/+page.svelte', '../plugins/share/+page.svelte'].map((name) => ({
  name,
  text: readFileSync(new URL(name.replaceAll('[', '%5B').replaceAll(']', '%5D'), HERE), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, ''),
}));

/** An element of the page's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button or link a track holds. */
const SEGMENT = /\bclass="segment[\s"]/u;
/** The names these pages give their tracks, which land on the part's element. */
const TRACKS = ['order', 'chips', 'tabs', 'modes', 'addons-tabs'];

const markup = (text: string): string => text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = (text: string): string => (/<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '');

for (const { name, text } of PAGES) {
  test(`${name}: it still draws a segment`, () => {
    assert.match(markup(text), SEGMENT, `${name} no longer draws a segment; re-measure`);
  });

  test(`${name}: no track is written by hand`, () => {
    assert.doesNotMatch(markup(text), BY_HAND, 'a track written by hand does not slide');
  });

  test(`${name}: every segment sits in the part's track`, () => {
    assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u, 'the part is not imported');
    /* Outside every `<Segmented>…</Segmented>` there is no segment left. */
    const outside = markup(text).replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
    assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
  });

  test(`${name}: a rule for the track reaches the part's element`, () => {
    /* The track is the part's element, not this page's, so a scoped rule for it matches nothing and is dropped. */
    const scoped = styles(text).replaceAll(/:global\([^)]*\)/gu, '');
    for (const track of ['segmented', ...TRACKS]) {
      assert.doesNotMatch(scoped, new RegExp(`\\.${track}(?![\\w-])`, 'u'), `a scoped .${track} is a rule for nothing`);
    }
  });
}
