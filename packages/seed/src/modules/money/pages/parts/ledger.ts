/** The Ledger on Money's page: the six newest entries, and the box that adds one. */

import { MOVED_COLUMNS } from '../shared.ts';

/** How many entries the tile draws. Six, so the page stays a page: the Ledger itself holds the rest. */
export const LEDGER_LINES = 6;

export const LEDGER: Record<string, unknown>[] = [
  {
    /* THE LEDGER, OPEN, WHERE THE MONEY IS READ (REC-B15). "Ledger, add, edit, delete" and "I hate this tabs" (the
       owner): what moved was twelve lines folded shut under History, and he went looking for his transactions. Now
       the six newest stand in a tile of their own, newest first, as a calm list (`MOVED_COLUMNS`): the day, what the
       bank called it and the amount signed by its own direction. Every line is its entry, which the app opens to be
       changed or deleted, and the block's own link opens the whole Ledger.

       HEADED BY THE LIST'S OWN NAME, so the word a person looks for is the word on the page and on the rail.

       GATED BY WHAT IT HOLDS, AND BY NO FIGURE (audit 59, claim 5). It waited on `ledger-newest-days`, a figure that
       reads cleared entries alone, so a card payment typed this morning and not yet cleared was on the Ledger and not
       on the page. Now the tile's own entries decide: any entry that is not void draws it, and a void one is left
       out, as it is from every figure of the Ledger. A Ledger holding nothing is still not drawn, because a page
       being read leaves out a tile with nothing in it (`emptyHidden` in `packages/kernel/src/drawn.ts`).

       ITS OWN EMPTY LINE, for the one place that rule lets a tile say it: where the Ledger is the first thing a page
       has to say. */
    kind: 'timeline',
    heading: 'Ledger',
    icon: 'receipt',
    span: 12,
    source: 'register.transactions',
    where: 'state is not void',
    columns: MOVED_COLUMNS,
    order: [{ field: 'on', dir: 'desc' }],
    limit: LEDGER_LINES,
    empty: 'Nothing has moved yet.',
  },
];

/**
 * ADD A MOVEMENT, DECLARED AND NOT YET ON THE PAGE. Two things stand in its way, and neither is this file's:
 *
 * - THE PAGE IS FULL. Money declares twenty-four blocks, the most a page holds (`BLOCK_CEILING` in
 *   `packages/kernel/src/declare.ts`). The tile above took the place History's twelve lines gave up; this would be a
 *   twenty-fifth.
 * - ONE LINE CANNOT SAY A MOVEMENT. A `capture` is one typed line, the description (`packages/render/src/capture.ts`).
 *   The Ledger requires an amount, a day and an account besides. A host fills the day with today and the amount with
 *   nought, and has no account to give, because an account is a link (`capturedFields` in the app's
 *   `rows-write.ts`), so the record would refuse every entry typed here.
 *
 * STILL WAITING AFTER BATCH 61, AND ON PURPOSE. The box can be placed from this file, after the tile in `LEDGER`, and
 * `parts/history.ts` could give up a block for it. Neither was done: a box the record refuses at every press is a
 * control that cannot act, and History's heading or its one chart is too much to pay for that. The first reason has to
 * go first, in the app and the drawer.
 *
 * `test/money-ledger-tile.test.ts` goes red the day either changes. Until then a movement is added on the Ledger.
 */
export const ADD_MOVEMENT: Record<string, unknown>[] = [
  {
    kind: 'capture',
    heading: 'Add a movement',
    icon: 'plus',
    span: 12,
    register: 'transactions',
    when: { metric: 'cash-accounts', gt: 0 },
  },
];
