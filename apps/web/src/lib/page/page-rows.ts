/**
 * THE ROWS OF A PAGE THAT MOVE WHEN THE RECORD GROWS UNDER IT (9 Nov; `rowsMotion` in `$lib/motion`): every list a
 * page's blocks draw whose rows are keyed by the record's own row, so a row the record added is a new element and one
 * it dropped is taken out. Today's tiles, Work, Needs you, People and every declared page, through `PageBody`'s one
 * watcher. A list that moves its rows by itself is not here: a table's rows (`rowin`), a queue's questions
 * (`listMotion`), the project cards and the key numbers (`in:` of their own).
 */

import { rowsMotion, type RowsOf } from '$lib/motion/index.ts';

export const PAGE_ROWS: readonly RowsOf[] = [
  /* THE RENDERER'S LISTS: a todo, a timeline, a plain list (`List.svelte`), a feed's lines, a board's cards, the cards. */
  { in: '.list', row: '.item', as: 'line' },
  { in: '.feed-rows', row: '.feed-row', as: 'line' },
  { in: '.board-col', row: '.card', as: 'card' },
  { in: '.cards-grid', row: '.cards-item', as: 'card' },
  /* TODAY'S OWN TILES: what is late, what falls due by day and each day's lines, who is at work. */
  { in: '.late', row: '.ln', as: 'line' },
  { in: '.home-late', row: '.hl', as: 'line' },
  { in: '.home-days', row: '.hd', as: 'line' },
  { in: '.hd-lines', row: '.hd-line', as: 'line' },
  { in: '.runs', row: '.run', as: 'line' },
];

/** The attachment `PageBody` puts on the page. */
export const pageRows = rowsMotion(PAGE_ROWS);
