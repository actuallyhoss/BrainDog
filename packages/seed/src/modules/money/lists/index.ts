/**
 * Money's lists, in the order a record has always held them. Each list is its own file, cut out of `money.ts` with no
 * change, and the order here is the order of the document, which the pinned fingerprint holds.
 */

import { ACCOUNTS_REGISTER } from './accounts.ts';
import { BALANCES_REGISTER } from './balances.ts';
import { BOOKS_REGISTER } from './books.ts';
import { CATEGORIES_REGISTER } from './categories.ts';
import { FILING_RULES_REGISTER } from './filing-rules.ts';
import { FX_REGISTER } from './fx.ts';
import { INSTALLMENTS_REGISTER } from './installments.ts';
import { OBLIGATIONS_REGISTER } from './obligations.ts';
import { PAYEE_NAMES_REGISTER } from './payee-names.ts';
import { PLANS_REGISTER } from './plans.ts';
import { RECURRING_REGISTER } from './recurring.ts';
import type { MoneyRegister } from './shared.ts';
import { SNAPSHOTS_REGISTER } from './snapshots.ts';
import { TRANSACTIONS_REGISTER } from './transactions.ts';

export const MONEY_REGISTERS: Record<string, MoneyRegister> = {
  obligations: OBLIGATIONS_REGISTER,
  accounts: ACCOUNTS_REGISTER,

  /* `holdings` WAS DECLARED HERE FROM 1.5.0 TO 1.8.0. money-core 2.0.0 gave it to a pack of its own, now the file
     `packs/holdings/holdings.pack.json`, and its reasons went with it: what one person holds is not what everybody's Money is for. */
  fx: FX_REGISTER,
  categories: CATEGORIES_REGISTER,
  /* AFTER CATEGORIES AND BEFORE THE LEDGER, SINCE money-core 3.17.0: a rule links to a category, and a Ledger entry
     links to the rule that filed it. */
  filing_rules: FILING_RULES_REGISTER,
  transactions: TRANSACTIONS_REGISTER,
  /* AFTER THE LEDGER, SINCE money-core 3.34.0: a payee name names Ledger lines, and nothing links to it. */
  payee_names: PAYEE_NAMES_REGISTER,
  recurring: RECURRING_REGISTER,
  /* BEFORE INSTALMENTS, SINCE REC-B12 (folded into the unreleased money-core 3.17.0): a part links to its plan. */
  plans: PLANS_REGISTER,
  installments: INSTALLMENTS_REGISTER,
  balances: BALANCES_REGISTER,
  snapshots: SNAPSHOTS_REGISTER,
  books: BOOKS_REGISTER,
};
