/** The Ledger on Money's page: the six newest entries, and the box that adds one. */

import { LEDGER_LINE_COLUMNS } from '../ledger.ts';

/** How many entries the tile draws. Six, so the page stays a page: the Ledger itself holds the rest. */
export const LEDGER_LINES = 6;

/**
 * The tile's three cells: the day, who was paid, and the amount signed by the way the money went. The day and the
 * amount are `MOVED_COLUMNS`' own, so the sign is said once. The name reads `payee` and falls back to `what`, the
 * bank's line or the words a person typed, on an entry no payee was read for.
 */
export const LEDGER_COLUMNS = LEDGER_LINE_COLUMNS;

export const LEDGER: Record<string, unknown>[] = [
  {
    /* THE LEDGER, OPEN, WHERE THE MONEY IS READ. "Ledger, add, edit, delete" and "I hate this tabs" (the
       owner): what moved was twelve lines folded shut under History, and he went looking for his transactions. Now
       the six newest stand in a tile of their own, newest first, as a calm list (`LEDGER_COLUMNS`): the day, who was
       paid and the amount signed by its own direction. Every line is its entry, which the app opens to be
       changed or deleted, and the block's own link opens the whole Ledger.

       HEADED BY THE LIST'S OWN NAME, so the word a person looks for is the word on the page and on the rail.

       GATED BY WHAT IT HOLDS, AND BY NO FIGURE. It waited on `ledger-newest-days`, a figure that
       reads cleared entries alone, so a card payment typed this morning and not yet cleared was on the Ledger and not
       on the page. Now the tile's own entries decide: any entry that is not void draws it, and a void one is left
       out, as it is from every figure of the Ledger. A Ledger holding nothing is still not drawn, because a page
       being read leaves out a tile with nothing in it (`emptyHidden` in `packages/kernel/src/drawn.ts`).

       ITS OWN EMPTY LINE, for the one place that rule lets a tile say it: where the Ledger is the first thing a page
       has to say.

       ITS WRITTEN LINE COUNTS THE DAY. Agents do the legwork in view: a person cleared their
       bank's messages into the Ledger and Money said nothing of who filed them. `filed-today` and `filed-for-you-30d`
       were installed and drawn nowhere, and this line reads both: how many entries were made today, and how many
       anything but a person made in 30 days.

       HOW MANY, AND NOT YET WHO, for two reasons that are neither of them this file's, each held by
       `test/money-ledger-by.test.ts`, which goes red the day one moves:
       - A SENTENCE READS A FIGURE'S COUNT AND NEVER ITS PARTS BY NAME (`pathOf` in `packages/kernel/src/pages.ts`), so
         "Harbour Bank filed 6 today" cannot be written from `filed-today`, whose parts hold exactly that.
       - A TIMELINE DRAWS THREE CELLS, and these three are the day, the name and the amount. The record does hand over,
         beside the lines, the rule on each entry (`filed_by`) and who changed it last, as ids and handles with no name.

       THE APP DRAWS THIS LINE ABOVE THE MOVEMENTS when the record answered both figures (`writtenLine` in the app's
       `apps/web/src/lib/record/blocks.ts`), and draws none while either is unanswered.

       THE NAME IS WHO WAS PAID, AND THE BANK'S OWN LINE WHERE NOBODY IS KNOWN. The record keeps the
       payee by the name a person reads (`payee`, filled where a bank door read one), and an entry a person typed holds
       none. A payee column alone would say `Chillout` on one line and nothing at all on the line under it, so the
       column names a second field (`or: 'what'`, a column's own key since batch 72) and a host reads the description
       where the payee holds nothing. `LEDGER_COLUMNS` below; `test/money-ledger-tile.test.ts` holds both lines.

       PLAIN, SINCE BATCH 6: the line said "36 filed today. 0 filed for you in 30 days.", two counts that read as a
       contradiction (everything was made today, and none of it by a rule), so it says the one count. `filed-for-you-30d`
       stays declared for Filing rules.

       ADDED, NOT FILED (audit of 31 October, 33): the figure counts the lines that came in today, which is not the same
       as putting them under a category, and "36 filed today." over lines from June to August read as if a rule had
       sorted them all this morning while Filing rules said none had. A statement brought in today adds old lines today.

       AND EACH UNDER THE DAY IT HAPPENED (audit 2, A33): "36 added today." still stood over lines dated June to August
       and read as a count of what the tile shows, so the line says the lines below are by the day each happened.

       AND THEN SHORT AGAIN (polish, 1 Nov): "each under the day it happened" was a clause nobody needed; the dates
       on the lines below say it. The line is the one count, "36 came in today."

       NO GATE OF ITS OWN: a line is not a thing a tile holds, so a Ledger nothing has moved on is still not drawn. */
    kind: 'timeline',
    heading: 'Ledger',
    body: '{{filed-today}} came in today.',
    icon: 'receipt',
    /* NO WIDTH OF ITS OWN, SINCE money-core 3.29.0, so the app pairs it beside the accounts on Money's home. */
    source: 'register.transactions',
    where: 'state is not void',
    columns: LEDGER_COLUMNS,
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
