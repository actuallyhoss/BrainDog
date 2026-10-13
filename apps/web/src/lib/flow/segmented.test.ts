/**
 * EVERY SEGMENTED CONTROL ON A FLOW IS THE ONE PART (`lib/ui/Segmented.svelte`), so every one of them slides.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`<div class="segmented">`) has no `data-slides`, and `controls.css` leaves it the fill that fades out in one place
 * and in at another. Six tracks here were written by hand: five on the step's sheet (the trigger's kind, a list's
 * changes, a figure's crossing, an answer's shape, the fields an answer is about) and one where a flow is tried.
 *
 * TWO OF THE SHEET'S TRACKS TAKE MORE THAN ONE CHOICE (a list's changes, the fields an answer is about). They say so
 * to the part with `many`, which then draws no thumb and leaves every chosen segment its own fill. The sheet used to
 * mark them with a class of its own and give the later chosen segments their fill back; the last test holds that this
 * is gone.
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

test('the sheet: a track of more than one choice says so to the part, and fills nothing itself', () => {
  const sheet = PARTS.find((p) => p.name === 'Inspector.svelte')!;
  const all = tracks(sheet.text);
  const pressed = all.filter((t) => /\bonclick=\{\(\) => toggle[A-Z]/u.test(t));
  assert.equal(pressed.length, 2, "the tracks pressed in and out are a list's changes and the fields an answer is about; re-measure");
  /* `many` alone, as a word on the tag: `many={…}` would be a track that is sometimes one choice. */
  const MANY = /^<Segmented\b[^>]*\smany(?=[\s>])/u;
  for (const track of pressed) assert.match(track, MANY, 'a track of more than one choice does not tell the part');
  for (const track of all.filter((t) => !pressed.includes(t))) assert.doesNotMatch(track, MANY, 'a track of one choice has lost its thumb');
  /* The fill of a chosen segment is the part's and `controls.css`'s: no class and no rule of the sheet's own. */
  assert.doesNotMatch(markup(sheet.text), /\bclass="[^"]*\bmany\b/u, 'the sheet still marks the track with a class of its own');
  assert.doesNotMatch(styles(sheet.text), /\.many\b/u, 'the sheet still holds a rule for .many');
  assert.doesNotMatch(styles(sheet.text), /\[data-on\]\s*~/u, 'the sheet still fills the later chosen segments itself');
});
