/**
 * Whether a category of moves is money that stays yours, since money-core 3.31.0 (Q8 of 29 October): two rules and their
 * script, out of `rules.ts` so that file stays under its size, as `post-due.ts` and `settle-line.ts` are. A pure move:
 * `MONEY_AUTOMATIONS` spreads them where they stood, so the document is the same.
 */

import { CATEGORY_CORRECTION_SCRIPT } from './scripts/category-correction.js';
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
  /**
   * A CATEGORY OF CORRECTIONS ASKS ONCE WHETHER TO LEAVE IT OUT OF SPENDING (live check of 30 October, 20,
   * `scripts/category-correction.js`): a line filed under a category whose name says it holds corrections (a count's
   * Discrepancy) starts the question, once a category, and the sweep reads the thirteen months Reports reads. Yes is
   * `category-correction-yes`, which ticks the category's "A correction and not spending".
   */
  {
    rule: 'category-correction-asks',
    name: 'Ask whether a category of corrections is left out of spending',
    pack: 'money-core',
    on: { written: { register: 'transactions', op: ['create', 'update'], fields: ['category'] } },
    when: 'category is set, state is cleared, on after -13m',
    once_per: ['category'],
    steps: [{ script: { id: 'category_correction', as: 'asking', input: {} } }],
  },
  {
    rule: 'category-correction-yes',
    name: 'Leave a category of corrections out of spending',
    pack: 'money-core',
    on: { decided: { about: 'script.category_correction', option: 'Yes' } },
    steps: [{ script: { id: 'category_correction', as: 'ticking', input: { answer: '{{trigger.option}}' } } }],
  },
  CATEGORY_CORRECTION_SCRIPT,
];
