/** Every month: what repeats, in and out, and what the repeating costs are for. */

export const EVERY_MONTH: Record<string, unknown>[] = [
  {
    /* WHAT COMES IN AND GOES OUT EVERY MONTH, AT ITS MONTHLY SHARE (REC-B23 job 5): a pay day, a retainer, the rent and
       the subscriptions, each counted once a month whatever its own rhythm, read from the repeating list
       (`every-month-in` and `every-month-out` in `figures/flow.ts`). The two figures the chart above reads for the
       months ahead, said once as numbers, so a person sees what a month costs before anything is late.

       NO DIFFERENCE BETWEEN THE TWO YET: a third cell would need a figure that is one less the other (`sum_of`,
       REC-B06 job 2), and a host that took one from the other here would be a second way of doing sums.

       ONLY WHILE SOMETHING GOES OUT EVERY MONTH. A page condition is one figure or all of several, never either of
       two, so a record whose only repeating line is money coming in reads it on the chart and not here. */
    kind: 'stat',
    heading: 'Every month',
    icon: 'refresh',
    span: 12,
    cells: [
      { metric: 'every-month-in', label: 'Coming in' },
      { metric: 'every-month-out', label: 'Going out' },
    ],
    when: { metric: 'every-month-out', gt: 0 },
  },
  {
    /* WHAT GOES OUT EVERY MONTH, BY WHAT IT IS FOR: the same repeating costs, one part a category, over the list the
       cell above reads, so the parts add up to it (`every-month-by-category`). What nobody gave a category is the whole
       less the parts, named and never left out, as This month's spending names it.

       DECLARED AND NOT PLACED YET: Money stands at the most blocks a page declares (`BLOCK_CEILING` in
       `packages/kernel/src/declare.ts`), and the walk of the next thirty days gave up one, which the cells above took.
       It comes in with the next block the page gives up. */
    kind: 'bar',
    heading: 'Every month, by category',
    icon: 'chart-bar',
    span: 12,
    source: 'metric.every-month-by-category',
    unset: 'No category',
    when: { metric: 'every-month-out', gt: 0 },
    empty: 'Nothing that repeats has a category yet.',
  },
];
