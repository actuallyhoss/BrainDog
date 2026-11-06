/**
 * The shell's moves stay smooth (fluid F1).
 *
 * A press lights at once and the page changes with no pause and no fade, a change a screen cross-fades itself sends the
 * old picture out before the new one arrives (never two titles), a stale shell is replaced only when
 * nothing is moving (or it takes the tap that came with it), and a theme change fades the old window over the new one.
 * Read out of the shell and the sheet as text, and the one rule that is code is cut out and run (`place-arrived.test.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const shell = read('../lib/shell/AppFrame.svelte');
const code = shell.replace(/<!--[\s\S]*?-->/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '');
/* The view transitions' rules left `app.css` for a sheet asked after the first draw (speed4, 2 Nov); both are read. */
const sheet = read('../app.css') + read('../lib/motion/transitions.css') + read('../lib/motion/motion.css');
const css = sheet.replace(/\/\*[\s\S]*?\*\//gu, '');

const tokens = read('../../../../packages/skin/tokens.css');
const token = (name: string): number => {
  const m = new RegExp(`${name}:\\s*(\\d+)ms`, 'u').exec(tokens);
  assert.ok(m, `${name} is a millisecond token`);
  return Number(m[1]);
};

test('a move between screens is a cut: no fade holds the page back, and the browser never stops drawing for one', () => {
  assert.doesNotMatch(code, /onNavigate/u);
  assert.doesNotMatch(code, /startViewTransition/u);
  assert.match(code, /document\.documentElement\.dataset\.opening = '';/u);
  assert.match(sheet, /:root:is\(\[data-moving\], \[data-opening\]\) \[data-arrive\] \{\s*transition: none;/u);
});

test('a stale shell is replaced once the record has answered and nothing is moving', () => {
  const from = code.indexOf('const replaceNow =');
  assert.notEqual(from, -1, 'the shell has no `replaceNow`');
  const plain = stripTypeScriptTypes(code.slice(from, code.indexOf(';\n', from) + 1));
  const replaceNow = new Function(`${plain}\nreturn replaceNow;`)() as (heard: boolean, stale: boolean | undefined, moving: boolean) => boolean;
  assert.equal(replaceNow(true, true, false), true);
  assert.equal(replaceNow(true, true, true), false, 'a tap that is on its way is not taken over');
  assert.equal(replaceNow(false, true, false), false, 'the record has not answered');
  assert.equal(replaceNow(true, false, false), false);
  assert.equal(replaceNow(true, undefined, false), false);
  assert.match(code, /import \{ navigating, page \} from '\$app\/state';/u);
  assert.match(code, /replaceNow\(bootHeard, data\.stale, navigating\.to !== null\)/u);
});

test('the old picture leaves before the new one arrives, and the two last no longer than a page change', () => {
  const old = /::view-transition-old\(page\) \{\s*animation: page-out var\((--d-[\w-]+)\)/u.exec(css);
  const now = /::view-transition-new\(page\) \{\s*animation: page-in calc\(var\((--d-[\w-]+)\) - var\((--d-[\w-]+)\)\) var\(--ease-out\) var\((--d-[\w-]+)\) both;/u.exec(css);
  assert.ok(old && now, 'both pictures are timed');
  assert.equal(now[2], old[1], 'the new picture takes what is left after the old one');
  assert.equal(now[3], old[1], 'and starts when the old one has gone');
  assert.equal(token(now[1]!), token('--d-page'));
  assert.ok(token('--d-page') <= 100, 'nothing is over 100ms');
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*::view-transition-old\(page\),\s*::view-transition-new\(page\) \{\s*animation: none;/u);
});

test('a theme change fades the old window over the new one, and is cut when asked for less motion', () => {
  assert.match(css, /html\[data-retheme\]::view-transition-old\(root\) \{\s*z-index: var\(--z-raise\);/u);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*html\[data-retheme\]::view-transition-old\(root\) \{\s*z-index: auto;\s*animation: none;/u);
});

test('an answer taken leaves no receipt fade of its own', () => {
  const card = read('../lib/decide/DecisionCard.svelte');
  assert.doesNotMatch(card, /qa-in(?![\w-])/u, 'the receipt replaces the card in place; it does not fade in again');
});

test('a figure that goes fades quickly, and not at all when asked for less motion', () => {
  const figure = read('../lib/ui/Figure.svelte');
  assert.match(figure, /out:leave/u);
  /* OR A COUNTING FIGURE'S OWN ROLL, which leaves nothing to fade (3bbe843f1). */
  assert.match(figure, /duration: still\(\) \|\| calm\(\) \|\| counting\(figure\.textContent \?\? '', said\) \? 0 : ms\('--d-exit', 90\)/u);
});
