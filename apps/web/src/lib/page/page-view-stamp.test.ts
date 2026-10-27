/**
 * A DECLARED PAGE THAT DRAWS WHAT IS NEW STAMPS THE READER'S MARK WHEN SHE LEAVES IT (PGS-C02), through the one stamp
 * Home and Activity use (`read-mark.ts` `stampOf`), and A HOME'S PAGE MENU IS ON THE SENTENCE'S ROW ON A PHONE (look
 * fault N).
 *
 * WHAT WAS MEASURED. A page with a `feed` `since: seen` showed the lines after the mark as new and never moved the
 * mark, so the same lines were new at every visit until Home or Activity was opened. And at 390 wide the "⋯" of Today
 * stood alone on a row of its own under the sentence, with about 60px of nothing over the first tile.
 *
 * A TEXT TEST OVER MARKUP, for the reason `segmented-view.test.ts` gives: there is no component test in this tree. The
 * leave itself is run here against `stampOf`, in the order the part calls it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampOf } from './read-mark.ts';

/** A part's source without its comments, so a comment quoting a call cannot fail or pass a check. */
function partOf(path: string) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const scripts = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gu)].map((m) => m[1]!).join('\n');
  const style = /<style[^>]*>([\s\S]*?)<\/style>/u.exec(text)?.[1] ?? '';
  const markup = text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');
  return { scripts, style, markup };
}

const view = partOf('./PageView.svelte');
const flat = (s: string) => s.replaceAll(/\s+/gu, ' ');

/** The `$effect` that holds `needle`, from its opening to the `});` that ends it at the script's own indent. */
function effectWith(needle: string): string {
  const at = view.scripts.indexOf(needle);
  assert.ok(at >= 0, `the script holds ${needle}`);
  const from = view.scripts.lastIndexOf('\n  $effect(', at);
  const to = view.scripts.indexOf('\n  });', at);
  assert.ok(from >= 0 && to > at, `${needle} is inside an effect`);
  return view.scripts.slice(from, to);
}

test('the page stamps through the one stamp, and sends the mark nowhere else', () => {
  assert.match(view.scripts, /import \{[^}]*\bstampOf\b[^}]*\} from '\.\/read-mark\.ts';/u);
  assert.equal(view.scripts.split('stampOf(').length - 1, 1, 'one stamp a page visited');
  const effect = flat(effectWith('stampOf('));
  /* IMPORTED WITH THE SCREEN, never inside the leave: a closing tab does not wait for a module. */
  assert.match(view.scripts, /import \{ markAll \} from '\$lib\/record\/mark-read\.ts';/u);
  assert.doesNotMatch(view.scripts, /import\('\$lib\/record\/(news-live|mark-read)\.ts'\)/u);
  assert.match(effect, /stampOf\(\(upTo\) => markAll\(base, upTo\)\)/u);
  assert.equal(view.scripts.split('markAll(').length - 1, 1, 'the mark is sent by the stamp alone');
  assert.doesNotMatch(view.scripts, /\bmarkRead\(/u);
});

test('what stamps is a feed of what is new since the mark, on a page at its own address', () => {
  const said = flat(view.scripts);
  const marks = /const marksNew = \$derived\(([^;]*)\);/u.exec(said)?.[1] ?? '';
  assert.match(marks, /mode === 'page'/u, 'Home stamps its own feed, and a preview writes nothing');
  assert.match(marks, /b\.kind === 'feed' && b\.since === 'seen'/u);
  assert.match(marks, /!b\.cannot/u, 'a feed this build could not draw showed nothing to mark read');
  assert.match(marks, /!showSource/u, 'the declaration as text shows no line of the log');
});

