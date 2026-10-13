/** Where this month's money went, held against last month to the same day. */

export const SPENDING: Record<string, unknown>[] = [
  {
    /* THIS MONTH SO FAR AGAINST LAST MONTH TO THE SAME DAY, ONE PART A CATEGORY (REC-B19 job 3), over the one figure
       that holds both months (`spent-vs-last-month`, `figures/spending.ts`): each part answers its difference, its two
       halves, and a change only where the record lets one be said. A category with nothing in one of the months, or
       with under half the other's entries, is answered a difference and no change, so nothing drawn from this block
       can mark it as the one that moved most.

       ONE FIGURE AND NOT TWO SIDE BY SIDE, so the bars and the change beside them can never disagree: this month and
       last are the two halves of each part, read in one pass.

       ONLY WHILE THIS MONTH HAS SPENDING, over the figure whose whole is this month so far with what has no category
       in it (`spent-by-category-month`). Without that, a month nobody has spent in yet drew last month as a fall in
       every category, which looks like good news and is the calendar.

       WHAT NOBODY GAVE A CATEGORY IS THE WHOLE LESS THE PARTS, named "No category" and never left out.

       NOT ON THE PAGE YET: `money.ts` places it. THE WHOLE WIDTH, as every chart on Money is. */
    kind: 'bar',
    heading: "This month's spending",
    icon: 'chart-bar',
    span: 12,
    source: 'metric.spent-vs-last-month',
    unset: 'No category',
    when: { metric: 'spent-by-category-month', gt: 0 },
    empty: 'Nothing spent this month or last has a category yet.',
  },
];
