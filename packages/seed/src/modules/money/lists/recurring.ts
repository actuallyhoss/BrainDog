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
  /* THE ONE SENTENCE A PERSON READS ABOUT WHICH DAY WINS, since a field carries no note to the form: "Next" is the next
     payment, and the days of the month every one after it. */
  holds:
    'the money that comes in and goes out on a cadence, weekly to yearly, without anybody deciding again. Next is the next payment, and the days of the month every one after it',
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
    /* THE ACCOUNT'S CURRENCY WHEN NONE IS SAID, SINCE money-core 3.16.0: a line with an account takes the
       code of that account's balance, as the Ledger's amount does. */
    { id: 'amount', type: 'money', required: true, qualifies: 'every', currency_from: 'account.balance' },
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
    /* THE LAST PAYMENT, ITS DAY AND WHAT IT CAME TO, and no link: a line is a pattern and is paid every cycle,
       so it names no one Ledger entry. Money's `settle` script writes both when a payment is matched to the line and
       moves "Next" one cycle on in the same change, by the walk's own steps (`cycleAfter`). The amount is the payment's,
       which is not always the line's: a line keeps its own amount until a person says to change it. Neither is indexed,
       for the reason `book` is not. */
    { id: 'last_paid', label: 'Last paid', type: 'day' },
    { id: 'last_amount', label: 'Last amount', type: 'money' },
    /* THE DAYS OF THE MONTH IT LANDS ON, SINCE money-core 3.16.0: a day from 1 to 31, `last`, or two of them,
       `15, last`. A salary paid twice a month has days, and they were one table for every line of every record, the 1st
       and the 15th; and a line on the 30th typed in September walked to 31 October, read as "the end of the month".
       `last` is each month's own last day, and `30` is the 30th, or the end of a shorter month.

       "NEXT" WINS FOR THE NEXT PAYMENT AND THIS FIELD FOR EVERY ONE AFTER IT, which the list's own description says: a line
       whose two disagree moves first on the day somebody wrote, and then on its days (`days` in the walk,
       `packages/kernel/src/forecast.ts`). Empty walks as it did, and twice a month falls back to the 1st and the 15th.

       TEXT AND CHECKED TWICE, because a field has no pattern of its own: `max` holds it to a few characters, and the walk
       reads it with the one grammar (`daysOf`) and says each line it could not read, which then walks by how often alone.
       Not indexed, for the same reason `book` is not.

       THE LABEL HAS NO COMMA, because a person filters by the name the screen shows (`days of the month is 15`), and a
       comma in a name is a second clause to the grammar (`pages-read.test.ts`). */
    { id: 'day_of_month', label: 'Days of the month', type: 'text', max: 12 },
    /* WHAT HAPPENS TO A DAY THAT FALLS ON A REST DAY (Money's `rest_days`, Saturday and Sunday until somebody says
       otherwise): kept, or moved to the working day before or after. `leave` is the default because it is a line as
       imported: nothing moves until a person says it does. */
    {
      id: 'weekend',
      label: 'On a rest day',
      type: 'enum',
      values: ['leave', 'before', 'after'],
      labels: { leave: 'Keep the day', before: 'The working day before', after: 'The working day after' },
      default: 'leave',
    },
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