test('the reader leaves by closing the tab or by opening another page, and each visit has a stamp of its own', () => {
  const effect = flat(effectWith('stampOf('));
  assert.match(effect, /void slug;/u, 'the route keeps this part across pages, so the page names the visit');
  assert.match(effect, /addEventListener\('pagehide', leave\);/u);
  assert.match(effect, /return \(\) => \{ removeEventListener\('pagehide', leave\); leave\(\); \};/u);
  assert.match(effect, /void stamp\.leave\(/u);
  /* THE CURSOR AND THE RECORD ARE THE ONES THE PAGE OPENED ON: by the time the visit ends the address is the next one. */
  assert.match(effect, /const base = untrack\(\(\) => apiBase\(\)\);/u);
  assert.match(effect, /if \(marksNew\) drew = \{ upTo: shell\.upTo \?\? null \};/u);
});

test('leaving twice sends one mark, a page that drew nothing new sends none, and a mark that did not land is tried again', async () => {
  const sent: unknown[] = [];
  let lands = true;
  const stamp = stampOf(async (upTo) => {
    sent.push(upTo);
    return lands;
  });
  /* What the part's `leave` does with what the page drew. */
  const leave = (drew: { upTo: number | string | null } | null) => (drew ? stamp.leave(drew.upTo) : Promise.resolve(false));

  assert.equal(await leave(null), false, 'no feed since the mark was drawn');
  assert.equal(await leave({ upTo: null }), false, 'a shell that held nothing new has no cursor, and no cursor is no mark');
  assert.deepEqual(sent, []);

  lands = false;
  assert.equal(await leave({ upTo: 41 }), false);
  lands = true;
  const hidden = leave({ upTo: 41 });
  const gone = leave({ upTo: 41 });
  assert.deepEqual([await hidden, await gone], [true, false], 'the tab hidden, then the page left');
  assert.equal(await leave({ upTo: 41 }), false);
  assert.deepEqual(sent, [41, 41], 'one refused, one landed, and none after it');
});

/* ── fault N: a home's page menu on a phone ──────────────────────────────── */

/** The body of the first `@media` block whose condition is `condition`, to its closing brace. */
function mediaOf(condition: string): string {
  const head = `@media ${condition} {`;
  const at = view.style.indexOf(head);
  assert.ok(at >= 0, `the style holds ${head}`);
  let depth = 1;
  let i = at + head.length;
  for (; i < view.style.length && depth > 0; i++) depth += view.style[i] === '{' ? 1 : view.style[i] === '}' ? -1 : 0;
  return flat(view.style.slice(at + head.length, i - 1));
}

/** The declarations of the rule whose selector is exactly `selector`, inside `css`. */
function ruleOf(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `a rule for ${selector}`);
  return css.slice(at + selector.length + 2, css.indexOf('}', at));
}

const PHONE = '(hover: none) and (width <= 600px)';
/** Where a home's body stands right under its screen's sentence: nothing between the two but the gutter. */
const UNDER_SAID = ':global(.page-said + .page > .body:first-child) > .home-page:not([data-arranging])';

test('at 600px and under a home menu leaves its row and stands at the end of the sentence over the body', () => {
  const phone = mediaOf(PHONE);
  const tools = ruleOf(phone, `${UNDER_SAID} > .home-tools`);
  assert.match(tools, /position: absolute;/u);
  assert.match(tools, /inset-block-end: 100%;/u);
  assert.match(tools, /margin: 0;/u, 'no row of its own, and nothing empty over the first tile');
});

test('the sentence keeps the menu its room, so no word runs under it, and only where there is a menu', () => {
  const phone = mediaOf(PHONE);
  const said = ruleOf(phone, ':global(.page-said:has(+ .page > .body:first-child > .home-page:not([data-arranging]) > .home-tools :is(button, a)))');
  assert.match(said, /padding-inline-end: calc\(var\(--gutter\) \+ var\(--tap\) \+ var\(--sp-2\)\);/u);
});

test('the names the rule reaches for are the ones the head and Home draw', () => {
  const head = partOf('../ui/PageHead.svelte');
  const home = partOf('../home/Home.svelte');
  assert.match(head.markup, /<p class="page-said">/u);
  /* The sentence is the head's last line unless a line to type into is under it, and then the menu keeps its row. */
  assert.match(flat(head.markup), /<\/p> \{\/if\}.*\{#if below\}<div class="head-below">/u);
  /* The body may hold the desk before the page (`data-board`), and the page is still its own child. */
  assert.match(flat(home.markup), /<div class="page">.*<div class="body"[^>]*>.*<PageView\b[^>]*mode="home"/u);
});

test('a tablet keeps the row it had, and arranging keeps its own', () => {
  const touch = mediaOf('(hover: none)');
  assert.match(ruleOf(touch, '.home-page > .home-tools'), /position: static;/u);
  assert.match(ruleOf(flat(view.style), '.home-page[data-arranging] > .home-tools'), /position: static;/u);
});
