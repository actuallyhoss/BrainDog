/** Closing an account: written, and in no pack document yet, for the reasons below. */

import { CLOSE_ACCOUNT_SCRIPT } from './scripts/close-account.js';

/**
 * CLOSING AN ACCOUNT THAT STILL HOLDS MONEY: the script, the rule that starts it when an account's
 * status becomes Closed, and the automation that runs it again with the answer, so "Move it to Savings" writes the two
 * legs of the move. Both halves and the script together, as `payment-settles` and `SETTLE_SCRIPT` arrive.
 *
 * HELD BESIDE `MONEY_AUTOMATIONS` AND IN NO PACK DOCUMENT, because today the chain stops after its first link, and a
 * question whose answer to move does nothing is worse than no question: it would say "$1,200.00 goes to Savings as one
 * move" and move nothing. Measured on a record with these three installed:
 *   - THE SCRIPT IS STARTED AND READS NO ACCOUNT. A script step hands the row's `id`, `register` and `seq`, and fills
 *     `input:` from the run alone, so `account: '{{id}}'` arrives as those braces. The script reads `input.account` as
 *     "accounts#3" and nothing else, so it ends with "handed no account". It has to read the identity it is handed.
 *   - AN ANSWER STARTS NOTHING. The record tells `onDecided` what a question is about only for one a rule opened or a
 *     change proposes. A script's question arrives with no `about`, so `about: script.close_account` never matches, and
 *     with no row, since the question names its account by name. With no `about` here the automation would start on
 *     every decision in the record, so it names one and waits.
 *   - WHAT THE ACCOUNT ROLLS TO CANNOT BE HANDED. A fill is always text and `holds` is a whole number, and nothing a
 *     run fills is one account's rolled amount. So the question would be about the balance somebody typed.
 * When the first two are mended these three join `MONEY_AUTOMATIONS` with a new version of the pack, and the third
 * decides whether the amount asked about is the roll's or the typed one.
 *
 * ON A CHANGE OF STATUS ALONE (`op: update`, `fields: state`), so an edit to an account's name starts nothing and an
 * account typed in already closed asks nothing. No `once_per`: an account reopened and closed again is asked about
 * again, and a second run for the same closing joins the open question by its cause.
 *
 * THE ANSWER IS HANDED BY ITS WORDS AND THE DAY IT WAS GIVEN, and no `option:` narrows the trigger, since an answer to
 * move is named after the account it moves to. The day is the decision's (`{{trigger.day}}`), which a retried run
 * keeps, so the script finds its own leg on that day and writes no second pair. "Close it as it stands" runs too and
 * changes nothing: the account is closed already.
 */
export const CLOSE_ACCOUNT_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'account-closed',
    name: 'Ask where a closed account\'s money goes',
    pack: 'money-core',
    on: { written: { register: 'accounts', op: ['update'], fields: ['state'] } },
    when: 'state is closed',
    steps: [{ script: { id: 'close_account', as: 'closing', input: {} } }],
  },
  {
    rule: 'account-moved',
    name: 'Move what a closed account holds',
    pack: 'money-core',
    on: { decided: { about: 'script.close_account' } },
    steps: [{ script: { id: 'close_account', as: 'moving', input: { answer: '{{trigger.option}}', on: '{{trigger.day}}' } } }],
  },
  CLOSE_ACCOUNT_SCRIPT,
];
