/** Heads up: what needs a look, under the walk. */

import { AGES } from './ages.ts';

export const HEADS_UP: Record<string, unknown>[] = [
  {
    /* WHAT NEEDS A LOOK, AS ONE TILE OF THREE LINES, SINCE money-core 3.5.0: a balance more than a week old, money
       late coming in and money late going out were three tiles the whole width, each one line tall, stacked like
       three banners. A boxed section draws the blocks after it, up to the next section, on one surface, and each line
       under it is drawn only while it is true, so the tile holds what is true today and nothing else. Coming and
       going's section after it is what closes it.

       UNDER THE WALK, IN THE MAIN COLUMN, SINCE money-core 3.11.0: where the money sits went into the side column, and
       what needs a look about it stays where the eye goes after the chart. */
    kind: 'section',
    heading: 'Heads up',
    icon: 'bell',
    span: 12,
    /* IN THE SIDE COLUMN, UNDER THE ACCOUNTS (the UI pass of 20 October, H18 and H19): what needs a look sits on the
       first screen beside the walk and the Ledger, where it stood under both and the column beside the Ledger was
       empty. Each line ends on its one way to act. A box never crosses columns, so every line is in the rail too. */
    area: 'rail',
    box: true,
    /* ONLY ONCE THERE IS AN ACCOUNT, as every line under it reads money there is, so a fresh record reads its line
       and the box to add an account and nothing else. */
    when: { metric: 'cash-accounts', gt: 0 },
  },
  {
    /* A BALANCE MORE THAN A WEEK OLD IS SAID ON THE PAGE THAT READS IT, SINCE money-core 3.3.0. The accounts were
       cards that marked it (`stale:`), and Cash now cut by account carries no day; every figure here starts from
       these balances, so an old one is the one thing about them that needs the person. The day is the oldest, the
       one Cash now's own note says. NO HEADING OF ITS OWN SINCE money-core 3.5.0: it is a line of Heads up.

       THE DAY THE BANK LAST SAID IT, SINCE money-core 3.16.0 (REC-B03), and it was the typed "As of", which a bank
       message never writes: both figures read the roll's own day now (`read: as_of`, `read: stale`). The tile under it
       says which account, by name, and the box beside that takes what one holds today (`ages.ts`). */
    kind: 'note',
    tone: 'warn',
    span: 12,
    area: 'rail',
    body: 'The oldest balance in Cash now was last confirmed on {{cash-as-of}}. [Update balances](/r/balances?new=1)',
    when: { metric: 'balances-stale', gt: 0 },
  },
  ...AGES,
  {
    /* NOTES THAT DRAW ONLY WHEN THEY ARE TRUE, and say what is late, never what the law says about it: a page
       everybody's Money draws does not speak for one country's courts. IN A FINANCE PAGE'S WORDS, SINCE money-core
       3.3.0: money coming in and going out, invoices and bills, and never who owes whom.

       A ROW IS WHOLE WHATEVER IS HIDDEN, everywhere on this page: a tile drawn on a figure of its own takes the
       whole row, and two tiles share a row only when one figure draws both. Two tiles shown on different figures
       leave a hole the day only one of them is true, and that is most days on most records. Inside Heads up each line
       is the whole width of the tile for the same reason. */
    kind: 'note',
    tone: 'warn',
    span: 12,
    area: 'rail',
    body: 'Invoices {{bad:late}}: {{late-in}} to come in. [See them](/r/obligations?f=direction:is:owed_to_me&f=state:in:open,part&f=due:before:today)',
    when: { metric: 'late-in', gt: 0 },
  },
  {
    /* A PART OF A PLAN THAT IS LATE IS LATE AS A BILL IS, SINCE money-core 3.18.0 (the audit of 22 October, U4): first
       in this line, by name, with its amount and its day, and the bills after it. One line and not a second, because
       Money is at the twenty-four blocks a page declares: the sentence said is the first of `says` that holds. */
    kind: 'note',
    tone: 'bad',
    span: 12,
    area: 'rail',
    says: [
      {
        when: { all: [{ metric: 'installments-late', gt: 0 }, { metric: 'overdue', gt: 0 }] },
        body: '{{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}. Bills late too: {{overdue}} to pay. [See them](/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today)',
      },
      {
        when: { metric: 'installments-late', gt: 0 },
        body: '{{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}. [See it](/r/installments?f=state:is:open&f=direction:is:out&f=due:before:today)',
      },
      { body: 'Bills {{bad:late}}: {{overdue}} to pay. [See them](/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today)' },
    ],
    when: { any: [{ metric: 'overdue', gt: 0 }, { metric: 'installments-late', gt: 0 }] },
  },
  {
    /* A CATEGORY MARKED ONE WAY THAT HOLDS MONEY GOING THE OTHER, SINCE money-core 3.16.0 (REC-A13 job 2): an import
       that filed money coming in under a category marked "Money out" leaves every figure by category wrong in silence.
       The line says how many and what makes it right, Either way being the category's own word for both
       (`lists/categories.ts`); drawn only while one is (`categories-against-direction`). */
    kind: 'note',
    tone: 'warn',
    span: 12,
    area: 'rail',
    body: 'Categories holding money going the other way from how they are marked: {{categories-against-direction}}. Make it either way: in Categories, set Which way to Either way.',
    when: { metric: 'categories-against-direction', gt: 0 },
  },
];
