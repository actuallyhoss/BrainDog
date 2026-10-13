/**
 * EVERY SEGMENTED CONTROL ON A FLOW IS THE ONE PART (`lib/ui/Segmented.svelte`), so every one of them slides.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`<div class="segmented">`) has no `data-slides`, and `controls.css` leaves it the fill that fades out in one place
 * and in at another. Six tracks here were written by hand: five on the step's sheet (the trigger's kind, a list's
 * changes, a figure's crossing, an answer's shape, the fields an answer is about) and one where a flow is tried.
 *
 * TWO OF THE SHEET'S TRACKS TAKE MORE THAN ONE CHOICE (a list's changes, the fields an answer is about). The part
 * draws one thumb, under the first chosen segment, and `controls.css` takes the fill from every chosen segment once
 * the thumb is placed, so the sheet gives the later ones their fill back. The last test holds that.
 *
 * A TEXT TEST OVER MARKUP, as `routes/settings/[area]/areas/segmented.test.ts` is: there is no component test in this
 * tree.
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

/** An element of the part's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button or link a track holds. */
const SEGMENT = /\bclass="segment[\s"]/u;

const markup = (text: string): string => text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = (text: string): string => /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
const tracks = (text: string): string[] => markup(text).match(/<Segmented\b[\s\S]*?<\/Segmented>/gu) ?? [];

test('the parts are read, and the two known to hold a track are among them', () => {
  const holding = PARTS.filter((p) => SEGMENT.test(markup(p.text))).map((p) => p.name);
  for (const name of ['Inspector.svelte', 'Tried.svelte']) {
    assert.ok(holding.includes(name), `${name} no longer draws a segment; re-measure`);
  }
});

for (const { name, text } of PARTS) {
  test(`${name}: no track is written by hand`, () => {
    assert.doesNotMatch(markup(text), BY_HAND, 'a track written by hand does not slide');
    assert.doesNotMatch(markup(text), /\bclass="[^"]*\bsegmented\b/u, "the track's class is the part's to write");
  });

  test(`${name}: every segment sits in the part's track`, () => {
    const page = markup(text);
    if (!SEGMENT.test(page)) return;
    assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u, 'the part is not imported');
    /* Outside every `<Segmented>…</Segmented>` there is no segment left. */
    const outside = page.replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
    assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
  });

  test(`${name}: every segment still says which is chosen`, () => {
    /* `data-on` is what the part measures and `aria-pressed` what a screen reader is told. */
    for (const track of tracks(text)) {
      for (const button of track.match(/<button\b[^>]*\bclass="segment[\s"][^>]*>/gu) ?? []) {
        assert.match(button, /\bdata-on=\{/u, `no data-on: ${button}`);
        assert.match(button, /\baria-pressed=\{/u, `no aria-pressed: ${button}`);
      }
    }
  });

  test(`${name}: no rule asks for a segment as the track's child`, () => {
    /* `:global(.track) > .segment` is dropped by the compiler ("unused"), so the rule would never be drawn. */
    assert.doesNotMatch(styles(text), /:global\([^)]*\)\s*>/u, 'a child rule through the part is dropped; use a space');
  });

  test(`${name}: a rule for the track reaches the part's element`, () => {
    /* The track is the part's element, so a scoped rule that starts from the track's class matches nothing. */
    const css = styles(text);
    const scoped = css.replaceAll(/:global\([^)]*\)/gu, '');
    assert.doesNotMatch(scoped, /\.segmented\b/u, 'a scoped rule for the track is a rule for nothing');
    for (const track of tracks(text)) {
      for (const cls of (/^<Segmented\b[^>]*\bclass="([^"]*)"/u.exec(track)?.[1] ?? '').split(/\s+/u).filter(Boolean)) {
        assert.doesNotMatch(scoped, new RegExp(`\\.${cls}(?![\\w-])`, 'u'), `.${cls} is on the part's element and is ruled as if it were here`);
      }
    }
  });
}

test('the sheet: a track of more than one choice keeps a fill on every chosen segment', () => {
  const sheet = PARTS.find((p) => p.name === 'Inspector.svelte')!;
  const many = tracks(sheet.text).filter((t) => /\bonclick=\{\(\) => toggle[A-Z]/u.test(t));
  assert.equal(many.length, 2, 'the tracks pressed in and out are a list\'s changes and the fields an answer is about; re-measure');
  for (const track of many) assert.match(track, /^<Segmented\b[^>]*\bclass="[^"]*\bmany\b/u, 'a track of more than one choice is not marked');
  /* One thumb is drawn, under the first chosen segment: each chosen one after it is filled by the sheet. A space and
     not `>` after the track: the compiler cannot see through the part to the segment's parent, and drops a child rule
     as one that matches nothing. */
  assert.match(
    styles(sheet.text).replaceAll(/\s+/gu, ' '),
    /:global\(\.many\[data-thumb\]\) \.segment\[data-on\] ~ \.segment\[data-on\] \{ background: var\(--tile\);/u,
    'the second chosen segment has no fill once the thumb is placed',
  );
});
