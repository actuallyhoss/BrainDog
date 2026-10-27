/** Money's first line: where the money is kept, and what is late, in one sentence. */

const ONE_BOOK = { metric: 'books-held', lt: 2 };
/**
 * THE ACCOUNTS THE MONEY IS IN, SINCE money-core 3.27.0: the accounts Cash now cuts into that hold money
 * (`cash-by-account.groups`), the ones the Accounts tile lists. The count of every cash account said seven beside a
 * tile of six, which leaves one at nought out of its legend.
 */
const ACCOUNTS_SAID = '{{cash-by-account.groups}} account(s)';
/**
 * WHERE THE MONEY IS KEPT, AND NOT HOW MUCH, SINCE money-core 3.29.0. How much is the hero's (`hero.ts`): Cash now in the
 * figure's own size, each currency in its own amount under it and its change on a month ago, which this line said
 * until the hero stood under it. A line saying the same money over a tile saying it bigger was one fact twice.
 */
const WHAT_THERE_IS = `Kept in ${ACCOUNTS_SAID}.`;

/**
 * AND A PART THAT IS LATE, SINCE money-core 3.18.0 (the audit of 22 October, U4: "Money's first line says how much he
 * has and that the part is late"): the part late longest by its name, what it is and how long since its day, as a
 * sentence of its own after the money. Its figures are `installments-late`'s first row, so on a record with nothing
 * late the sentence has no figure that reads and goes whole (`leadOf`), and the line is what it was.
 */
const LATE_PART = ' {{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}.';

/**
 * AND WHAT IS TO PAY ON THE CARD, SINCE money-core 3.20.0 (B8 of 24 October): a card is not cash, so it is on no tile, and the
 * page is at its ceiling of blocks, so the sentence is the line's. No card that says it, and the sentence goes whole.
 */
const CARD_OWES = ' On the card: {{card-to-pay}} to pay, as of {{card-to-pay-on}}.';

export const HEADLINE: Record<string, unknown>[] = [
  {
    /* THE PAGE'S LINE: where the money is kept, then, only while it is true, the part that is late and what is to pay
       on the card. A clause whose figure has no value is left out by the writer (`leadOf`), so a record with no account
       yet reads no sentence at all. How much there is, how it moved in a month and when it runs out are the hero's
       (`hero.ts`), drawn under the line, so no figure is said twice on one screen. */
    kind: 'note',
    lead: true,
    span: 12,
    when: ONE_BOOK,
    body: `${WHAT_THERE_IS}${LATE_PART}${CARD_OWES}`,
  },
  {
    /* WITH TWO BOOKS OR MORE THE LINE SAYS HOW MANY, SINCE money-core 3.17.0, so a person reads that the hero's Cash
       now holds both before reading it. What each book holds is on the Accounts page. Then the part that is late, as
       on one book. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { metric: 'books-held', gte: 2 },
    body: `Kept in ${ACCOUNTS_SAID} in {{books-held}} books.${LATE_PART}${CARD_OWES}`,
  },
];

/**
 * THE LINE MONEY OPENS ON, SPLIT BY WHETHER THE MONEY LASTS THE YEAR (REC-B07). While the walk goes under inside the year,
 * the hero says the day and how long it lasts with nothing coming in, so the line says where the money is kept and no
 * more. While it does not, the hero draws no day, and the line says that on what is due the money lasts the year.
 */
export const HEADLINE_LASTS: Record<string, unknown>[] = [
  {
    ...HEADLINE[0],
    when: { all: [ONE_BOOK, { metric: 'runway-days', beyond: false }] },
    body: `${WHAT_THERE_IS}${LATE_PART}${CARD_OWES}`,
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
    body: `${WHAT_THERE_IS.slice(0, -1)}, and on what is due it lasts the year.${LATE_PART}${CARD_OWES}`,
  },
  HEADLINE[1]!,
];
