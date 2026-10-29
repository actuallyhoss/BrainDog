/**
 * Today's page menu: under a thumb it was a lone "…" on a row of its own between People and "Handed back to you",
 * opening a sheet with one entry, and then it was lifted into the greeting's row. Today is a board of widgets now (the
 * widgets plan of 29 October), arranged with Edit and added to with Add to Today, so the page's ⋯ is not drawn on it
 * at all. A text test over the styles, as this tree's other layout checks are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HOME = readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8');
const STYLE = /<style>([\s\S]*?)<\/style>/u.exec(HOME)?.[1] ?? '';
const BOARD = readFileSync(new URL('../board/Board.svelte', import.meta.url), 'utf8');

test('the board draws no page menu among its tiles, under a thumb or a pointer', () => {
  assert.match(BOARD, /\.board :global\(\.home-page > \.home-tools\) \{\s*display: none;\s*\}/u, 'the menu is still a row among the tiles');
  /* THE OLD LIFT INTO THE GREETING'S ROW IS GONE WITH IT, so nothing places a menu that is not drawn. */
  assert.doesNotMatch(STYLE, /\.home-tools\)? \{\s*position:\s*absolute;/u);
});

test('and the greeting keeps no tap of room at its end for a menu that is not there', () => {
  assert.doesNotMatch(STYLE, /\.today-head:has\(\+ \.body\[data-board\] :global\(\.home-tools/u);
});
