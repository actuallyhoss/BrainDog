/**
 * The Solo founder example: a one-person studio's money, customers and invoices.
 *
 * EVERY FIGURE IS FICTIONAL AND AGREES WITH EVERY OTHER, dated as the drawing is (Monday 28 September
 * 2026). September's USD 8,420.00 in and USD 3,115.00 out are the last bar of the series and the
 * sentence at the top of Home; the USD 1,850.00 owed is the two unpaid invoices on Invoices
 * (1,200.00 and 650.00); and Northwind Studio's invoice, sent on 9 September on seven days' terms,
 * is 12 days late on the 28th, which is what Money's late-invoice rule asks about in Needs you (`invoice-late`).
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
Apr | USD 5,200.00 | USD 2,840.00
May | USD 6,100.00 | USD 2,910.00
Jun | USD 6,900.00 | USD 3,020.00
Jul | USD 7,650.00 | USD 3,060.00
Aug | USD 7,900.00 | USD 3,090.00
Sep | USD 8,420.00 | USD 3,115.00 | partial
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
      id: 'needs',
      title: 'Needs you',
      glyph: 'decide',
      src: `~~~queue | Waiting on you
q | f1 | Money | 20 min ago | Northwind Studio's invoice was due 12 days ago, USD 1,200.00. Chase it? | Sent on 9 September, on seven days' terms. | call
opt | f1 | accept | Chase it | It is marked as chased, and a reminder is written for you to send | true
opt | f1 | reject | Not yet | Nothing changes, and the invoice stays on your list |
~~~`,
    },
    {
      id: 'inbox',
      title: 'Inbox',
      glyph: 'inbox',
      src: `~~~timeline | Arrived and filed
Today 08:30 | Receipt for hosting, USD 42.00 | Filed to Costs, September
Fri 25 Sep | Receipt for a train ticket, USD 38.00 | Filed to Costs, September
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
Then | Ask you in Needs you whether to chase it | action
If you say chase it | Mark it as chased, and write a reminder for you to send | step
~~~`,
    },
    {
      id: 'agents',
      title: 'Agents',
      glyph: 'people',
      src: `~~~cards | Working now
who | fact: Doing | when
Claude | Client portal: invoice export | now
Cursor | Landing page: pricing copy | 4 min ago
~~~

~~~agents | What they did
Claude | 6 | changed Client portal's next step | today
Cursor | 3 | changed Pricing page copy | today
ChatGPT | 1 | added Hollis and Park's invoice | Mon 21 Sep
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
      ],
    },
  ],
};
