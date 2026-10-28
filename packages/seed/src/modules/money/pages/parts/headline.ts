/** Money's first line: where the money is kept, and what is late, in one sentence. */

const ONE_BOOK = { metric: 'books-held', lt: 2 };
/**
 * THE ACCOUNTS THE MONEY IS SPREAD OVER, SINCE money-core 3.30.0: the accounts Cash now cuts into that hold money
 * (`cash-by-account.groups`), the ones the Accounts tile lists. It said how many books were held too, which a person
 * does not open Money to read, and a model handed that count wrote "2 books are held". Cash now itself is the hero's,
 * drawn under the line, so the line does not say it again.
 */
const ACCOUNTS_SAID = 'Spread over {{cash-by-account.groups}} account(s).';
/**
 * NO LINE OF WHERE THE MONEY IS KEPT, SINCE money-core 3.29.1: "Kept in 2 accounts" said a count the Accounts tile draws
 * a row for, in the page's biggest type. The line is only what needs doing: the part that is late and the card to pay.
 */

/**
 * AND A PART THAT IS LATE, SINCE money-core 3.18.0 ("Money's first line says how much he
 * has and that the part is late"): the part late longest by its name, what it is and how long since its day, as a
 * sentence of its own after the money. Its figures are `installments-late`'s first row, so on a record with nothing
 * late the sentence has no figure that reads and goes whole (`leadOf`), and the line is what it was.
 */
const LATE_PART = '{{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}.';

/**
 * AND WHAT IS TO PAY ON THE CARD, SINCE money-core 3.20.0 (B8 of 24 October): a card is not cash, so it is on no tile, and the
 * page is at its ceiling of blocks, so the sentence is the line's. No card that says it, and the sentence goes whole.
 */
const CARD_OWES = ' {{card-to-pay}} to pay on the card, as of {{card-to-pay-on}}.';

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
    body: `${LATE_PART}${CARD_OWES}`,
  },
  {
    /* WITH TWO BOOKS OR MORE THE LINE SAYS HOW MANY ACCOUNTS THE MONEY IS SPREAD OVER, SINCE money-core 3.30.0, so a
       person reads that the hero's Cash now holds every book. What each book holds is on the Accounts page. Then the
       part that is late, as on one book. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { metric: 'books-held', gte: 2 },
    body: `${ACCOUNTS_SAID} ${LATE_PART}${CARD_OWES}`,
  },
];

/**
 * THE LINE MONEY OPENS ON, SPLIT BY WHETHER THE MONEY LASTS THE YEAR. While the walk goes under inside the year,
 * the hero says the day and how long it lasts with nothing coming in, so the line says where the money is kept and no
 * more. While it does not, the hero draws no day, and the line says that on what is due the money lasts the year.
 */
export const HEADLINE_LASTS: Record<string, unknown>[] = [
  {
    ...HEADLINE[0],
    when: { all: [ONE_BOOK, { metric: 'runway-days', beyond: false }] },
    body: `${LATE_PART}${CARD_OWES}`,
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
    body: `Lasts the year on what is due. ${LATE_PART}${CARD_OWES}`,
  },
  HEADLINE[1]!,
];
