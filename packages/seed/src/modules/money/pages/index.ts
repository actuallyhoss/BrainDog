/** Money's pages, by id, in the order a record has always held them. Cut out of `money.ts` (REC-B01 job 1). */

import type { SeedPage } from '../../base.ts';
import { MONEY_ACCOUNT_PAGE, MONEY_BILL_PAGE } from './account.ts';
import { MONEY_ACCOUNTS_PAGE } from './accounts.ts';
import { MONEY_BOOK_PAGE } from './book.ts';
import { MONEY_BUDGETS_PAGE } from './budgets.ts';
import { MONEY_COMING_PAGE } from './coming.ts';
import { MONEY_FORECAST_PAGE } from './forecast.ts';
import { MONEY_LEDGER_PAGE } from './ledger.ts';
import { MONEY_PAGE } from './money.ts';
import { MONEY_PAYEES_PAGE } from './payees.ts';
import { MONEY_PLAN_PAGE } from './plan.ts';
import { MONEY_REPORTS_PAGE } from './reports.ts';
import { MONEY_RULES_PAGE } from './rules.ts';

export const MONEY_PAGES: Record<string, SeedPage> = {
  money: MONEY_PAGE,
  'money-book': MONEY_BOOK_PAGE,
  'money-plan': MONEY_PLAN_PAGE,
  /* WHAT THE LEDGER FILES BY ITSELF, SINCE money-core 3.17.0 (REC-B10 job 10): last, so every page above keeps its place. */
  'money-rules': MONEY_RULES_PAGE,
  /* AN ACCOUNT'S PAGE AND A BILL'S, SINCE money-core 3.19.0 (things, not rows): last, so every page above keeps its place. */
  'money-account': MONEY_ACCOUNT_PAGE,
  'money-bill': MONEY_BILL_PAGE,
  /* MONEY AS A SECTION, SINCE money-core 3.29.0: a page per job under Money, in the order the section lists them. Last,
     so every page above keeps its place. */
  'money-accounts': MONEY_ACCOUNTS_PAGE,
  'money-ledger': MONEY_LEDGER_PAGE,
  'money-budgets': MONEY_BUDGETS_PAGE,
  'money-coming': MONEY_COMING_PAGE,
  'money-forecast': MONEY_FORECAST_PAGE,
  'money-reports': MONEY_REPORTS_PAGE,
  'money-payees': MONEY_PAYEES_PAGE,
};
