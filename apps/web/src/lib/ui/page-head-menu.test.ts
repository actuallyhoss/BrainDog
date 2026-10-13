/**
 * The page menu's place at the end of the head's last row on a phone (`PageHead.svelte`, look fault N).
 *
 * Home's body brings its own ⋯ (`PageView.svelte`'s `.home-tools`), and on a touch screen at 600px and under it took a
 * row of its own over the first tile wherever the head ended on something other than its sentence. The default Today
 * ends on the line a task is typed into (`below`), so the head keeps a tap's room at the end of that row and the ⋯ is
 * raised into it.
 *
 * A text test over the component, as `routes/packs/segmented.test.ts` is: Node cannot draw a Svelte file, so this
 * reads the markup and the rules that ship.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(process.env.PAGE_HEAD_SRC ?? join(HERE, 'PageHead.svelte'), 'utf8');
const STYLE = /<style>([\s\S]*)<\/style>/.exec(SOURCE)?.[1] ?? '';
const MARKUP = SOURCE.slice(SOURCE.indexOf('</script>'), SOURCE.indexOf('<style>'));

/** The body of the one `@media` block that opens with `query`, braces matched. */
function media(css: string, query: string): string {
  const from = css.indexOf(`@media ${query} {`);
  if (from < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', from); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', from) + 1, i);
  }
  return '';
}

/** The declarations of the first rule in `css` whose selector holds every one of `parts`. */
function rule(css: string, ...parts: string[]): string {
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (parts.every((p) => m[1]!.includes(p))) return m[2]!;
  }
  return '';
}

const PHONE = media(STYLE, '(hover: none) and (width <= 600px)');
/** Home's body with its menu, right under the head's last row, and not while it is being arranged. */
const BODY = '+ .page > .body:first-child > .home-page:not([data-arranging]) > .home-tools';

test('the row under the sentence is the last thing the head draws, so the page follows it', () => {
  const last = MARKUP.trimEnd().split('\n').at(-1) ?? '';
  assert.match(last, /^\{#if below\}<div class="head-below">\{@render below\(\)\}<\/div>\{\/if\}$/);
});

test('the place is a phone on a touch screen: 600px and under, where nothing hovers', () => {
  assert.notEqual(PHONE, '', 'PageHead.svelte holds a rule for (hover: none) and (width <= 600px)');
});

test('the row keeps a tap of room at its end, and only where a menu is there to take it', () => {
  const room = rule(PHONE, '.head-below:has(', BODY, ':is(button, a)');
  assert.match(room, /padding-inline-end:\s*calc\(var\(--gutter\) \+ var\(--tap\) \+ var\(--sp-2\)\);/);
});

test('the menu is raised into that room, off the row it had over the first tile', () => {
  const raised = rule(PHONE, `.head-below ${BODY}`);
  assert.match(raised, /position:\s*absolute;/);
  assert.match(raised, /margin:\s*0;/);
  /* Over the body's top by the room the page leaves under its head, so it sits level with the row. */
  assert.match(raised, /inset-block-end:\s*calc\(100% \+ var\(--sp-4\)\);/);
});

test('the room is at the end the page reads to, never a left or a right', () => {
  assert.doesNotMatch(PHONE, /padding-(left|right)|[^-](left|right):/);
});

test('from 601px and at a pointer the row keeps its whole width', () => {
  const rest = STYLE.replace(PHONE, '');
  assert.doesNotMatch(rest, /\.head-below[^{]*\.home-tools/);
});
