/**
 * Money's figure over which way a category is for, SINCE money-core 3.16.0. "5 of 15 categories carry the
 * wrong direction": his five categories read "Money out", an import filed money coming in under them, and nothing
 * on any page noticed a category whose entries go the other way.
 */

import type { SeedMetric } from '../../base.ts';

/**
 * A LIVE CATEGORY MARKED ONE WAY THAT A LEDGER ENTRY GOING THE OTHER WAY POINTS AT. The hop walks `category` backwards,
 * from the category to the entries that name it (`pointed` in `packages/where`), which `via` cannot: `via` walks a ref
 * from the row that holds it. A category marked `both` is neither leg, so it is never counted, and that is the way out
 * the Heads up line offers.
 *
 * EVERY ENTRY, NOT ONLY CLEARED ONES, AND A TRANSFER TOO. A pending payment filed under the wrong way is filed wrong
 * already, and the legs of a move filed under a category marked "Money out" are exactly the case the owner's Ledger holds
 * (`lists/transactions.ts`, the Transfers category): either way is what such a category is. A VOID ENTRY COUNTS TOO, and
 * that is the depth and not a choice: the hop sits at the third level, so what it asks of the Ledger is one test.
 */
const against = (marked: 'in' | 'out', going: 'in' | 'out') => ({
  all: [
    { field: 'state', is: 'live' },
    { field: 'direction', is: marked },
    { pointed: { register: 'transactions', by: 'category', where: { field: 'direction', is: going } } },
  ],
});

export const DIRECTION_FIGURES: Record<string, SeedMetric> = {
  /* A COUNT OF CATEGORIES, NEVER A SUM OF WHAT IS IN THEM, so no two currencies meet in it: a category that holds a
     wrong-way entry in pounds and one in Egyptian pounds is one category. Nought is the mark, and the line under Heads up
     is drawn only above it. */
  'categories-against-direction': {
    metric: 'categories-against-direction',
    name: 'Categories going the other way',
    source: 'register.categories',
    /* TWO LEGS UNDER ONE `any`, EACH CARRYING `state is live` ITSELF: a predicate nests three levels and the hop is one
       of them, so an outer `all` round the `any` is refused PREDICATE_TOO_DEEP. */
    where: { any: [against('out', 'in'), against('in', 'out')] },
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
