/**
 * DECIDE'S HEAD IS THE SIBLING BEFORE ITS PAGE, as Home draws it.
 *
 * On a phone the page menu is raised to the end of the screen's sentence, and the rule that raises it
 * (`PageView.svelte`, look fault N) reads the markup: the head's sentence, then `.page`, with nothing
 * between. Decide drew its head inside a `div` of its own and the sheet for asking a question after
 * it, so the sentence was never the sibling before `.page`, the rule never reached Decide, and the
 * menu kept a row of its own over the first question. No type check sees a wrapper, so this reads the
 * screen's own text, the way `lists-wired.test.ts` does.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
/** The screen with its comments taken out, so a note between two tags is not read as something drawn. */
const bare = source.replace(/<!--[\s\S]*?-->/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '');
const markup = bare.slice(bare.indexOf('</script>') + '</script>'.length, bare.indexOf('<style>'));
const styles = bare.slice(bare.indexOf('<style>'));

test('the head is drawn once, with no element of its own round it', () => {
  assert.equal(markup.match(/<PageHead\b/gu)?.length, 1, 'Needs you draws one head');
  assert.doesNotMatch(source, /decide-head/u, 'the wrapper round the head is back');
  const before = markup.slice(0, markup.indexOf('<PageHead'));
  const opened = (before.match(/<[a-z][^>]*[^/]>/gu) ?? []).length;
  const closed = (before.match(/<\/[a-z][^>]*>/gu) ?? []).length;
  assert.equal(opened, closed, 'the head is inside an element, so its sentence has no sibling');
});

test('nothing is drawn between the head and the page', () => {
  assert.match(markup, /<\/PageHead>\s*<div class="page"(?: inert=\{fromCopy\})?(?: data-selecting=\{selecting \? '' : undefined\})?>/u, 'something stands between the head’s sentence and .page');
});

test('the sheet for asking a question is still drawn, after the page', () => {
  const page = markup.indexOf('<div class="page"');
  const sheet = markup.indexOf('<AskSheet');
  assert.ok(sheet > page, 'the sheet is drawn before the page, between it and the head');
  assert.match(markup, /<AskSheet open=\{asking\} onclose=\{\(\) => \(asking = false\)\} onfiled=\{filed\} \/>/u);
});

/* A lone "…" on a line of its own under the phone's switch, the page's own menu, which
   the raise in `PageView` reaches only where the body stands first under the head. Under the switch it is not drawn. */
test('under the phone’s switch the page’s own menu is not drawn on a line of its own', () => {
  const narrow = [...styles.matchAll(/@media \(width < 900px\) \{([\s\S]*?)\n {2}\}/gu)].map((m) => m[1]).join('\n');
  assert.match(narrow, /\.body\[data-switch\] :global\(\.home-page:not\(\[data-arranging\]\) > \.home-tools\) \{\s*display: none;/u);
});

test('on a phone the page under the sentence keeps Home’s room over its body, so the raised menu clears the name’s row', () => {
  /* TWO BLOCKS ON THIS QUERY SINCE 8092f93c3, the raised menu's and this one, so every one is read. */
  const phone = [...styles.matchAll(/@media \(hover: none\) and \(width <= 600px\) \{([\s\S]*?)\n {2}\}/gu)].map((m) => m[1]).join('\n');
  assert.match(phone, /\.page:has\(> \.body:first-child\) \{\s*padding-block-start: var\(--sp-4\);/u);
});
