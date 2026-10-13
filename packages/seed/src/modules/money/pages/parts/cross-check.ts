/** Cash now, checked against its entries: said only while the two ways of adding it up disagree, or cannot be compared. */

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

       ONE BLOCK, as Money stands two under the most a page declares. WHAT THAT COSTS TODAY: out in two currencies at
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
  {
    /* NOTHING TO CHECK YET IS SAID, NEVER READ AS A PASS: with no balance typed the check has no value, and its
       reading says why in these words (`readCrosscheck` in `packages/kernel/src/money-figures.ts`). A LINE AND NOT A
       FIGURE, as a figure with no value is never drawn (`packages/kernel/src/drawn.ts`), so the sentence is written
       here and `packages/seed/test/cash-cross-page.test.ts` holds it to the reading's for a record with no account:
       the two cannot drift. The line stands under the box that adds one.

       THE READING HAS A SECOND SENTENCE THIS LINE DOES NOT SAY (audit 54, item 7): with accounts and none of them
       counted as cash it reads "No account counts as cash yet", since an account is not saved without a balance and
       one has been typed. A line's words are written and not read off a figure, and Money stands at the most blocks
       a page declares, so on that day the page still says these words. It wants a line that reads its figure's own.

       ON CASH NOW HOLDING NOTHING, which is the same day: a check that agrees in two currencies reads nought with no
       currency, and `empty:` takes that for no amount at all, so a condition on the check itself would say no balance
       was typed on a record whose two currencies both add up. Cash now in two currencies is two amounts and never
       empty. */
    kind: 'note',
    span: 12,
    body: 'No balance has been typed yet.',
    when: { metric: 'cash-now', empty: true },
  },
];
