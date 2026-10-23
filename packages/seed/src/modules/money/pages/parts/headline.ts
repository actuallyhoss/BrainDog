/** Money's first line: what the money is doing, in one sentence. */

const ONE_BOOK = { metric: 'books-held', lt: 2 };
const WHAT_THERE_IS = 'Cash is {{cash-now}} across {{cash-accounts}} account(s), {{cash-now.moved}} on a month ago.';

/**
 * AND A PART THAT IS LATE, SINCE money-core 3.18.0 (the audit of 22 October, U4: "Money's first line says how much he
 * has and that the part is late"): the part late longest by its name, what it is and how long since its day, as a
 * sentence of its own after the money. Its figures are `installments-late`'s first row, so on a record with nothing
 * late the sentence has no figure that reads and goes whole (`leadOf`), and the line is what it was.
 */
const LATE_PART = ' {{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}.';

export const HEADLINE: Record<string, unknown>[] = [
  {
    /* THE HEADLINE LINE, SAID FROM THE FIGURES: what the money is doing, in one sentence inside the page's headline
       tile with its name and tools. Since money-core 3.3.0 it is said on every record that keeps one set of money,
       and not only while the walk goes under: what there is and where, then, only while it is true, the day count
       the walk below goes under in. A clause whose figure has no value is left out by the writer (`leadOf`), so a
       record whose money lasts the year reads "Cash is £33,850 across 2 accounts" and stops there, and a record with
       no account yet reads no sentence at all. The figures are the tiles' own, so the line and the tiles cannot
       disagree. With two books or more one Cash now adds a company's money to a person's own, so this line goes
       with the tile it would sum, and the line after it is said in its place.

       HOW FAR CASH MOVED IN A MONTH IS ITS OWN CLAUSE, SINCE money-core 3.3.0 (`{{cash-now.change}}`, "+8% on a month
       ago"), said against the point the night remembered thirty days back. In words since the UI pass of 20 October
       (`{{cash-now.moved}}`, "6% down on a month ago"), where a minus sign led a clause of a sentence. A record with no point that old, or a
       point in another currency, has no change, and the clause drops with nothing left of it.

       WHEN IT RUNS OUT IS THE TILE'S, SINCE money-core 3.11.0: the side column says it in the figure's own size beside
       the walk, and a line saying it as well would be the same fact twice on one screen. */
    kind: 'note',
    lead: true,
    span: 12,
    when: ONE_BOOK,
    body: `${WHAT_THERE_IS}${LATE_PART}`,
  },
  {
    /* WITH TWO BOOKS OR MORE THE LINE SAYS WHERE THE MONEY IS KEPT, AND NO SUM, SINCE money-core 3.17.0. No block here
       was the page's lead on such a record, so the app said its own filler under the page's name: "One screen that
       gathers what you keep an eye on: figures, tables and notes." Two counts, the books and the accounts that count as
       cash, and never an amount: one figure over two books adds a company's money to a person's own, which is why the
       line above goes. What each book holds is the tile under it (`by-book.ts`).

       AND HOW MUCH, SINCE money-core 3.18.0 (the audit of 22 October, U4, his call taken as suggested): a line of two
       counts and no amount opened the page of a finance app, and the one total stood inside the chart. Cash now leads,
       as Cash ahead's own today already says it, with the books it is kept in after it; what each book holds is still
       the tile under it. Then the part that is late, as on one book. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { metric: 'books-held', gte: 2 },
    body: `You have {{cash-now}} across {{cash-accounts}} account(s) in {{books-held}} books.${LATE_PART}`,
  },
  /* NO "WHAT YOU HAVE" TILE BESIDE THE LINE, SINCE money-core 3.4.0. It said Cash now, the accounts and how long it
     lasts, which are the three figures the line above says, so a person read them twice before reading anything
     else. Cash ahead draws how the same cash moves, the whole width. */
];

/**
 * HOW LONG THE CASH LASTS WITH NOTHING COMING IN IS THE LASTS TILE'S, SINCE THE UI PASS OF 20 OCTOBER (money F3): every
 * line below ended on it, and the tile beside the chart said the day on what is due, two answers to one question a
 * screen apart. The tile now says both, each named by what it assumes, and no line repeats either (`money.test.ts`
 * holds that no tile beside the line says a figure the line says).
 *
 * THE LINE THAT SAYS THE MONEY LASTS THE YEAR, DECLARED AND NOT PLACED (money-lasts-line-76, REC-B07). Money is at
 * twenty-four blocks, the most a page declares (`BLOCK_CEILING` in `packages/kernel/src/declare.ts`), and this is a
 * third lead note where `HEADLINE` holds two: placed today, Money is refused at install. It comes in when a block is
 * given up for it: `MONEY_PAGE` then spreads this where it spreads `HEADLINE`.
 *
 * WHAT IT CHANGES. The line of what there is steps aside while the money lasts (`beyond: false`), or the cash would be
 * said twice; it still stands where nobody can count the days, with no account or over two currencies and no rate.
 *
 * EACH LINE ENDS ON HOW LONG THE CASH LASTS WITH NO INCOME, SINCE money-core 3.17.0 (`lasts-no-income`), as a clause of
 * its own after a comma, because the writer leaves out a whole clause when one of its holes reads nothing (`leadOf`):
 * past five years, or over two currencies with no rate, the clause goes and the rest of the line stands.
 */
export const HEADLINE_LASTS: Record<string, unknown>[] = [
  {
    /* WHAT THERE IS, AND NOTHING OF HOW LONG (the UI pass of 20 October, money F3): while the walk goes under, the Lasts
       tile beside the chart says both how long it lasts on what is due and with nothing coming in, so the line says
       the cash alone and no answer stands a screen away from a second one. */
    ...HEADLINE[0],
    when: { all: [ONE_BOOK, { metric: 'runway-days', beyond: false }] },
    body: `${WHAT_THERE_IS}${LATE_PART}`,
  },
  {
    /* THAT IT LASTS THE YEAR IS THE LINE'S, BECAUSE NO TILE SAYS IT. The tile of when it runs out is drawn only while
       the walk has a day it goes under on (`runway.ts`), so a record whose money lasts read nothing of how long. The
       same line, ending on the year, as Home says it (`usecases/founder.ts`). `runway-days` has no value on this
       record, and none either over two currencies with no rate or with no account, so the line is chosen by the
       reading carrying `beyond`, the walk having reached its last day above zero, and never by the figure being
       empty. "The year" and not "for good": the walk looks 365 days and knows no further. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { all: [ONE_BOOK, { metric: 'runway-days', beyond: true }] },
    body: `${WHAT_THERE_IS.slice(0, -1)}, and on what is due it lasts the year.${LATE_PART}`,
  },
  HEADLINE[1]!,
];
