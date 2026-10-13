/** Money's pages, by id, in the order a record has always held them. Cut out of `money.ts` (REC-B01 job 1). */

import type { SeedPage } from '../../base.ts';
import { MONEY_BOOK_PAGE } from './book.ts';
import { MONEY_PAGE } from './money.ts';
import { MONEY_PLAN_PAGE } from './plan.ts';

export const MONEY_PAGES: Record<string, SeedPage> = {
  money: MONEY_PAGE,
  'money-book': MONEY_BOOK_PAGE,
  'money-plan': MONEY_PLAN_PAGE,
};
