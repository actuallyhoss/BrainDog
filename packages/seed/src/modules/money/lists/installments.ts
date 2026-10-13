/** Instalments: something paid in parts, one row a part. */

import { BOOK, type MoneyRegister } from './shared.ts';

/**
 * SOMETHING PAID IN PARTS, one row a part. The plan is a name the rows share rather than a row of its
 * own, so the total is the sum of the parts and cannot disagree with them.
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
    /* THE ACCOUNT'S CURRENCY WHEN NONE IS SAID, SINCE money-core 3.16.0 (REC-B04). A part with no account and no code is
       refused in one sentence; a part sent with its own code is kept as written. */
    { id: 'amount', type: 'money', required: true, currency_from: 'account.balance' },
    { id: 'due', type: 'day', index: true, deadline: true, required: true, remind: ['-7d', '0d'] },
    { id: 'state', label: 'Status', type: 'enum', values: ['open', 'paid', 'cancelled'], default: 'open', index: true, required: true },
    { id: 'settled', label: 'Paid on', type: 'day' },
    /* THE ONE LEDGER ENTRY THAT PAID IT (REC-B11). A part is paid once, so the link lives here and names one payment,
       where a bill keeps "Settles" on each of its several. Written by Money's `settle` script with the state and the
       day, so paid is what a payment did and not a status somebody remembered to set. Not indexed, as `book` is not. */
    { id: 'paid_by', label: 'Paid by', type: 'ref', to: 'transactions' },
    { id: 'party', label: 'Who', type: 'ref', to: 'people' },
    { id: 'account', type: 'ref', to: 'accounts', index: true },
    { id: 'category', type: 'ref', to: 'categories', index: true },
    { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
    /* NOT INDEXED, as on `recurring`: this list is one short of `INDEX_CEILING`, and the last is left free. */
    { ...BOOK },
    { id: 'note', type: 'text' },
  ],
};
