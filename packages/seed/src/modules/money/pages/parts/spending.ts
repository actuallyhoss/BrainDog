/** Where this month's money went, held against last month to the same day. */

export const SPENDING: Record<string, unknown>[] = [
  {
    /* THIS MONTH SO FAR AGAINST LAST MONTH TO THE SAME DAY, ONE PART A CATEGORY, over the one figure
       that holds both months (`spent-vs-last-month`, `figures/spending.ts`): each part answers its difference, its two
       halves, and a change only where the record lets one be said. A category with nothing in one of the months, or
       with under half the other's entries, is answered a difference and no change, so nothing drawn from this block
       can mark it as the one that moved most.

       ONE FIGURE AND NOT TWO SIDE BY SIDE, so the bars and the change beside them can never disagree: this month and
       last are the two halves of each part, read in one pass.

       ONLY WHILE THIS MONTH HAS SPENDING, over the figure whose whole is this month so far with what has no category
       in it (`spent-by-category-month`). Without that, a month nobody has spent in yet drew last month as a fall in
       every category, which looks like good news and is the calendar.

       WHAT NOBODY GAVE A CATEGORY IS THE WHOLE LESS THE PARTS, named and never left out.

       SPENT THIS MONTH, ON MONEY'S HOME SINCE money-core 3.29.0: the first tile under the hero, beside Coming up, and
       how this month's spending stands against last month's is the health figure it carries. NO WIDTH OF ITS OWN, so
       the app pairs it with its neighbour into two even columns, and gives it the whole row when it stands alone.
       WHAT NOBODY FILED IS "Not filed yet", the part a person can still do something about.

       THE MONTH ITSELF, NOT ITS DIFFERENCE. Drawn over `spent-vs-last-month` the bars were each category's difference
       from last month to the same day, under a heading that says spent: rent paid on the 2nd read EGP 0, as last month's
       was the same, and a category spent less in than last month read a minus. A bar draws a part's value and nothing of
       its two halves, so the tile reads the month as it is, and the difference stays on Reports, folded under its own
       name. */
    kind: 'bar',
    heading: 'Spent this month',
    icon: 'chart-bar',
    source: 'metric.spent-by-category-month',
    unset: 'Not filed yet',
    when: { metric: 'spent-by-category-month', gt: 0 },
    empty: 'Nothing spent this month.',
  },
];
