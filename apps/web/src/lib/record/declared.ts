/**
 * The metrics the record ships with, as DOCUMENTS.
 *
 * Every one of these was a `case` in a twelve-branch `switch`. The point of moving them is not
 * tidiness — it is that a page an agent writes can now carry a `stat`, because a figure is a row in
 * a table rather than a branch in a function, and a second project page is a second declaration
 * rather than a thirteenth case.
 *
 * TWO SHAPES REPEAT, AND THAT IS THE ARGUMENT. `owed-to-you` and `kiln-owed` are the same document
 * with one clause added; `estate-year` and `kiln-cost` likewise. A project page is the register's
 * own numbers with a `thing is Kiln` on the front, and nothing about it is a new kind of thing —
 * which was true in the comment above the old `switch` and false in the code underneath it.
 *
 * THE HREF IS NOT HERE. It is derived from `source` and `where`, so a tile and the list it opens
 * cannot disagree — they used to be typed beside each other and drifted twice.
 */

import type { MetricDecl } from './metrics.ts';

/** Everything not settled, in either direction. The four states a register declares, minus two. */
const OPEN = 'state is open or part';

export const METRICS: Record<string, MetricDecl> = {
  'owed-to-you': {
    metric: 'owed-to-you',
    name: 'Owed to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    /* A receivable book is good when it is SMALL, because every pound in it is a pound somebody
       else is holding. The target is the ceiling on that, not a sales goal. */
    target: { lte: 2_000_000 },
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
    format: 'money.GBP',
    target: { lte: 2_500_000 },
    window: '30d',
  },

  /* ONE DIRECTION, like the two tiles it sits beside. This once added receivables to payables and
     painted the sum in the alarm colour: GBP 17,740.00 was GBP 7,200 you are owed plus GBP 10,540
     you owe. Those are not the same problem, and the sum is not a quantity. */
  overdue: {
    metric: 'overdue',
    name: 'Overdue',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before today`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    /* Zero, and it is the one target in the record that is not a judgement call. */
    target: { lte: 0 },
    window: '30d',
  },

  'renews-30d': {
    metric: 'renews-30d',
    name: 'Renews in 30 days',
    source: 'register.services',
    where: 'state is not cancelled, renews after yesterday, renews before +31d',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 6 },
    window: '30d',
  },

  lapsing: {
    metric: 'lapsing',
    name: 'Lapsing',
    source: 'register.services',
    where: 'state is lapsing',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  'estate-year': {
    metric: 'estate-year',
    name: 'Cost per year',
    source: 'register.services',
    where: 'state is not cancelled',
    /* The row-level product 08 §2.5 describes: `cost` is per cycle, and the cycle is the factor. */
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
    format: 'money.GBP',
    /* 300_000, not 30_000. The target was once written a zero short, so a GBP 2,906.80 estate was
       measured against GBP 300.00 and the tile read `warn` for a reason nobody could act on. */
    target: { lte: 300_000 },
    window: '90d',
    compare: 'none',
  },

  /* ── the same three, narrowed by one ref ──────────────────────────────── */

  'kiln-open': {
    metric: 'kiln-open',
    name: 'Open',
    source: 'register.tasks',
    where: 'thing is Kiln, state is not done or dropped',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 5 },
    window: '30d',
    compare: 'none',
  },

  'kiln-owed': {
    metric: 'kiln-owed',
    name: 'Owed to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, thing is Kiln`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 1_000_000 },
    window: '30d',
    compare: 'none',
  },

  'kiln-cost': {
    metric: 'kiln-cost',
    name: 'Costs a year',
    source: 'register.services',
    where: 'thing is Kiln, state is not cancelled',
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
    format: 'money.GBP',
    target: { lte: 120_000 },
    window: '90d',
    compare: 'none',
  },
};
