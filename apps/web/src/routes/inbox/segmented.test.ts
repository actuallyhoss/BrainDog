/**
 * THE INBOX'S SERIES SWITCH IS THE ONE PART (`lib/ui/Segmented.svelte`), so its selection slides.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`class="segmented …"` on the page's own element) has no `data-slides`, and `controls.css` leaves it the fill that
 * fades out in one place and in at another. Waiting, Filed and Archived were written by hand here.
 *
 * THE PATTERN BUILDER'S STEPS ARE NOT MEASURED (`pattern/+page.svelte`): an `ol` of four steps in order inside a `nav`,
 * some of them not yet reachable. That is a path walked, not a switch between views, and the part's track is a `div`
 * or a `nav` holding its segments directly, which a list of `li` is not.
 *
 * A TEXT TEST OVER MARKUP, as `automations/segmented.test.ts` is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const text = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** An element of the page's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button a track holds. */
const SEGMENT = /\bclass="(?:[^"]*\s)?segment[\s"]/u;

const markup = text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
/** The rules left once every `:global(…)` is taken out: what Svelte scopes to this file's own elements. */
const scoped = styles.replaceAll(/:global\((?:[^()]|\([^)]*\))*\)/gu, '');

test('it still draws segments, or this measures nothing', () => {
  assert.match(markup, SEGMENT);
});

test('no track is written by hand', () => {
  assert.doesNotMatch(markup, BY_HAND, 'a track written by hand does not slide');
});

test("every segment sits in the part's track", () => {
  assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u, 'the part is not imported');
  const outside = markup.replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
  assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
});

test('the series is a named group, and the part finds the chosen one by data-on', () => {
  assert.match(markup, /<Segmented\b[^>]*\bclass="series"[^>]*\brole="group"[^>]*\baria-label=\{words\.series\}/u);
  const track = /<Segmented\b[\s\S]*?<\/Segmented>/u.exec(markup)?.[0] ?? '';
  assert.match(track, /\baria-pressed=\{view === s\.v\}/u);
  assert.match(track, /\bdata-on=\{view === s\.v \? '' : undefined\}/u);
  assert.match(track, /\bonclick=\{\(\) => show\(s\.v\)\}/u);
});

test('a count stays beside its word, in the page own scoped rule', () => {
  const track = /<Segmented\b[\s\S]*?<\/Segmented>/u.exec(markup)?.[0] ?? '';
  assert.match(track, /\{#if s\.n\}<span class="segment-n num">\{s\.n\}<\/span>\{\/if\}/u);
  /* The count is this file's own element inside the part, so its rule stays scoped and still reaches it. */
  assert.match(scoped, /\.segment-n\s*\{/u);
});

test("a rule for the track reaches the part's element", () => {
  /* The track is the part's element, not this file's, so a scoped rule for it matches nothing and is dropped. */
  assert.doesNotMatch(scoped, /\.(?:segmented|series)(?![\w-])/u, 'a scoped rule for the track is a rule for nothing');
  assert.match(styles, /:global\(\.head\[data-under\] \.series\)/u, 'the track under the compact title row lost its rule');
});
