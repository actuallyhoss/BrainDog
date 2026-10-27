/** Payees: who money goes to and comes from, the most first. */

import type { SeedPage } from '../../base.ts';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is one of them. It
 * holds its line alone for now, so the section has the page and its address before its blocks are written.
 */
export const MONEY_PAYEES_PAGE: SeedPage = {
  page: 'money-payees',
  title: 'Payees',
  nav: { section: 'Money', order: 17 },
  icon: 'store',
  requires: ['register.transactions'],
  pack: 'money-core',
  blocks: [
    {
      kind: 'note',
      lead: true,
      span: 12,
      body: 'Who you pay most, and how often.',
    },
  ],
};
