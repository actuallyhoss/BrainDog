/** Money's figures over the ledger: what was spent and received, and what has no category. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

export const SPENDING_FIGURES: Record<string, SeedMetric> = {
  /* ── what actually moved ─────────────────────────────────────────────────
     Every figure over the ledger says `transfer is false` and `state is cleared`. The first leaves out
     money moved between your own accounts, which is not spending; the second leaves out a payment the
     bank has taken and not yet settled, which is not a fact yet. A figure that omitted either would be
     a number about the same money counted twice, or about money that has not moved.

     THIRTY DAYS IN THE SENTENCE BECAUSE THE WINDOW IS THIRTY. `window: 30d` is how far the comparison moves
     the clock, and the window before is cut where this one starts, so it is thirty days whatever the
     sentence says. `after` does not include its own day, and these said `on after -31d`: today and the
     thirty before it, thirty-one days, compared with thirty and named "30 days". Measured in
     `test/money-bank.test.ts`: a cleared payment dated day -30 was counted. Now the two windows are the
     same length, abut, and share no day. */

  'spent-30d': {
    metric: 'spent-30d',
    name: 'Spent, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on after -30d',
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'previous',
  },

  'received-30d': {
    metric: 'received-30d',
    name: 'Received, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is in, on after -30d',
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'previous',
  },

  /* WHAT NOBODY HAS SAID THE PURPOSE OF. The one figure over what moved that is a job rather than a
     fact, and the reason `txn-categorise` is worth declaring: it is what is left after the rule ran. */
  'txn-uncategorised': {
    metric: 'txn-uncategorised',
    name: 'Without a category',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, category is empty, on after -91d',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
