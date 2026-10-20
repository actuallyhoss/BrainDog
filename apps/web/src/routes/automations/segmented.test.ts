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
 * AND THE HUB'S TABS ARE DRAWN ONCE, in the layout over `/automations` and `/automations/runs` (`+layout.svelte`). Runs
 * is its own page, and while each page drew its own head, going there drew a new control with nowhere to slide from:
 * the first placing is a jump (`slides` in the part), so the claim "it slides" was false for that one move. A control
 * that outlives the page change has its `data-on` moved, which is what the part slides on.
 *
 * A TEXT TEST OVER MARKUP, as `settings/[area]/areas/segmented.test.ts` is: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { emptyHead, headFor, tabHere } from './hub-head.ts';

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

/* ── the one head over the hub's two screens ── */

const LAYOUT = read('./+layout.svelte');
const HUB_PAGES = [
  { name: '+page.svelte', text: read('./+page.svelte') },
  { name: 'runs/+page.svelte', text: read('./runs/+page.svelte') },
];

test('the hub: the tabs are drawn once, in the layout, on the tab the address names', () => {
  const drawn = markup(LAYOUT);
  assert.equal(drawn.match(/<HubTabs\b/gu)?.length, 1, 'the layout draws the tabs once');
  assert.match(drawn, /<HubTabs here=\{at\} full=\{phone\.current\} \/>/u, 'the tab is the address\'s, so it moves without a redraw');
  assert.match(drawn, /\{@render tabs\(tab\)\}/u, 'the snippet is handed the address\'s tab');
  assert.match(LAYOUT, /const tab = \$derived\(tabHere\(page\.route\.id, page\.url\.searchParams\)\);/u);
  assert.match(drawn, /\{@render children\(\)\}/u, 'the page is drawn under the head');
  /* The head is not inside a block keyed on the address: a key would draw it again, and a new control jumps. */
  assert.doesNotMatch(drawn, /\{#key\b/u);
});

for (const { name, text } of HUB_PAGES) {
  test(`${name}: it draws no head or tabs of its own, or the move to it is a redraw and not a slide`, () => {
    assert.doesNotMatch(text, /HubTabs/u);
    assert.doesNotMatch(text, /PageHead/u);
    assert.match(text, /const head = hubHead\(\);/u, 'what it read never reaches the head');
  });
}

test('one automation: its own screen sits under the layout and keeps its own head', () => {
  assert.match(FILES[1]!.text, /<PageHead\b/u);
});

test('the hub: the head is drawn over its two screens and nothing else', () => {
  const none = new URLSearchParams();
  assert.equal(tabHere('/automations', none), 'automations');
  assert.equal(tabHere('/automations', new URLSearchParams('tab=scripts')), 'scripts');
  assert.equal(tabHere('/automations', new URLSearchParams('new=door')), 'doors');
  assert.equal(tabHere('/automations/runs', none), 'runs');
  /* Runs is an address, never a `?tab=`: one asked for that way does not move the selection off the page drawn. */
  assert.equal(tabHere('/automations/runs', new URLSearchParams('tab=scripts')), 'runs');
  assert.equal(tabHere('/automations/[id]', none), null);
  assert.equal(tabHere('/scripts', none), null);
  assert.equal(tabHere(null, none), null);
});

test('the hub: each tab shows its own figure, never one the other page left behind', () => {
  const head = { ...emptyHead(), automations: 4, said: { text: '4 run by themselves. Chase invoices is failing.', needs: 'Chase invoices is failing.' }, runs: 31 };
  assert.deepEqual(headFor('automations', head), { count: 4, sentence: head.said.text, needs: head.said.needs });
  assert.deepEqual(headFor('runs', head), { count: 31, sentence: undefined, needs: undefined });
  for (const tab of ['scheduled', 'scripts', 'doors'] as const) {
    assert.deepEqual(headFor(tab, head), { count: undefined, sentence: undefined, needs: undefined });
  }
  /* Nothing read yet is nothing shown, and a sentence with no urgent phrase marks none. */
  assert.deepEqual(headFor('runs', emptyHead()), { count: undefined, sentence: undefined, needs: undefined });
  assert.equal(headFor('automations', { ...emptyHead(), said: { text: '2 run by themselves.', needs: '' } }).needs, undefined);
});
