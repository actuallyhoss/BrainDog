/** Money's first line: what the money is doing, in one sentence. */

export const HEADLINE: Record<string, unknown>[] = [
  {
    /* THE HEADLINE LINE, SAID FROM THE FIGURES: what the money is doing, in one sentence inside the page's headline
       tile with its name and tools. Since money-core 3.3.0 it is said on every record that keeps one set of money,
       and not only while the walk goes under: what there is and where, then, only while it is true, the day count
       the walk below goes under in. A clause whose figure has no value is left out by the writer (`leadOf`), so a
       record whose money lasts the year reads "Cash is £33,850 across 2 accounts" and stops there, and a record with
       no account yet reads no sentence at all. The figures are the tiles' own, so the line and the tiles cannot
       disagree. With two books or more one Cash now adds a company's money to a person's own, so the line goes
       with the tile it would sum.

       HOW FAR CASH MOVED IN A MONTH IS ITS OWN CLAUSE, SINCE money-core 3.3.0 (`{{cash-now.change}}`, "+8% on a month
       ago"), said against the point the night remembered thirty days back. A record with no point that old, or a
       point in another currency, has no change, and the clause drops with nothing left of it.

       WHEN IT RUNS OUT IS THE TILE'S, SINCE money-core 3.11.0: the side column says it in the figure's own size beside
       the walk, and a line saying it as well would be the same fact twice on one screen. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { metric: 'books-held', lt: 2 },
    body: 'Cash is {{cash-now}} across {{cash-accounts}} account(s), {{cash-now.change}} on a month ago.',
  },
  /* NO "WHAT YOU HAVE" TILE BESIDE THE LINE, SINCE money-core 3.4.0. It said Cash now, the accounts and how long it
     lasts, which are the three figures the line above says, so a person read them twice before reading anything
     else. Cash ahead draws how the same cash moves, the whole width. */
];
