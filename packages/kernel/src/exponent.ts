/**
 * A currency's minor units, apart from `ingest.ts`, so a screen that only draws an amount (`fx.ts`, `measures.ts`,
 * `row-parts.ts`) does not reach the arrival reader and what it imports. `ingest.ts` re-exports all three.
 */

/**
 * Currencies whose minor unit is not two decimal places. `ISO 4217`, and it is a table on purpose.
 *
 * IT WAS `Intl`, AND `Intl` IS NOT ISO 4217. CLDR carries a *formatting* convention — what a person
 * in that country expects to SEE — and ISO carries the minor unit, which is what a record stores.
 * They disagree on real currencies, and the disagreement was a hundred- or thousand-fold error on a
 * screen:
 *
 *   - `IQD`: ISO 3, `Intl` 0. So `IQD 1.250` was read by the grouping rule as one thousand two
 *     hundred and fifty dinars, stored as `1250`, and then divided by 10³ for display — printing
 *     `IQD 1.250` back. One and a quarter dinars on screen for a number the record holds as 1,250.
 *   - `CLF`: ISO 4, `Intl` 4, `braindog-render`'s table 2. A hundredfold, the other way.
 *   - `MGA`: ISO 2, `Intl` 0.
 *
 * AND `CLF` WAS IN THAT LIST AND NOT IN THE TABLE BELOW IT. The paragraph naming the hundredfold
 * error sat four lines above a table that did not have the row, so both copies fell to `?? 2` and
 * `money(1_000_000, 'CLF')` printed `CLF 10,000.00` for `CLF 100.0000`. `UYW` is the other
 * exponent-4 code and was missing from both as well — they are the only two in ISO 4217.
 *
 * The drift test named `CLF` explicitly and passed, because it compared the two tables to each other
 * and they were wrong in the same way. It compares the UNION of their keys against ISO now: agreement
 * between two copies is not correctness, and a check that enumerates one side's keys cannot see a
 * code the other side has.
 *
 * AND THIS TABLE IS `braindog-render`'s, BYTE FOR BYTE. The two cannot be one module: `render` is the
 * published block dialect and depends on no `@braindog/*` package, and the kernel must not depend on
 * a published renderer. So they are two copies with a test that compares them — which is the same
 * shape `event-kinds` uses for the one other list that has to say the same thing in two places.
 *
 * A CODE THE TABLE DOES NOT NAME IS TWO, which is what most currencies are and what every unknown
 * one is read as. An extractor that dies on an unusual code is worse than one that reads it as most
 * are read.
 */
export const EXPONENT: Readonly<Record<string, number>> = {
  CLF: 4, UYW: 4,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

export const exponentOf = (currency: string): number => EXPONENT[currency.toUpperCase()] ?? 2;

/**
 * An amount in minor units as a person reads it, `GBP 1,299.00`, `JPY 129,900`, `KWD 1.500`: code
 * first, the currency's own decimals, and the minus `braindog-render`'s `money` draws. For text that
 * leaves the record without passing through the renderer, a digest's email and its note.
 */
export function moneyText(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  const body = (Math.abs(minor) / 10 ** exp).toLocaleString('en-u-nu-latn', { minimumFractionDigits: exp, maximumFractionDigits: exp });
  return `${currency.toUpperCase()} ${minor < 0 ? '−' : ''}${body}`;
}
