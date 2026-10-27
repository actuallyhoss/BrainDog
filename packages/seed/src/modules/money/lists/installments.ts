/** Instalments: something paid in parts, one row a part. */

import { BOOK, type MoneyRegister } from './shared.ts';

/**
 * SOMETHING PAID IN PARTS, one row a part. The total is the sum of the parts and is written nowhere else, so nothing
 * can disagree with them. The plan is the name the parts share (`plan`), which Cash ahead groups by, and since REC-B12
 * a row of its own on Plans as well (`plan_row`), which holds no amount for the same reason.
 */
export const INSTALLMENTS_REGISTER: MoneyRegister = {
  id: 'installments',
  name: 'Instalments',
  icon: 'calendar',
  one: 'instalment',
  holds: 'the parts of something paid over time, and the day each part falls due',
  title: 'what',
  mobile: ['what', 'amount', 'due'],
  state: 'state',
  done: ['paid', 'cancelled'],
  pack: 'money-core',
  fields: [
    { id: 'what', label: 'Description', type: 'text', required: true, search: true },
    { id: 'plan', type: 'text', index: true, required: true, search: true },
    /* THE PLAN AS A ROW, SINCE REC-B12, beside the text above and never in its place. Written by Money's
       `plans_from_names` script, which makes one plan for each distinct text and links its parts, so nobody fills it
       by hand. Not indexed, as `book` is not: the text is, and a plan's parts are found by it. */
    { id: 'plan_row', label: 'Part of', type: 'ref', to: 'plans' },
    { id: 'number', label: 'Instalment', type: 'int', min: 1 },
    { id: 'parts', label: 'Of', type: 'int', min: 1 },
    {
      id: 'direction',
      label: 'Which way',
      type: 'enum',
      values: ['in', 'out'],
      labels: { in: 'Money in', out: 'Money out' },
      index: true,
      required: true,
    },
    /* THE ACCOUNT'S CURRENCY WHEN NONE IS SAID, SINCE money-core 3.16.0. A part with no account and no code is
       refused in one sentence; a part sent with its own code is kept as written. */
    { id: 'amount', type: 'money', required: true, currency_from: 'account.balance' },
    { id: 'due', type: 'day', index: true, deadline: true, required: true, remind: ['-7d', '0d'] },
    { id: 'state', label: 'Status', type: 'enum', values: ['open', 'paid', 'cancelled'], default: 'open', index: true, required: true },
    { id: 'settled', label: 'Paid on', type: 'day' },
    /* THE ONE LEDGER ENTRY THAT PAID IT. A part is paid once, so the link lives here and names one payment,
       where a bill keeps "Settles" on each of its several. Written by Money's `settle` script with the state and the
       day, so paid is what a payment did and not a status somebody remembered to set. Not indexed, as `book` is not. */
    { id: 'paid_by', label: 'Paid by', type: 'ref', to: 'transactions' },
    /* WHAT IS LEFT OF THE PLAN ONCE THIS PART IS PAID: the plan's open parts due after this one, added up
       in this part's currency, so the last part reads nought. Written by the same script for every part of a plan
       when any part of it is written, and each night. Never typed, and nothing sums it. */
    { id: 'left_after', label: 'Left after', type: 'money' },
    { id: 'party', label: 'Who', type: 'ref', to: 'people' },
    { id: 'account', type: 'ref', to: 'accounts', index: true },
    { id: 'category', type: 'ref', to: 'categories', index: true },
    { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
    /* NOT INDEXED, as on `recurring`: this list is one short of `INDEX_CEILING`, and the last is left free. */
    { ...BOOK },
    { id: 'note', type: 'text' },
  ],
};
