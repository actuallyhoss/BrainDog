/** Ledger: every entry, grouped by day, with what it was for and the account it moved. */

import type { SeedPage } from '../../base.ts';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is one of them. It
 * holds its line alone for now, so the section has the page and its address before its blocks are written.
 */
export const MONEY_LEDGER_PAGE: SeedPage = {
  page: 'money-ledger',
  title: 'Ledger',
  nav: { section: 'Money', order: 12 },
  icon: 'receipt',
  requires: ['register.transactions', 'register.categories'],
  pack: 'money-core',
  blocks: [
    {
      kind: 'note',
      lead: true,
      span: 12,
      body: 'Every entry, a day at a time.',
    },
  ],
};
