/** Money's first line: where the money is kept, and what is late, in one sentence. */

const ONE_BOOK = { metric: 'books-held', lt: 2 };
/**
 * THE ACCOUNTS THE MONEY IS SPREAD OVER, SINCE money-core 3.30.0: the accounts Cash now cuts into that hold money
 * (`cash-by-account.groups`), the ones the Accounts tile lists. It said how many books were held too, which a person
 * does not open Money to read, and a model handed that count wrote "2 books are held". Cash now itself is the hero's,
 * drawn under the line, so the line does not say it again.
 */
/* IN BOOKS, SINCE money-core 3.34.0 (next-money, M2): "Spread over 2 accounts" counted books (Maya keeps 3 accounts in
   2 books), and the line is only said with two books or more, so it names the books it counts. */
const ACCOUNTS_SAID = 'Kept in {{books-held}} books.';
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
const LATE_PART = '{{installments-late.first}} is {{bad:late}}: [{{installments-late.first_amount}}](/r/installments?f=state:is:open&f=direction:is:out&f=due:before:today), due {{ago:installments-late.first_due}}.';

/**
 * NO "TO PAY ON THE CARD" CLAUSE, SINCE money-core 3.38.4 (moneyseed, 3 Nov): from 3.20.0 the line ended "£1,240 to pay on
 * the card, as of 1 Sep.", a third figure in a sentence, while the Accounts tile under the hero lists the card with the
 * same amount. The line is only what is late or the low point now, so it stays short.
 */

/**
 * MONEY LEADS WITH WHAT HURTS MOST, SINCE money-core 3.33.0 (audit of 31 October f, AF4): the line opened on "£1,240 to
 * pay on the card" while the same page said bills £10,540 late and cash going to −£16,213 on 7 Nov. Now it opens on
 * the bills that are late, with a part of a plan that is late named first, and when nothing is late on the low point,
 * while the walk goes under inside the twelve weeks the hero draws (`runway-days` at 84 days or fewer, so the low is
 * below nought). The card comes after, as the second thing. The first sentence whose `when:` holds is said (`says:`).
 */
/**
 * THE LATE PART IS THE WAY IN, SINCE money-core 3.33.0 (polish-i, PI1): Heads up said "Bills late: £10,540 to pay. See
 * them" under a first line that already said it. The figure late is the link now, to the bills or the plan's part that
 * are late, and Heads up says it no more.
 */
const BILLS_SEEN = '/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today';
const BILLS_LATE = `Bills {{bad:late}}: [{{overdue}}](${BILLS_SEEN}) to pay.`;
const LOW_POINT = 'Cash falls to {{runway-days.low}} by {{runway-days.low_on}}.';
const PART_LATE = { metric: 'installments-late', gt: 0 };
const BILL_LATE = { metric: 'overdue', gt: 0 };
/**
 * AND WHAT IS LATE COMING IN, SINCE money-core 3.34.0 (next-money, M1): the line said "$149 to pay on the card" while a
 * $3,200 invoice was 4 days late, said only in Heads up at the foot of the page, 3,400px down on a phone. What is late
 * is said both ways now, money out first, and the figure is the link to the invoices, as the bills' is.
 */
const INVOICES_SEEN = '/r/obligations?f=direction:is:owed_to_me&f=state:in:open,part&f=due:before:today';
const INVOICES_LATE = `Invoices {{bad:late}}: [{{late-in}}](${INVOICES_SEEN}) to come in.`;
const INVOICE_LATE = { metric: 'late-in', gt: 0 };
const GOES_UNDER = { all: [{ metric: 'cash-now', gt: 0 }, { metric: 'runway-days', lte: 84 }] };
/** Something is due or repeats, so the walk has something to last the year against (`due.ts` `bills-open`). */
const SOME_DUE = { any: [{ metric: 'bills-open', gt: 0 }, { metric: 'repeating-held', gt: 0 }] };
const NOTHING_DUE = [{ metric: 'bills-open', lt: 1 }, { metric: 'repeating-held', lt: 1 }];

