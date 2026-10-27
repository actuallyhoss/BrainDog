/** Coming up: what repeats, the bills and the parts of plans, one list by date. */

import type { SeedPage } from '../../base.ts';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is one of them. It
 * holds its line alone for now, so the section has the page and its address before its blocks are written.
 */
export const MONEY_COMING_PAGE: SeedPage = {
  page: 'money-coming',
  title: 'Coming up',
  nav: { section: 'Money', order: 14 },
  icon: 'calendar-clock',
  requires: ['register.recurring', 'register.obligations', 'register.installments'],
  pack: 'money-core',
  blocks: [
    {
      kind: 'note',
      lead: true,
      span: 12,
      body: 'What comes in and goes out next, by date.',
    },
  ],
};
