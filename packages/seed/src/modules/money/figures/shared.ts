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

/** The first of 2100 as whole days since 1970: a day no walk of a year reaches, which `runs-out-on` is held to. */
export const RUNS_OUT_NEVER = Date.UTC(2100, 0, 1) / 86_400_000;
