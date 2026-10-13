/**
 * FOUR SCREENS' SEGMENTED CONTROLS ARE THE ONE PART (`lib/ui/Segmented.svelte`), so all five tracks slide.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`class="segmented"` on the page's own element) has no `data-slides`, and `controls.css` leaves it the fill that
 * fades out in one place and in at another. Five were written by hand: a script's two groups (how often, and which
 * door), the health of an update on a track, the months of `/usage` (a `nav` of links, one of them this month), and
 * the old decide screen's group control.
 *
 * WHAT EACH KEEPS: its name for a screen reader, its pressed or current mark, and `data-on` on the chosen segment,
 * which is how the part finds it.
 *
 * A TEXT TEST OVER MARKUP, as `automations/segmented.test.ts` is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** A source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const FORM = { name: 'scripts/[id]/ScriptForm.svelte', text: read('./[id]/ScriptForm.svelte'), tracks: 2 };
const TRACK = { name: 't/[track]/+page.svelte', text: read('../t/[track]/+page.svelte'), tracks: 1 };
const USAGE = { name: 'usage/+page.svelte', text: read('../usage/+page.svelte'), tracks: 1 };
const DECIDE = { name: 'decide/Classic.svelte', text: read('../decide/Classic.svelte'), tracks: 1 };
const FILES = [FORM, TRACK, USAGE, DECIDE];

/** An element of the page's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button or link a track holds. */
const SEGMENT = /\bclass="(?:[^"]*\s)?segment[\s"]/u;

const markup = (text: string): string => text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = (text: string): string => /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
/** The rules left once every `:global(…)` is taken out: what Svelte scopes to this file's own elements. */
const scoped = (text: string): string => styles(text).replaceAll(/:global\([^)]*\)/gu, '');

for (const { name, text, tracks } of FILES) {
  test(`${name}: it still draws segments, or this measures nothing`, () => {
    assert.match(markup(text), SEGMENT);
  });

  test(`${name}: no track is written by hand`, () => {
    assert.doesNotMatch(markup(text), BY_HAND, 'a track written by hand does not slide');
  });

  test(`${name}: every segment sits in the part's track`, () => {
    assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u, 'the part is not imported');
    assert.equal(markup(text).match(/<Segmented\b/gu)?.length ?? 0, tracks, 'a track went missing, or one more appeared');
    const outside = markup(text).replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
    assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
  });

  test(`${name}: a rule for the track reaches the part's element`, () => {
    /* The track is the part's element, not this file's, so a scoped rule for it matches nothing and is dropped. */
    assert.doesNotMatch(scoped(text), /\.(?:segmented|months|group-by)(?![\w-])/u, 'a scoped rule for the track is a rule for nothing');
  });
}

test('a script: how often and which door are two named groups of pressed buttons', () => {
  const form = markup(FORM.text);
  assert.match(form, /<Segmented\b[^>]*\brole="group"[^>]*\baria-labelledby="script-every"/u);
  assert.match(form, /<Segmented\b[^>]*\brole="group"[^>]*\baria-labelledby="script-door"/u);
  assert.match(form, /aria-pressed=\{draft\.every === e\} data-on=\{draft\.every === e \? '' : undefined\}/u);
  assert.match(form, /aria-pressed=\{draft\.door === d\.id\} data-on=\{draft\.door === d\.id \? '' : undefined\}/u);
});

test('a track: the health of an update is a named group, the chosen one marked', () => {
  const page = markup(TRACK.text);
  assert.match(page, /<Segmented\b[^>]*\brole="group"[^>]*\baria-labelledby="update-health"/u);
  assert.match(page, /aria-pressed=\{draftHealth === v\} data-on=\{draftHealth === v \? '' : undefined\}/u);
});

test('usage: the months are a nav of links, and the month on screen is the current one', () => {
  const page = markup(USAGE.text);
  assert.match(page, /<Segmented\b[^>]*\btag="nav"/u, 'the track is not a nav');
  assert.match(page, /<Segmented\b[^>]*\bclass="months"/u, 'the track lost its name');
  assert.match(page, /<Segmented\b[^>]*\baria-label=\{words\.months\}/u, 'the nav lost its name for a screen reader');
  assert.match(page, /<span class="segment month" data-on aria-current="page">/u, 'the part finds the chosen segment by data-on');
  assert.equal(page.match(/<a class="segment month" href=\{at\(`\/usage\?month=/gu)?.length, 2, 'a month beside is not a link');
  /* The link's own rule is still this file's; only the track's half of the selector is the part's. */
  assert.match(styles(USAGE.text), /:global\(\.months\) \.month\s*\{[^}]*text-decoration:\s*none/u);
});

test('the old decide screen: the group control is a named group that gives way on a phone', () => {
  const page = markup(DECIDE.text);
  assert.match(page, /<Segmented\b[^>]*\bclass="group-by"[^>]*\brole="group"[^>]*\baria-label=\{copy\.decideGroup\}/u);
  assert.match(page, /aria-pressed=\{grouping === 'about'\}\s+data-on=\{grouping === 'about' \? '' : undefined\}/u);
  /* Named by its own class as well as the part's: the control is drawn in the page head, outside this file's `.page`,
     so a bare `:global(.segmented)` would hide every other screen's control on a phone. */
  const css = styles(DECIDE.text);
  assert.match(css, /@media \(width < 900px\) \{[\s\S]*?:global\(\.segmented\.group-by\)\s*\{\s*display:\s*none;/u);
  assert.doesNotMatch(css, /:global\(\.segmented\)\s*\{/u, 'a rule for every track on every screen');
  assert.match(css, /:global\(\.head\[data-under\] \.segmented\.group-by\)\s*\{/u);
});
