/** History: the months behind, folded. */

export const HISTORY: Record<string, unknown>[] = [
  {
    /* WHAT ALREADY HAPPENED, FOLDED SHUT, SINCE money-core 3.11.0: the months behind, a tap away, so the page a person
       reads each morning is what there is, how long it lasts and what is coming. */
    kind: 'section',
    heading: 'History',
    /* A GLYPH THE APP DRAWS ON A FOLDED HEADING, as a project's History and notes wore. */
    icon: 'history',
    span: 12,
    fold: true,
    when: { metric: 'cash-accounts', gt: 0 },
  },
  /* ONE MONTHLY VIEW, SINCE money-core 3.4.0. Where this month's money went and Every month were two more splits of
     what goes out in a month beside the chart under, which draws the same month among its twelve; a person read
     monthly spending three times. What each category takes is on the categories' own list. */
  {
    /* MONTH BY MONTH: what moved in and out in the six months to now, read from `transactions`, and what the walk moves
       in the three after, with what was left each month as a line. The current month is so far and what the walk
       still moves in it, and the months ahead are the walk's own steps in each.

       SIX BACK, SINCE REC-B23 (the Money board: "six months back and three ahead"), where it read twelve: half a year
       is what a person plans the next three months by, and nine bars read as one picture where fifteen read as a
       ledger ("i dont want a very 'busy' looking ui"). A book's page draws its own twelve (`book.ts`). */
    kind: 'series',
    heading: 'In and out, by month',
    icon: 'chart-column',
    span: 12,
    /* THE MONTHS AHEAD ARE THE WALK'S, SINCE money-core 3.27.0 (`in-ahead-by-month`, `out-ahead-by-month`): the steps
       Cash ahead's line moves by, cut by month, so a part of a plan falling due in a month ahead is in that month's bar.
       They were bills due once and what repeats at its monthly share, which left every part of a plan out. */
    series: [
      { metric: 'in-by-month', then: 'in-ahead-by-month', label: 'Money in' },
      { metric: 'out-by-month', then: 'out-ahead-by-month', label: 'Money out', dir: 'out' },
    ],
    back: 6,
    ahead: 3,
    net: true,
    when: { metric: 'out-by-month', gt: 0 },
    empty: 'Nothing moved or due in these months.',
  },
  /* WHAT MOVED IS NOT HERE, SINCE THE LEDGER TILE (REC-B15, `parts/ledger.ts`): its twelve lines were folded shut under
     this heading, where the owner went looking for them. The six newest stand open on the page now, and a page that
     drew them twice would be saying one thing in two places. */
];
