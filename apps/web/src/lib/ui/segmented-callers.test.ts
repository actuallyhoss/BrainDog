/**
 * THE FORM, THE ASK SHEET, THE SHARE MENU AND THE NEW ACTION SHEET DRAW THEIR SEGMENTED CONTROL THROUGH THE ONE PART
 * (`Segmented.svelte`), so each of them slides (DIRECTION 39).
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`<div class="segmented">`) has no `data-slides`, and `controls.css` leaves it the fill that fades out in one place
 * and in at another. Four tracks under `lib/ui` were written by hand: a choice of up to four on every list's form, what
 * an option shows on the ask sheet, how long a shared link lasts, and where a new action is sent.
 *
 * A TEXT TEST OVER MARKUP, as `routes/settings/[area]/areas/segmented.test.ts` is: there is no component test in this
 * tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CALLERS = ['RowForm.svelte', 'AskSheet.svelte', 'ShareMenu.svelte', 'NewAction.svelte'] as const;

/** A caller's source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const read = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** An element of the caller's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button a track holds. */
const SEGMENT = /\bclass="segment[\s"]/u;
/** The part, imported the way the file imports its neighbours. */
const IMPORT = /import Segmented from '(?:\.\/|\$lib\/ui\/)Segmented\.svelte';/u;

const markup = (text: string): string => text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = (text: string): string => /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';

for (const name of CALLERS) {
  const text = read(name);

  test(`${name}: still draws a segment`, () => {
    assert.match(markup(text), SEGMENT, `${name} no longer draws a segment; re-measure`);
  });

  test(`${name}: no track is written by hand`, () => {
    assert.doesNotMatch(markup(text), BY_HAND, 'a track written by hand does not slide');
  });

  test(`${name}: every segment sits in the part's track`, () => {
    assert.match(text, IMPORT, 'the part is not imported');
    /* Outside every `<Segmented>…</Segmented>` there is no segment left. */
    const outside = markup(text).replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
    assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
  });

  test(`${name}: a rule for the track reaches the part's element`, () => {
    /* The track is the part's element, not this file's, so a scoped `.segmented` matches nothing and is dropped. */
    const scoped = styles(text).replaceAll(/:global\([^)]*\)/gu, '');
    assert.doesNotMatch(scoped, /\.segmented\b/u, 'a scoped rule for the track is a rule for nothing');
  });
}

test('the form keeps its track a radiogroup named by the field label', () => {
  assert.match(markup(read('RowForm.svelte')), /<Segmented\s+role="radiogroup"\s+aria-labelledby=\{labelId\(f\)\}>/u);
});

test('the three sheets keep their track a named group', () => {
  assert.match(markup(read('AskSheet.svelte')), /<Segmented\s+role="group"\s+aria-labelledby="ask-shows-\{n\}">/u);
  assert.match(markup(read('ShareMenu.svelte')), /<Segmented\s+role="group"\s+aria-label=\{words\.shareDays\}>/u);
  assert.match(markup(read('NewAction.svelte')), /<Segmented\s+role="group"\s+aria-labelledby="new-action-channel">/u);
});

/* Each of the four is a choice of ONE, so each keeps the sliding selection: `many` takes the thumb away, and is for a
   track whose segments are pressed in and out. */
for (const name of CALLERS) {
  test(`${name}: a choice of one is not given many`, () => {
    const tracks = markup(read(name)).match(/<Segmented\b[^>]*>/gu) ?? [];
    assert.ok(tracks.length > 0, `${name} draws no track; re-measure`);
    for (const track of tracks) assert.doesNotMatch(track, /\smany\b/u, 'a choice of one has lost its sliding selection');
  });
}
