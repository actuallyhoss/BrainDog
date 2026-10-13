/** Cash now, checked against its entries: said only while the two ways of adding it up disagree. */

export const CROSS_CHECK: Record<string, unknown>[] = [
  {
    /* CASH NOW IS NOT WHAT ITS ENTRIES ADD UP TO (REC-A17 job 4): the one tile on this page about the page itself.
       "Wrong money on a screen is the worst class of defect in this repo", and the record works Cash now out a second
       way each time it is read (`cash-cross-check` in `figures/cash.ts`), so a figure that is out says so here, straight
       under the walk that starts from it, and is not read as if it were right.

       DRAWN ONLY WHILE THE TWO DISAGREE, in any currency (`not: 0`): at nought, which is every day on a record that
       is right, there is no tile and no word about a check. The figure is the difference, Cash now less the same
       entries added one at a time, in the currency it is in.

       THE DANGER COLOUR, AND WORDS WITH IT: the heading says what is wrong, so the colour is never the only mark.

       ONE BLOCK, as Money stands at the most a page declares. WHAT THAT COSTS TODAY: out in two currencies at
       once the difference is two amounts and no one value, and a page's look leaves out a tile whose every figure has
       no value (`drewNothing` in `packages/kernel/src/compose.ts`, which does not read a figure's amounts by
       currency). Until it does, that one day draws no tile; `packages/seed/test/cash-cross-page.test.ts` says so. */
    kind: 'stat',
    heading: 'Cash now does not add up',
    icon: 'alert',
    span: 12,
    tone: 'bad',
    cells: [
      {
        metric: 'cash-cross-check',
        label: 'Cash now, less its entries added up',
        note: 'These two should be the same. Until they are, read the money on this page as unchecked.',
      },
    ],
    when: { metric: 'cash-cross-check', not: 0 },
  },
  /* NO LINE FOR "NO BALANCE HAS BEEN TYPED YET", THOUGH ONE STOOD HERE WHILE 3.17.0 WAS BEING MADE. With no balance typed
     the check has no value and its reading says why (`readCrosscheck` in `packages/kernel/src/money-figures.ts`); the
     page said the same in a line of its own, drawn while Cash now held nothing. It went for three reasons. It stood
     under the box to add an account, drawn on the same day, which already says there is no account to read. It was
     untrue on the one other day it was drawn: with accounts and none of them counted as cash a balance HAS been typed,
     and the reading says "No account counts as cash yet" there. And Money was at the most blocks a page declares, so
     it held the place of the line a record with two books opens on (`headline.ts`). The reading still says why to
     whoever asks the figure, and `packages/seed/test/cash-cross-page.test.ts` holds that the page draws nothing about
     the check on that day. */
];
