/** Forecast: the cash walk ahead, its lowest point and what moves it. */

import type { SeedPage } from '../../base.ts';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is one of them. It
 * holds its line alone for now, so the section has the page and its address before its blocks are written.
 */
export const MONEY_FORECAST_PAGE: SeedPage = {
  page: 'money-forecast',
  title: 'Forecast',
  nav: { section: 'Money', order: 15 },
  icon: 'chart-line',
  requires: ['register.accounts', 'register.transactions'],
  pack: 'money-core',
  blocks: [
    {
      kind: 'note',
      lead: true,
      span: 12,
      body: 'Where your cash is heading.',
    },
  ],
};
