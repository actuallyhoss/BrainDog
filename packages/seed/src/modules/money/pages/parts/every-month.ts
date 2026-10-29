/** Every month: what repeats, in and out, and what the repeating costs are for. */

export const EVERY_MONTH: Record<string, unknown>[] = [
  {
    /* WHAT COMES IN AND GOES OUT EVERY MONTH, AT ITS MONTHLY SHARE: a pay day, a retainer, the rent and
       the subscriptions, each counted once a month whatever its own rhythm, read from the repeating list
       (`every-month-in` and `every-month-out` in `figures/flow.ts`). The two figures the chart above reads for the
       months ahead, said once as numbers, so a person sees what a month costs before anything is late.

       NO DIFFERENCE BETWEEN THE TWO YET: a third cell would need a figure that is one less the other (`sum_of`,
       REC-B06 job 2), and a host that took one from the other here would be a second way of doing sums.

       AND WHAT GOES OUT IN THE NEXT THIRTY DAYS BESIDE THEM, SINCE money-core 3.27.0: the walk's own figure
       (`leaving-30d`), the one Today's money tile says under the same name, so every part of a plan falling due is in
       it. Two figures called Going out stood a page apart, this tile's leaving every plan out, and read as two answers
       to one question; the repeating two now say they are what repeats.

       ONLY WHILE SOMETHING GOES OUT EVERY MONTH. A page condition is one figure or all of several, never either of
       two, so a record whose only repeating line is money coming in reads it on the chart and not here. */
    kind: 'stat',
    heading: 'Repeating, a month',
    icon: 'refresh',
    span: 12,
    cells: [
      { metric: 'every-month-in', label: 'In' },
      { metric: 'every-month-out', label: 'Out' },
      { metric: 'leaving-30d', label: 'To go out, next 30 days' },
    ],
    when: { metric: 'every-month-out', gt: 0 },
  },
  {
    /* WHAT GOES OUT EVERY MONTH, BY WHAT IT IS FOR: the same repeating costs, one part a category, over the list the
       cell above reads, so the parts add up to it (`every-month-by-category`). What nobody gave a category is the whole
       less the parts, named and never left out, as This month's spending names it.

       PLACED SINCE REC-B23 step 7, straight after the cells above, in the block Waiting on you gave up when the
       questions went to Decide (`pages/money.ts`). */
    kind: 'bar',
    heading: 'Repeating, a month, by category',
    icon: 'chart-bar',
    span: 12,
    source: 'metric.every-month-by-category',
    unset: 'No category',
    when: { metric: 'every-month-out', gt: 0 },
    empty: 'No categories yet.',
  },
];
