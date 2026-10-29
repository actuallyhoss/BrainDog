/**
 * Whether a category of moves is money that stays yours, since money-core 3.31.0 (Q8 of 29 October): two rules and their
 * script, out of `rules.ts` so that file stays under its size, as `post-due.ts` and `settle-line.ts` are. A pure move:
 * `MONEY_AUTOMATIONS` spreads them where they stood, so the document is the same.
 */

import { CATEGORY_STAYS_SCRIPT } from './scripts/category-stays.js';

export const CATEGORY_STAYS_RULES: Record<string, unknown>[] = [
  /**
   * A CATEGORY OF MOVES ASKS ONCE WHETHER ITS MONEY STAYS YOURS (Q8 of 29 October, `scripts/category-stays.js`): a move
   * between your own accounts filed under a category nobody ticked "Money stays yours" starts the question, once a
   * category (`once_per`), and the hourly sweep reads the last ninety days' moves too, so a ledger filed before this
   * is asked about without a write. Yes is `category-stays-yes`, which ticks the category.
   */
  {
    rule: 'category-stays-asks',
    name: 'Ask whether a category of moves is money that stays yours',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['create', 'update'], fields: ['transfer', 'category'] } },
    when: 'transfer is true, category is set, state is cleared, on after -90d',
    once_per: ['category'],
    steps: [{ script: { id: 'category_stays', as: 'asking', input: {} } }],
  },
  {
    rule: 'category-stays-yes',
    name: 'Leave a category of moves out of spending',
    pack: 'money-core',
    on: { decided: { about: 'script.category_stays', option: 'Yes' } },
    steps: [{ script: { id: 'category_stays', as: 'ticking', input: { answer: '{{trigger.option}}' } } }],
  },
  CATEGORY_STAYS_SCRIPT,
];
