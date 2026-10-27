/** Reports: money in and out by month, spending by category and who was paid most. */

import type { SeedPage } from '../../base.ts';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is one of them. It
 * holds its line alone for now, so the section has the page and its address before its blocks are written.
 */
export const MONEY_REPORTS_PAGE: SeedPage = {
  page: 'money-reports',
  title: 'Reports',
  nav: { section: 'Money', order: 16 },
  icon: 'chart-pie',
  requires: ['register.transactions', 'register.categories'],
  pack: 'money-core',
  blocks: [
    {
      kind: 'note',
      lead: true,
      span: 12,
      body: 'Where the money came from and where it went, month by month.',
    },
  ],
};
