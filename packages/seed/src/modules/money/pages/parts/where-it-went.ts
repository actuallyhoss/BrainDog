/** Where it went: this month's spending as shares of what it was for, and who was paid in what nobody has filed. */

/**
 * WHAT NOBODY HAS FILED, SAID ONCE: the sentence the count `txn-uncategorised` counts by (`figures/spending.ts`), so the
 * bar over those entries and the condition it is drawn on read the same entries, less the money that came in.
 */
import { UNFILED } from '../../figures/shared.ts';

/**
 * ONLY WHAT WENT OUT, as the split above it and the heading over both: the count holds money that came in too, and a
 * client who paid in is not "who was paid", nor is a refund added to the payment it undoes.
 */
const UNFILED_OUT = `${UNFILED}, direction is out`;

/** As many bars as the payee bar draws; past them the app draws one more for the rest. */
const PAYEE_BARS = 8;

export const WHERE_IT_WENT: Record<string, unknown>[] = [
  {
    /* WHERE THE MONEY WENT, ON MONEY ITSELF: "Unfiled grouped by merchant, where, bars, share" (the
       owner). A heading folded shut at the end of the page, so the tiles a person reads before the fold stay the six
       they were, and what is under it is a press away.

       ONLY ONCE THERE IS AN ACCOUNT, as Coming and going before it: a fresh record reads no heading over nothing. */
    kind: 'section',
    heading: 'Where it went',
    icon: 'receipt',
    span: 12,
    fold: true,
    when: { metric: 'cash-accounts', gt: 0 },
  },
  {
    /* THIS MONTH SO FAR, AS SHARES OF ONE TRACK, one part a category, over the figure already declared
       (`spent-by-category-month`, `figures/flow.ts`), whose whole is everything spent since the first.

       WHAT NOBODY GAVE A CATEGORY IS THE WHOLE LESS THE PARTS, named "No category yet" and never left out: it is the
       part a person can still do something about, and the "yet" says so. The app draws it after the track and outside
       its scale (the `hole` tone), so a month mostly unfiled does not shrink every category to a sliver.

       ONLY WHILE THIS MONTH HAS SPENDING, so a month nobody has spent in yet draws no empty track. */
    kind: 'split',
    heading: 'This month, by category',
      donut: true,
    icon: 'chart-pie',
    span: 12,
    source: 'metric.spent-by-category-month',
    unset: 'No category yet',
    when: { metric: 'spent-by-category-month', gt: 0 },
    empty: 'Nothing spent this month yet.',
  },
  {
    /* WHO WAS PAID, IN WHAT NOBODY HAS FILED: the last 91 days of payments out with no category, one bar a
       payee by the name a person gave it (`payee`, "Paid to or from", `lists/transactions.ts`), the largest first,
       eight bars and the rest. Filing the largest one files the most money, so the bar says where to start.

       AMOUNTS STAY IN MINOR UNITS AND IN THEIR OWN CURRENCY. The bar adds the entries where it is drawn, and money in
       two currencies is never added into one length: a payee paid in two is two amounts with no total
       (`wholeRead` in `packages/kernel/src/pages.ts`).

       DRAWN WHILE THE COUNT IS MORE THAN NOUGHT (`txn-uncategorised`, the same sentence as `UNFILED`). While what is
       unfiled all came in, it says everything paid out has a category. An entry with no payee is one bar of its own,
       named, so no money leaves the picture because nobody named who it went to. */
    kind: 'bar',
    heading: 'No category yet, by who was paid',
    icon: 'chart-bar',
    span: 12,
    source: 'register.transactions',
    where: UNFILED_OUT,
    columns: [{ field: 'payee', or: 'what' }, { field: 'amount' }],
    unset: 'Not named yet',
    limit: PAYEE_BARS,
    when: { metric: 'txn-uncategorised', gt: 0 },
    empty: 'Everything paid out in the last 91 days has a category.',
  },
];
