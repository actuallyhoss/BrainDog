/**
 * THE TWO SEGMENTED CONTROLS UNDER AUTOMATIONS ARE THE ONE PART (`lib/ui/Segmented.svelte`), so both slide.
 *
 * WHAT WAS MEASURED. The part draws the track and moves the selection under the chosen segment; a track written by hand
 * (`class="… segmented"` on the page's own element) has no `data-slides`, and `controls.css` leaves it the fill that
 * fades out in one place and in at another. Two were written by hand here: the hub's tabs (`HubTabs.svelte`, a `nav`
 * of links) and the four tabs of one automation (`[id]/+page.svelte`).
 *
 * THE HUB'S TABS KEEP WHAT THEY DID BEFORE: links with `aria-current`, one line that scrolls inside itself, and the
 * tab you are on scrolled into view.
 *
 * A TEXT TEST OVER MARKUP, as `settings/[area]/areas/segmented.test.ts` is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** A source without its comments, so a comment quoting the old markup cannot fail or pass a check. */
const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const FILES = [
  { name: 'HubTabs.svelte', text: read('./HubTabs.svelte') },
  { name: '[id]/+page.svelte', text: read('./[id]/+page.svelte') },
];

/** An element of the page's own (a lower-case tag) that carries the track's class. */
const BY_HAND = /<[a-z][a-z0-9]*\b[^>]*\bclass="[^"]*\bsegmented\b/u;
/** A segment: the button or link a track holds. */
const SEGMENT = /\bclass="(?:[^"]*\s)?segment[\s"]/u;

const markup = (text: string): string => text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
const styles = (text: string): string => /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
/** The rules left once every `:global(…)` is taken out: what Svelte scopes to this file's own elements. */
const scoped = (text: string): string => styles(text).replaceAll(/:global\([^)]*\)/gu, '');

for (const { name, text } of FILES) {
  test(`${name}: it still draws segments, or this measures nothing`, () => {
    assert.match(markup(text), SEGMENT);
  });

  test(`${name}: no track is written by hand`, () => {
    assert.doesNotMatch(markup(text), BY_HAND, 'a track written by hand does not slide');
  });

  test(`${name}: every segment sits in the part's track`, () => {
    assert.match(text, /import Segmented from '\$lib\/ui\/Segmented\.svelte';/u, 'the part is not imported');
    const outside = markup(text).replaceAll(/<Segmented\b[\s\S]*?<\/Segmented>/gu, '');
    assert.doesNotMatch(outside, SEGMENT, 'a segment is drawn outside the track');
  });

  test(`${name}: a rule for the track reaches the part's element`, () => {
    /* The track is the part's element, not this file's, so a scoped rule for it matches nothing and is dropped. */
    assert.doesNotMatch(scoped(text), /\.(?:segmented|hub-tabs|tabs)(?![\w-])/u, 'a scoped rule for the track is a rule for nothing');
  });
}

test('the hub: a nav of links, each an address, the one you are on marked', () => {
  const hub = markup(FILES[0]!.text);
  assert.match(hub, /<Segmented\b[^>]*\btag="nav"/u, 'the track is not a nav');
  assert.match(hub, /<Segmented\b[^>]*\bclass="hub-tabs"/u, 'the track lost its name');
  assert.match(hub, /<Segmented\b[^>]*\baria-label=\{hubWords\.tabs\}/u, 'the nav lost its name for a screen reader');
  assert.match(hub, /<a\b[^>]*\baria-current=\{t\.id === here \? 'page' : undefined\}/u);
  assert.match(hub, /<a\b[^>]*\bdata-on=\{t\.id === here \? '' : undefined\}/u, 'the part finds the chosen segment by data-on');
});

test('the hub: one line that scrolls inside itself, never two', () => {
  const css = styles(FILES[0]!.text);
  const rule = /:global\(\.hub-tabs\)\s*\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(rule, /flex-wrap:\s*nowrap/u);
  assert.match(rule, /overflow-x:\s*auto/u);
});

test('the hub: the tab you are on is scrolled into view, and again when it changes', () => {
  const hub = FILES[0]!.text;
  assert.match(hub, /\[aria-current="page"\]'\)\?\.scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/u);
  /* The part does not hand out its element, so the bar is found from the track itself, as it is attached. */
  assert.match(markup(hub), /<Segmented\b[^>]*\{@attach /u, 'nothing finds the bar');
  assert.doesNotMatch(markup(hub), /bind:this/u, 'a bind on the part binds the component, not the bar');
});

test('one automation: its tabs are a named group that wraps on a narrow screen', () => {
  const page = FILES[1]!.text;
  assert.match(markup(page), /<Segmented\b[^>]*\bclass="tabs"[^>]*\brole="group"[^>]*\baria-label=\{title\}/u);
  const rule = /:global\(\.tabs\)\s*\{([^}]*)\}/u.exec(styles(page))?.[1] ?? '';
  assert.match(rule, /flex-wrap:\s*wrap/u);
  assert.match(rule, /max-inline-size:\s*100%/u);
});