/**
 * Something is late either way, a part of a plan is, or the walk goes under inside the twelve weeks: what the line is
 * said for. The walk's half is `GOES_UNDER` without its Cash now leaf, since a `when` is two levels deep at most; a
 * record already under nought is told its low point too.
 */
const LATE_OR_UNDER = { any: [BILL_LATE, INVOICE_LATE, PART_LATE, { metric: 'runway-days', lte: 84 }] };

/**
 * The line's sentences, worst first, each with `between` (what the line says of the books or the year) after it. WITH
 * NOTHING FOR `between` TO SAY THE LOW POINT IS THE LAST SENTENCE, with no `when` of its own (`noteSaysFault`), and the
 * block is drawn only while `LATE_OR_UNDER` holds, so a record with nothing late and no low point reads no line.
 */
const says = (between: string): Record<string, unknown>[] => {
  const lines: Record<string, unknown>[] = [
    /* SIX SENTENCES AT MOST (`SAYS_MOST`), so the part of a plan rides in each sentence about what is late: on a record
       with no part late its figures do not read and its sentence goes whole (`leadOf`), as it always has. What is late
       going out comes first, then what is late coming in. */
    { when: { all: [BILL_LATE, INVOICE_LATE] }, body: `${LATE_PART} ${BILLS_LATE} ${INVOICES_LATE}${between}` },
    { when: BILL_LATE, body: `${LATE_PART} ${BILLS_LATE}${between}` },
    { when: INVOICE_LATE, body: `${LATE_PART} ${INVOICES_LATE}${between}` },
    { when: PART_LATE, body: `${LATE_PART}${between}` },
  ];
  if (between.trim() === '') return [...lines, { body: LOW_POINT }];
  return [...lines, { when: GOES_UNDER, body: `${LOW_POINT}${between}` }, { body: between.trim() }];
};

export const HEADLINE: Record<string, unknown>[] = [
  {
    /* THE PAGE'S LINE: what is late, or the low point. A clause whose figure has no
       value is left out by the writer (`leadOf`), so a record with no account yet reads no sentence at all. How much
       there is, how it moved in a month and when it runs out are the hero's (`hero.ts`), drawn under the line. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { all: [ONE_BOOK, LATE_OR_UNDER] },
    says: says(''),
  },
  {
    /* WITH TWO BOOKS OR MORE THE LINE SAYS HOW MANY BOOKS THE MONEY IS KEPT IN (money-core 3.30.0, in books since
       3.34.0), so a person reads that the hero's Cash now holds every book, after what is late. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { metric: 'books-held', gte: 2 },
    says: says(` ${ACCOUNTS_SAID}`),
  },
];

/**
 * THE LINE MONEY OPENS ON, SPLIT BY WHETHER THE MONEY LASTS THE YEAR. While the walk goes under inside the year,
 * the hero says the day and how long it lasts with nothing coming in, so the line says what is late and the card. While
 * it does not, the hero draws no day, and the line says, after what is late, that on what is due the money lasts the
 * year.
 */
export const HEADLINE_LASTS: Record<string, unknown>[] = [
  {
    ...HEADLINE[0],
    when: { all: [ONE_BOOK, { metric: 'runway-days', beyond: false }, LATE_OR_UNDER] },
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
    /* ONLY WHILE SOMETHING IS DUE OR REPEATS (audit 31 Oct h, AH15): with nothing at all, "lasts the year on what is
       due" was said of nothing, and the next block asks for the first bill instead. */
    when: { all: [ONE_BOOK, { metric: 'runway-days', beyond: true }, SOME_DUE] },
    says: says(' Lasts the year on what is due.'),
  },
  {
    /* NOTHING DUE AND NOTHING REPEATING: the hero says the balance under it, and the line asks for a bill. */
    kind: 'note',
    lead: true,
    span: 12,
    when: { all: [ONE_BOOK, { metric: 'runway-days', beyond: true }, ...NOTHING_DUE] },
    says: says(' Add a bill to see how long it lasts.'),
  },
  HEADLINE[1]!,
];
