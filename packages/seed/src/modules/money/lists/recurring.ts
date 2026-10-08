/** Repeating: what comes round without anybody deciding again. */

import { BOOK, type MoneyRegister } from './shared.ts';

/**
 * WHAT COMES ROUND WITHOUT ANYBODY DECIDING AGAIN. `next_due` is the only date, because a repeating
 * item is not a list of dates: it is a pattern, and the dates are what the forecast walks from it.
 *
 * THE ONE HOME OF REPEATING MONEY, SINCE money-core 3.0.0. It was deliberately not walked while `obligations.repeats`
 * was, so a salary typed here never reached Cash ahead; now the walk reads this list and a bill's `repeats` is kept
 * and not walked (`CASH_LEGS`).
 */
export const RECURRING_REGISTER: MoneyRegister = {
  id: 'recurring',
  name: 'Repeating',
  icon: 'refresh',
  one: 'repeating item',
  holds: 'the money that comes in and goes out on a cadence, weekly to yearly, without anybody deciding again',
  title: 'what',
  mobile: ['what', 'amount', 'next_due'],
  state: 'state',
  done: ['ended'],
  pack: 'money-core',
  fields: [
    { id: 'what', label: 'Description', type: 'text', required: true, search: true },
    {
      id: 'direction',
      label: 'Which way',
      type: 'enum',
      values: ['in', 'out'],
      labels: { in: 'Money in', out: 'Money out' },
      index: true,
      required: true,
    },
    { id: 'amount', type: 'money', required: true, qualifies: 'every' },
    /* THE VALUES ARE `LOOKUPS.per_month`'S AND THE WALK'S. A frequency the factor table does not know is
       counted at nothing a month by every figure that reads this list, which is a silent zero, and one the walk does
       not know moves once and is said. So a value goes into this list, the table and `CASH_LEGS` together. */
    {
      id: 'every',
      label: 'How often',
      type: 'enum',
      values: ['weekly', 'fortnightly', 'twice_monthly', 'monthly', 'quarterly', 'yearly'],
      labels: { weekly: 'Every week', fortnightly: 'Every two weeks', twice_monthly: 'Twice a month', monthly: 'Every month', quarterly: 'Every quarter', yearly: 'Every year' },
      index: true,
      required: true,
    },
    { id: 'next_due', label: 'Next', type: 'day', index: true, deadline: true, required: true, remind: ['-3d', '0d'] },
    { id: 'started', label: 'Since', type: 'day' },
    /* Empty means it does not stop, which is the normal case and is why there is no `forever` value. */
    { id: 'ends', label: 'Ends', type: 'day' },
    { id: 'account', type: 'ref', to: 'accounts', index: true },
    { id: 'category', type: 'ref', to: 'categories', index: true },
    { id: 'party', label: 'Who', type: 'ref', to: 'people' },
    { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
    /* NOT INDEXED: this list is one short of `INDEX_CEILING` (`packages/kernel/src/declare.ts`), and the last index
       is left for a field that needs it more. */
    { ...BOOK },
    { id: 'state', label: 'Status', type: 'enum', values: ['live', 'paused', 'ended'], default: 'live', index: true, required: true },
    { id: 'note', type: 'text' },
  ],
};
