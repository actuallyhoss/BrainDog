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
  /* NO LINE OF ITS OWN FOR NOTHING TO CHECK, THOUGH ONE STOOD HERE WHILE 3.17.0 WAS BEING MADE. It said "No balance has
     been typed yet", drawn while Cash now held nothing, and it was untrue with accounts and none of them counted as
     cash, where a balance HAS been typed. It went for the lead a record with two books opens on (`headline.ts`), Money
     being at the most blocks a page declares, and it stood under the box to add an account, which says as much.

     ONE SENTENCE NOW, TRUE OF BOTH DAYS: "No account counts as cash yet". The check's reading says it as its why
     (`CROSSCHECK_NOTHING` in `packages/kernel/src/money-figures.ts`), and the page says the same words where it
     already spoke of cash with nothing to draw, What you have, by book (`by-book.ts`). So this file declares nothing
     for that day, and `packages/seed/test/cash-cross-page.test.ts` holds the two to one sentence. */
];
