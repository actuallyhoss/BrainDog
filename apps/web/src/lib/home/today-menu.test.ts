/**
 * Today's page menu on a phone sits in the head, as on a declared page (the audit of 25 October, Y24): under a thumb it
 * was a lone "…" on a row of its own between People and "Handed back to you", opening a sheet with one entry. A text
 * test over the styles, as this tree's other layout checks are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HOME = readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8');
const STYLE = /<style>([\s\S]*?)<\/style>/u.exec(HOME)?.[1] ?? '';

test('under a thumb the board lifts the menu to the end of the greeting row, out of the tiles', () => {
  const rule = /@media \(hover: none\) \{\s*\.today-head \+ \.body\[data-board\]:not\(:has\(:global\(\.home-page\[data-arranging\]\)\)\) :global\(\.home-page > \.home-tools\) \{([^}]*)\}/u.exec(STYLE)?.[1] ?? '';
  assert.match(rule, /position:\s*absolute;/u, 'the menu is still a row among the tiles');
  assert.match(rule, /inset-block-end:\s*100%;/u);
  assert.match(rule, /inset-inline-end:\s*0;/u);
});

test('and the greeting keeps a tap of room at its end for it', () => {
  assert.match(STYLE, /\.today-head:has\(\+ \.body\[data-board\] :global\(\.home-tools :is\(button, a\)\)\) \{\s*padding-inline-end:/u);
});
