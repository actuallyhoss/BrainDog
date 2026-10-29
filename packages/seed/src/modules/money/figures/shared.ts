/**
 * What more than one of Money's figures reads: the format every money figure is in, and the day that stands for never.
 * Cut out of `money.ts` with no change.
 */

/**
 * THE FORMAT OF EVERY MONEY FIGURE, AND IT NAMES NO CURRENCY, SINCE money-core 3.0.0.
 *
 * Every figure here said `money.GBP`, read off the sample's rows, because until then the record refused a money figure
 * whose format named no currency. So a record in Egyptian pounds read "no more than £50,000.00" under figures about its
 * own money, and a record in one other currency and no home currency chosen read its cash one currency at a time. A
 * `money` figure is added up in the record's home currency when one is set, else in the one currency its rows are in,
 * else one amount per currency (`evaluateMetric`), which is the currency somebody chose and never the pack author's.
 */
export const MONEY = 'money';

/**
 * WHAT IS LEFT TO FILE, ONE SENTENCE FOR EVERY COUNT AND LIST OF IT (Q2 of 29 October): the Ledger said "82 lines to
 * file" over a "Not filed yet" list of 88, because the count read cleared lines of the last 91 days and the list every
 * line not void. A line still pending can be filed as well as a cleared one, and an old one is as unfiled as a new one.
 */
export const UNFILED = 'state is not void, transfer is false, category is empty, parts is empty';

/** The first of 2100 as whole days since 1970: a day no walk of a year reaches, which `runs-out-on` is held to. */
export const RUNS_OUT_NEVER = Date.UTC(2100, 0, 1) / 86_400_000;
