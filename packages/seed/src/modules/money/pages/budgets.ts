/** Budgets: this month's spending by category against the most a month each holds. A limit is offered from last month's pace and set only by the person. */

import type { SeedPage } from '../../base.ts';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is one of them. It
 * holds its line alone for now, so the section has the page and its address before its blocks are written.
 */
export const MONEY_BUDGETS_PAGE: SeedPage = {
  page: 'money-budgets',
  title: 'Budgets',
  nav: { section: 'Money', order: 13 },
  icon: 'piggy-bank',
  requires: ['register.categories', 'register.transactions'],
  pack: 'money-core',
  blocks: [
    {
      kind: 'note',
      lead: true,
      span: 12,
      body: 'What each category may spend a month, and how this month is going.',
    },
  ],
};
