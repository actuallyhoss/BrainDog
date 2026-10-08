/** Heads up: what needs a look, under the walk. */

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
    box: true,
    /* ONLY ONCE THERE IS AN ACCOUNT, as every line under it reads money there is, so a fresh record reads its line
       and the box to add an account and nothing else. */
    when: { metric: 'cash-accounts', gt: 0 },
  },
  {
    /* A BALANCE MORE THAN A WEEK OLD IS SAID ON THE PAGE THAT READS IT, SINCE money-core 3.3.0. The accounts were
       cards that marked it (`stale:`), and Cash now cut by account carries no day; every figure here starts from
       these balances, so an old one is the one thing about them that needs the person. The day is the oldest, the
       one Cash now's own note says. NO HEADING OF ITS OWN SINCE money-core 3.5.0: it is a line of Heads up. */
    kind: 'note',
    tone: 'warn',
    span: 12,
    body: "The oldest balance in Cash now is from {{cash-as-of}}. Update it so this page starts from today's money.",
    when: { metric: 'balances-stale', gt: 0 },
  },
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
    body: 'Invoices past their due date: {{late-in}} still to come in.',
    when: { metric: 'late-in', gt: 0 },
  },
  {
    kind: 'note',
    tone: 'bad',
    span: 12,
    body: 'Bills past their due date: {{overdue}} still to pay.',
    when: { metric: 'overdue', gt: 0 },
  },
];
