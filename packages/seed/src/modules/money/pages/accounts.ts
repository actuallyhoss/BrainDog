/** Accounts: every account, grouped by kind and then currency, each with what it holds and how old that is. */

import type { SeedPage } from '../../base.ts';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is one of them. It
 * holds its line alone for now, so the section has the page and its address before its blocks are written.
 */
export const MONEY_ACCOUNTS_PAGE: SeedPage = {
  page: 'money-accounts',
  title: 'Accounts',
  nav: { section: 'Money', order: 11 },
  icon: 'wallet',
  requires: ['register.accounts'],
  pack: 'money-core',
  blocks: [
    {
      kind: 'note',
      lead: true,
      span: 12,
      body: 'Every account you keep, by bank, cash and card.',
    },
  ],
};
