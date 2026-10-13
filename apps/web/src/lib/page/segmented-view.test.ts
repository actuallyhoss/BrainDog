/**
 * THE LAST THREE TRACKS WRITTEN BY HAND ARE THE ONE PART (`lib/ui/Segmented.svelte`), so each of them slides: the
 * switch between now and after on a page's preview (`PageView`), the pages of an add-on's preview (`PreviewPage`), and
 * the design sheet's own specimens (`SheetControls`).
 *
 * WHAT WAS MEASURED. A track written by hand (`<div class="segmented">`) has no `data-slides`, and `controls.css`
 * leaves it the fill that fades out in one place and in at another. The list of batch 71 missed the preview's switch.
 *
 * A TEXT TEST OVER MARKUP, for the reason `people-names.test.ts` gives: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** A part's source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
function partOf(path: string) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const scripts = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gu)].map((m) => m[1]!).join('\n');
  const style = /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
  const markup = text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
  /** Each track the part draws: its opening tag and what it holds. */
  const tracks = [...markup.matchAll(/<Segmented\b([^>]*)>([\s\S]*?)<\/Segmented>/gu)].map((m) => ({
    tag: m[1]!.trim().replaceAll(/\s+/gu, ' '),
    held: m[2]!,
  }));
  return { scripts, style, markup, tracks };
}

const PARTS = {
  PageView: partOf('./PageView.svelte'),
  PreviewPage: partOf('../market/PreviewPage.svelte'),
  SheetControls: partOf('../design/SheetControls.svelte'),
};

/** An element of the page's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;

for (const [name, part] of Object.entries(PARTS)) {
  test(`${name} imports the part`, () => {
    assert.match(part.scripts, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u);
  });

  test(`${name} writes no track by hand`, () => {
    assert.doesNotMatch(part.markup, BY_HAND, 'a track written by hand does not slide');
  });

  test(`${name} keeps every segment inside a track, and says which is chosen`, () => {
    assert.equal(part.tracks.length, 1);
    const outside = part.markup.replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
    assert.doesNotMatch(outside, /\bclass="segment[\s"]/u, 'a segment outside the part has no track');
    const segments = part.tracks[0]!.held.match(/<button\b[^>]*\bclass="segment"[^>]*>/gu) ?? [];
    assert.ok(segments.length > 0, 'a track with no segment');
    for (const segment of segments) assert.match(segment, /\bdata-on=/u, 'the part finds the chosen segment by data-on');
  });

  test(`${name} has no rule that needs the track to be its own element`, () => {
    /* The track is the part's element, so a scoped `.segmented`, `.compare-switch` or `.tabs` rule would match
       nothing: each is reached through `:global`. */
    const scoped = part.style.replaceAll(/:global\([^)]*\)/gu, '');
    assert.doesNotMatch(scoped, /\.(?:segmented|compare-switch|tabs)\b/u);
  });
}

test('the preview switch is a named group of two pressed buttons', () => {
  const [track] = PARTS.PageView.tracks;
  assert.equal(track!.tag, 'class="compare-switch" role="group" aria-label={words.compare}');
  assert.equal(track!.held.match(/\baria-pressed=\{showing === '(?:was|after)'\}/gu)?.length, 2);
  assert.match(PARTS.PageView.style, /:global\(\.compare-switch\)\s*\{\s*justify-self: start;/u);
  assert.match(PARTS.PageView.style, /:global\(\.compare-switch\)\s*\{\s*display: none;/u, 'no switch side by side');
});

test("an add-on's pages are still tabs", () => {
  const [track] = PARTS.PreviewPage.tracks;
  assert.equal(track!.tag, 'class="tabs" role="tablist" aria-label={words.pages}');
  assert.match(track!.held, /<button\b[^>]*\brole="tab" aria-selected=\{i === at\}/u);
  assert.match(PARTS.PreviewPage.markup, /role="tabpanel"/u);
});

test('the sheet draws its specimens with the part', () => {
  const [track] = PARTS.SheetControls.tracks;
  assert.equal(track!.tag, 'role="group" aria-label={words.choices(n)}');
  assert.match(track!.held, /aria-pressed=\{picked\[n\] === i\}/u);
});
