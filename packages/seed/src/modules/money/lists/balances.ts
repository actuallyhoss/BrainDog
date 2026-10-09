/** Balance checks: what an account held on a day. */

import { BOOK, type MoneyRegister } from './shared.ts';

/**
 * WHAT AN ACCOUNT HELD ON A DAY, AS SOMETHING OTHER THAN A PERSON TYPING IT SAID, SINCE money-core 3.0.0.
 *
 * A BALANCE TYPED ONTO THE ACCOUNT IS ONE STATEMENT AND IT GOES STALE THE DAY IT IS TYPED. A statement, a bank
 * message that prints the balance, or a count of the cash box each says the same kind of thing on a later day, and
 * `cash-now` restarts an account from the newest of them and adds only what moved after it. Kept as rows rather than
 * written over the account, so the day each was true stays and a figure can be read as of any night.
 */
export const BALANCES_REGISTER: MoneyRegister = {
  id: 'balances',
  name: 'Balance checks',
  icon: 'money',
  one: 'balance check',
  holds: 'what an account held on a day, as a statement, a bank message or a count said it',
  title: 'source',
  mobile: ['account', 'balance', 'as_of'],
  pack: 'money-core',
  fields: [
    { id: 'account', type: 'ref', to: 'accounts', index: true, required: true },
    /* IN THE ACCOUNT'S OWN CURRENCY WHEN NONE IS SAID, SINCE money-core 3.16.0 (REC-B04): "What it holds today" on Money
       takes a number, and the account it names gives the code. */
    { id: 'balance', type: 'money', required: true, currency_from: 'account.balance' },
    { id: 'as_of', label: 'As of', type: 'day', index: true, required: true },
    /* WHAT SAID IT: a statement, a bank's message, a count. The title, because a list of checks is read by where each
       came from. */
    { id: 'source', label: 'Said by', type: 'text', search: true },
    { ...BOOK, index: true },
  ],
};
