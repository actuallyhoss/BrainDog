/** Accounts: what is in each bank account, cash box and card. */

import { BOOK, type MoneyRegister } from './shared.ts';

export const ACCOUNTS_REGISTER: MoneyRegister = {
  id: 'accounts',
  name: 'Accounts',
  icon: 'money',
  one: 'account',
  holds: 'what is in each bank account, cash box and card, and the day that was true',
  title: 'name',
  mobile: ['name', 'balance', 'as_of'],
  /**
   * AN ACCOUNT THAT MONEY MOVED THROUGH IS NOT DELETED OUT FROM UNDER ITS MOVEMENTS, SINCE money-core 3.1.0.
   *
   * `transactions.account` is required and every balance check names one, so deleting an account left each of its
   * payments pointing at nothing: a ledger row nobody could reconcile, and a Cash now that no longer knew where the
   * money had been. The record now refuses the delete and says which lists still point at it and how many rows
   * (`packages/kernel/src/referenced.ts`); the person moves or deletes those first. Declared here in the workflow once
   * the kernel learned the key.
   */
  delete: 'refuse_while_referenced',
  pack: 'money-core',
  fields: [
    { id: 'name', type: 'text', required: true, search: true },
    { id: 'kind', label: 'Type', type: 'enum', values: ['bank', 'cash', 'card'], index: true, required: true },
    { id: 'balance', type: 'money', required: true },
    { id: 'as_of', label: 'As of', type: 'day', index: true, required: true },
    { id: 'liquid', label: 'Counts as cash', type: 'bool', default: true },
    /**
     * THE DIGITS A BANK MESSAGE NAMES THE ACCOUNT BY, and nothing else in this record could.
     *
     * `transactions.account` is a required ref, and the only thing an alert says about which account
     * moved is *"your card ending 4471"*. Without this field a pattern's `lookup:` (the card alerts in
     * `packs/card-alerts`, a bank's own pack) has no `by:` to resolve against, so every forwarded message would land
     * in `review` for a field the message plainly carried. NOT REQUIRED and not unique: a cash box has no digits,
     * and two cards from one bank can share them.
     *
     * ASKED AS THE DIGITS THE BANK PRINTS SINCE money-core 3.14.0, where it asked for the last four: some banks print
     * two, three or six, and the field holds whatever the message names. The id stays `last4`, because every bank
     * pattern's lookup reads it.
     */
    { id: 'last4', label: 'Digits the bank prints', type: 'text' },
    /**
     * THE DAY MONEY ON ITS WAY LANDS, SINCE money-core 3.0.0: a payout in transit, a transfer sent and not yet in.
     *
     * Such money is not cash yet, so its account does not count as cash, and it was in no walk either: a payout
     * landing on Friday was money the forecast never saw. An account that does not count as cash and says when it
     * arrives is walked as money in on that day (`CASH_LEGS`). Empty is money that is not on its way anywhere, which is
     * every card and every account that is cash.
     */
    { id: 'arrives', label: 'Arrives', type: 'day' },
    /* INDEXED, because Cash now by book groups the accounts by it and a book's page filters them by it. */
    { ...BOOK, index: true },
  ],
};
