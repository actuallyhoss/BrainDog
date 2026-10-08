/** Money's figures of bills and invoices: what is owed either way, what falls due, and what is overdue. */

import { OPEN, type SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

export const DUE_FIGURES: Record<string, SeedMetric> = {
  'owed-to-you': {
    metric: 'owed-to-you',
    name: 'Receivables',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me`,
    value: { sum: 'amount' },
    format: MONEY,
    /* A receivable book is good when it is SMALL, because every sum in it is money somebody
       else is holding. The target is the ceiling on that, not a sales goal, and a person sets it. */
    target: {},
    window: '30d',
    compare: 'none',
  },

  /**
   * THE WHOLE BOOK YOU OWE, AND IT WAS THE ONE FIGURE OF THE FOUR A SNAPSHOT HOLDS THAT NOTHING COMPUTED.
   *
   * `snapshots` stores `cash`, `owed_to_me`, `owed_by_me` and `net` on one row, and three of the four
   * had a figure behind them: `cash-now` reads the accounts, `owed-to-you` sums the receivable book,
   * and the net is the arithmetic over both. The payable book had `overdue`, which is only the part
   * already late (GBP 10,540 of a book several times that), so anything filling a snapshot had to
   * add the register up itself, which is a second answer to a question the record is supposed to own.
   *
   * IT IS `owed-to-you`'S CLAUSE WITH THE DIRECTION TURNED ROUND, deliberately word for word: two
   * figures over one register that disagree about which rows are still live is the defect, and they
   * cannot disagree if they share `OPEN`.
   */
  'owed-by-you': {
    metric: 'owed-by-you',
    name: 'Payables',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me`,
    value: { sum: 'amount' },
    format: MONEY,
    /* A CEILING, AND THE RECORD INSISTS ON ONE: `METRIC_NEEDS_TARGET_OR_WINDOW` refuses a figure with
       neither, in those words: *a number with no target is decoration*. Past some sum the book stops being a
       supplier's credit and becomes a cash problem, and that sum is the person's, in their currency, so it is a
       setting that starts empty. */
    target: {},
    window: '30d',
    compare: 'none',
  },

  'due-30d': {
    metric: 'due-30d',
    name: 'Due in 30 days',
    source: 'register.obligations',
    /* BOUNDED AT BOTH ENDS. `before +31d` alone counted everything already late as well, so an
       overdue bill was in this tile and in Overdue at once and the two could not be added. */
    where: `${OPEN}, direction is owed by me, due after yesterday, due before +31d`,
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
  },

  /**
   * HOW MANY BILLS AND INVOICES FALL DUE IN THE NEXT THIRTY DAYS, either way, SINCE money-core 3.3.0. A count and not a
   * sum, because the two directions are not one quantity; it is what the Money page's calendar of the month ahead is
   * drawn under (`when:`), so a month with nothing in it is not a tile of empty days. The calendar's own sentence, word
   * for word, so the figure and the tile cannot disagree about which rows they mean.
   */
  'due-items-30d': {
    metric: 'due-items-30d',
    name: 'Bills and invoices due, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, due after yesterday, due before +31d`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* ONE DIRECTION, like the two tiles it sits beside. This once added receivables to payables and
     painted the sum in the alarm colour: GBP 17,740.00 was GBP 7,200 you are owed plus GBP 10,540
     you owe. Those are not the same problem, and the sum is not a quantity. */
  overdue: {
    metric: 'overdue',
    /* WHAT THIS ONE IS ABOUT, and the word alone was not it. `direction is owed by me`: this is
       money YOU are late paying, and the saved view called "Overdue" is everything late in both
       directions. Two clicks apart, one word, two sets: a person reading `GBP 10,540` under
       "Overdue" and then opening the view was looking at a different question with no way to know. */
    name: 'Late payables',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before today`,
    value: { sum: 'amount' },
    format: MONEY,
    /* Zero, and it is the one target in the record that is not a judgement call. */
    target: { lte: 0 },
    window: '30d',
  },
};
