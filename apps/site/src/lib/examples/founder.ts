/**
 * The Solo founder example: a one-person studio's money, customers and invoices.
 *
 * EVERY FIGURE IS FICTIONAL AND AGREES WITH EVERY OTHER, dated as the drawing is (Monday 28 September
 * 2026). September's USD 8,420.00 in and USD 3,115.00 out are the last bar of the series and the
 * sentence at the top of Home; the USD 1,850.00 owed is the two unpaid invoices on Invoices
 * (1,200.00 and 650.00); and Northwind Studio's invoice, sent on 9 September on seven days' terms,
 * is 12 days late on the 28th, which is what the Bookkeeper asks about on Decide.
 */
import type { Example } from './types.ts';

export const founder: Example = {
  id: 'founder',
  label: 'Solo founder',
  glyph: 'wallet',
  pages: [
    {
      id: 'home',
      title: 'Today',
      glyph: 'home',
      src: `~~~note lead
September brought in USD 8,420.00 and cost USD 3,115.00. Two invoices are still out.
~~~

~~~stat | September
Revenue | USD 8,420.00 | from 12 paying customers | 5200 6100 6900 7650 7900 8420
Owed to you | USD 1,850.00 | 2 invoices out
Runway | 14 months | at September's costs
~~~

~~~series net | Money in and out
Month | in: Money in | out: Money out | state
April | USD 5,200.00 | USD 2,840.00
May | USD 6,100.00 | USD 2,910.00
June | USD 6,900.00 | USD 3,020.00
July | USD 7,650.00 | USD 3,060.00
August | USD 7,900.00 | USD 3,090.00
September | USD 8,420.00 | USD 3,115.00 | partial
~~~

~~~ring | Paying customers, the goal for this quarter
Paying customers | 12 | 15
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
        { at: 2, cols: 8 },
        { at: 3, cols: 4 },
      ],
      links: { 1: [null, 'invoices', null] },
      reads: {
        2: 'Money in rose every month since April, while costs held near USD 3,000.00.',
        3: 'Three more paying customers reach the goal of 15 for this quarter.',
      },
    },
    {
      id: 'decide',
      title: 'Decide',
      glyph: 'decide',
      src: `~~~queue | Waiting on you
q | f1 | Bookkeeper | 20 min ago | Send Northwind Studio a reminder for USD 1,200.00? | The invoice is 12 days late. They paid the last three within a week of a reminder. | call
opt | f1 | accept | Accept | The reminder goes out today, in your words from last time | true
opt | f1 | reject | Reject | Nothing is sent, and the invoice stays on your list |
~~~`,
    },
    {
      id: 'inbox',
      title: 'Inbox',
      glyph: 'inbox',
      src: `~~~timeline | Arrived and filed
Today 08:30 | Receipt for hosting, USD 42.00 | Filed to Costs, September
Fri 25 Sep | Contract signed by Hollis and Park | Filed to Customers | good
Thu 24 Sep | Receipt for design software, USD 24.00 | Filed to Costs, September
~~~`,
    },
    {
      id: 'invoices',
      title: 'Invoices',
      glyph: 'money',
      src: `~~~comparison | Invoices
Customer | Amount | Sent | Where it stands
Northwind Studio | USD 1,200.00 | 9 Sep | 12 days late
Hollis and Park | USD 650.00 | 21 Sep | Due 5 Oct
Marigold Foods | USD 980.00 | 1 Sep | Paid 8 Sep
Tern Labs | USD 2,400.00 | 1 Sep | Paid 3 Sep
~~~`,
    },
    {
      id: 'automations',
      title: 'Automations',
      glyph: 'refresh',
      src: `~~~steps | Chase a late invoice
Starts when | An invoice is 7 days past its due day | trigger
Only if | The customer has paid you before | condition
Then | Draft a friendly reminder | step
Then | Ask you on Decide before it is sent | action
~~~`,
    },
    {
      id: 'agents',
      title: 'Agents',
      glyph: 'people',
      src: `~~~cards | Working now
who | fact: Doing | when
Bookkeeper | Matching September's receipts to costs | now
Inbox filer | Reading a receipt for hosting | 1 min ago
~~~

~~~agents | What they did
Bookkeeper | 1 | proposed Send Northwind Studio a reminder | 20 min ago
Bookkeeper | 6 | changed September's costs | today
Inbox filer | 3 | added Receipt for hosting | today
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
      ],
    },
  ],
};
