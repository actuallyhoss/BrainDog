/**
 * The page hands a roadmap its write: the last of the three layers a dropped bar crosses to reach the record.
 *
 * `svelte/p/roadmap-reach.test.ts` in the renderer proves that a callback given to `<Block>` reaches the drawer, and
 * `roadmap-write.test.ts` proves the patch and its undo. Neither can see whether a page gives `<Block>` the callback at
 * all, and at 5c332af4 it did not: the drawer drew grips only for a host that asked, and the one host never asked, so
 * every bar on every page was a picture. Read from the source, as `capture-wire.test.ts` reads the capture's wire,
 * because a page needs the router and a live record to render.
 *
 * TWO FILES SINCE THE READER WAS SPLIT: the block hands `<Block>` the callback (`BlockSlot.svelte`), and the write it
 * calls is the page's (`page-writes.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const slot = (): string => readFileSync(new URL('./BlockSlot.svelte', import.meta.url), 'utf8');
const writes = (): string => readFileSync(new URL('./page-writes.ts', import.meta.url), 'utf8');

test('THE PAGE HANDS A ROADMAP ITS WRITE, so a bar on a live page is a grip rather than a picture', () => {
  assert.match(slot(), /onreschedule=\{/u, 'the block never hands `<Block>` a reschedule, so no bar on any page can be dragged');
});

test('the drop is written by the one function that works out its patch, through the page write every gesture shares', () => {
  const source = writes();
  assert.match(source, /import\('\.\.\/record\/roadmap-write\.ts'\)/u, 'the writer is not loaded when a bar is dropped');
  assert.match(source, /\breschedule\(block, row, drop\)/u, 'the patch is not `reschedule` over the block the page drew');
  /* THROUGH `writeRow`, and not `rescheduleRow` on its own: `writeRow` is what holds the row in place, raises the
     receipt with its undo and reads the page again, so a drop gets the same three a tick and a moved card get. */
  assert.match(source, /void writeRow\(row\.ref, \(\) => change\.patch/u, 'the drop does not go through the page write');
});
