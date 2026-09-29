/**
 * Adding up money, and refusing to when it would be wrong.
 *
 * TWO CURRENCIES ARE NEVER ADDED. That is the one rule this file exists for, and the reason it needs
 * a file is that the wrong version of it is invisible: a sum of eight sterling invoices and one euro
 * one is a number, it is the right shape, it renders in a tile with a currency code beside it, and
 * nothing about it looks wrong. There is no screen on which somebody notices.
 *
 * SO A MIXED TOTAL IS NOT A NUMBER. It comes back with the currencies it saw and no amount, and the
 * caller shows the refusal instead of the figure — the same posture as everything else here: a
 * question the record cannot answer honestly is answered with a sentence, not with a plausible
 * value. A rate table would be the alternative, and a rate has a date; a total that silently applied
 * yesterday's is a worse lie than a dash.
 *
 * The other half of the rule — divide by 100 only at the point of display — lives in
 * `braindog-render`'s `money()`, which reads the exponent from the runtime's own currency data
 * rather than assuming two (JPY is 0, KWD is 3).
 */

import { isMoney, type MoneyValue } from './schema.ts';
import { homeCurrency } from './api.ts';

export type { MoneyValue };

/** The number inside a value, whether it is money or a plain figure. `null` when there is none. */
export function amountOf(value: unknown): number | null {
  if (isMoney(value)) return value.amount;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The currency a value carries, or `null` when it is not money. */
export const currencyOf = (value: unknown): string | null => (isMoney(value) ? value.currency : null);

/**
 * The mark in a mixed set for "and some of these rows carried no currency at all".
 *
 * IT IS THE RECORD'S WORD, AND IT USED TO BE THIS FILE'S OWN. The kernel writes the same mark into
 * the same refusal, and that is the copy a paying customer reads; the sample said `no currency` and
 * the two therefore described the same two rows in different words, one on the screen the product
 * demonstrates itself on and one on the screen somebody works from. The equality assertion written
 * to stop exactly that held only the two web modules to each other, so it passed the whole time.
 * `money.test.ts` now opens a real record, drives the refusal, and compares this file's sentence
 * with the one that came back.
 *
 * AND IT IS A UNIT RATHER THAN A CURRENCY BECAUSE THE SET IT JOINS IS UNITS. `GBP and no unit` is
 * a list of two units, one of which is money; `GBP and no currency` is a list with a hole in it.
 *
 * SPELLED HERE AND NOT IMPORTED, because `metrics.ts` imports this module and a constant cannot
 * travel back up that edge without an import cycle.
 *
 * AND THE WEB'S SECOND COPY IS ALREADY GONE, which this paragraph went on describing as future work
 * for two commits after it happened. `metrics.ts` deleted its own literal and re-exports this one, so
 * the `BARE === METRICS_BARE` assertion in `money.test.ts` now holds a re-export against its source
 * and is worth keeping only as a tripwire on that arrangement. What is left is the kernel's
 * `BARE_UNIT`, which is module-private at `packages/kernel/src/metrics.ts` and reachable from no
 * importer. `bare-unit.test.ts` holds that last gap by matching the kernel's declaration line in its
 * source, which is a whole line with nothing around it to miss, and `money.test.ts` drives the
 * clause the mark sits inside out of a running record, because a regex over the kernel saw the mark
 * and not the clause and the two diverged on the clause with the assertions still green.
 */
export const BARE = 'no unit';

/**
 * A CURRENCY IS THREE UPPER-CASE LETTERS, which is ISO 4217, and it is the same test the kernel's
 * `mixedUnits` applies to the same sets. `BARE` fails it, which is the point: so does any string a
 * sample row put in a `currency` key that a real record would have refused at the write.
 */
const isCurrencyCode = (unit: string): boolean => /^[A-Z]{3}$/u.test(unit);

/**
 * A total, and what it is a total of.
 *
 * `mixed` non-empty is the refusal: the values were in more than one currency, so `amount` is not a
 * figure anybody should see. It holds the codes it saw and, when some of the rows carried no
 * currency at all, `BARE` beside them, so the sentence names every kind of row that has to change.
 * `currency` is `null` for a total of plain numbers, which is the ordinary case for a count of days
 * or a sum of hours.
 */
export type Total = { amount: number; currency: string | null; mixed: readonly string[]; n: number };

export function total(values: Iterable<unknown>): Total {
  let amount = 0;
  let currency: string | null = null;
  let n = 0;
  let bare = false;
  const seen = new Set<string>();

  /* ONE PASS, because `values` may be a generator: a second walk of one of those adds nothing. */
  for (const value of values) {
    const a = amountOf(value);
    if (a === null) continue;
    const c = currencyOf(value);
    if (c === null) bare = true;
    else {
      seen.add(c);
      currency ??= c;
    }
    amount += a;
    n++;
  }

  /* MONEY AND BARE NUMBERS TOGETHER IS MIXED TOO. It means a field changed type under a record, or a
     caller summed two different fields — and quietly reading the bare ones as the currency of the
     others is the same failure wearing a different hat.

     AND THE BARE ROWS GO INTO THE SET, which they did not: this refused over them and then left them
     out of the sentence, so a column of one sterling row and one plain number printed "these rows
     are in GBP, and two currencies are never added" — one currency named, two claimed, and no word
     for the rows somebody has to go and fix. `metrics.ts` marks its own, and the kernel writes
     `no unit` into the same sentence; this was the summing site that did not. */
  const mixed = seen.size > 1 || (bare && seen.size > 0) ? [...seen, ...(bare ? [BARE] : [])].sort() : [];
  /* A MIXED TOTAL IS IN NO CURRENCY. Returning the first one seen would hand a caller that only
     checks `currency` a code to print beside a figure that is a sum of two — which is the exact
     failure, arrived at through the guard against it. */
  return { amount, currency: mixed.length ? null : currency, mixed, n };
}

/**
 * The sentence a mixed total shows instead of a figure.
 *
 * TWO OF THESE ARE NOT ALWAYS TWO CURRENCIES, and the trailing clause said they were. A set of one
 * sterling row and one plain number holds two entries, one of which is not a currency at all, and
 * the sentence still ended *"and two currencies are never added"*: one currency named, two claimed,
 * and a reason given for a failure that did not happen. It sends whoever reads it looking for a
 * second currency there is no trace of, which is the opposite of what a refusal is for.
 *
 * THE WHOLE SENTENCE IS THE KERNEL'S AND THIS IS A MIRROR OF ONE FUNCTION. `mixedUnits`, in the
 * kernel's `metrics.ts`, decides both halves of it: which units to name, in what order, and whether
 * two of them are two *currencies* or two *units*. Grep for that name rather than for a line number.
 * The pointer this paragraph replaces cited `metrics.ts:1072` and `:1077`, and those sentences were
 * at `:1089` and `:1094` on the day it was written: it was wrong before it was committed, and it was
 * the only mechanism the comment offered against the copies drifting.
 *
 * SO THE BROWSER HOLDS A MIRROR AND THE DIFFERENTIAL IS WHAT KEEPS THE TWO EQUAL, said plainly here
 * because the commit that wrote the paragraph above closed its message with *"the browser reads the
 * kernel's sentence rather than a second copy of the rule"* and what it shipped was this copy plus
 * that differential. The differential is real and was driven in both directions by an audit; the
 * sentence about single-sourcing was not true on the day it was written. A file that says one thing
 * and does another is worse than either, so this says what the file does.
 *
 * AND IT IS NOT WEIGHT THAT KEEPS THE MIRROR HERE, WHICH WAS MEASURED RATHER THAN ASSUMED. The
 * standing defence for a copy in a browser module is that importing a record engine would drag it into
 * a chunk every screen waits for. It would not, because it is already in that chunk: `./schema.ts`
 * re-exports `REDUCES` from `@braindog/kernel`, so the barrel is in this module's graph whatever this
 * file does. Bundled through the app's own rollup, an entry taking `amountOf`, `currencyOf`, `drawn`,
 * `symbolText` and `mixedFix` from here comes to 44,797 bytes minified and 14,293 gzipped, of which
 * about 45 KB is the kernel's migration SQL, carried in by that re-export. Adding a named
 * import from `@braindog/kernel` on top of that costs 81 bytes minified and 29 gzipped. The
 * measurement is worth having either way: the 45 KB is a real finding about this chunk and it belongs
 * to whoever owns `schema.ts`, not to this function.
 *
 * WHAT KEEPS IT HERE IS ONE MISSING KEYWORD IN A FILE THIS CHANGE DID NOT OWN. `mixedUnits` is
 * declared `function mixedUnits` with no `export`, so `packages/kernel/src/index.ts` cannot name it in
 * the list it already re-exports from `./metrics.ts` and no importer can reach it. Making the browser
 * read the kernel's sentence is that keyword plus one name in that list plus an import here. Nothing
 * has to be said about the kernel's `money` argument, which already defaults to `true`, and this
 * mirror declares no `quantity` type that would ever want `false`.
 *
 * AND THE MARK HAS TO GO BACK TO `null` ON THE WAY IN, which is the one part of that import a reader
 * would get wrong, and it was run through the kernel's own code rather than reasoned about. The kernel
 * takes the units as the RECORD holds them, so a unitless row arrives as `null` and `mixedUnits` writes
 * `BARE_UNIT` in itself; the set this mirror hands around already carries the word. Handed
 * `['EUR', 'no unit', 'pounds']`, the kernel's filter drops nothing, counts three named units and
 * answers *"EUR and no unit and pounds"*, which is the exact ORDER divergence the paragraph below is
 * about, reintroduced through the function that was supposed to end it. The call is
 * `mixedUnits(mixed.map((u) => (u === BARE ? null : u)))`, and `money.test.ts` goes red on the naive
 * one rather than letting it through. Until the keyword lands, the copy below is the arrangement and
 * the test is the guard.
 *
 * THE RULE, SPELLED OUT BECAUSE IT HAS TO BE THE SAME RULE AND NOT THE SAME OUTPUT BY LUCK: named
 * units first and the unitless mark last, and *currencies* only when every entry in the set reads as
 * an ISO 4217 code. This tested `mixed.includes(BARE)` instead, which agrees with the record on
 * every set a coerced write can produce and disagrees the moment one does not. `{ amount: 100,
 * currency: 'pounds' }` is money to `isMoney`, which checks only that the code is a string, and over
 * that row the old clause said *currencies* where the record says *units*. The ORDER diverged on the
 * same set: `total()` hands the set over sorted, and `no unit` sorts before `pounds`, so this printed
 * *"in no unit and pounds"* where the record prints *"in pounds and no unit"*.
 *
 * THE CODE IS NOT PART OF THE SENTENCE. The kernel splits `MIXED_CURRENCY` from
 * `QUANTITY_MIXED_UNIT` on the field's DECLARED type, for the reason its own comment gives, *"a
 * sentence about money attached to a figure about metres"*; this mirror declares no `quantity` type,
 * so only the first is reachable from here and nothing about the split has to be copied.
 *
 * `money.test.ts` opens a real record, puts these rows in a money column, and holds this function's
 * output against the refusal that comes back, so a rewording there fails here rather than drifting.
 *
 * AND HALF THE BRANCHES CANNOT BE ASKED OF A LIVE RECORD, which was driven rather than reasoned out
 * and changes what the differential can be. The kernel's money aggregation reaches this sentence only
 * when at least one row carries no unit at all: `count` and `distinct` return before the group-by, the
 * remaining four aggregations are all in `REDUCIBLE`, and `evaluateMetric` always builds an `Across`, so
 * every set whose units are all non-null goes to `fx.ts` and comes back in parts instead. Driven over
 * a two-row money column with no home currency and no rate table at all, `GBP` beside `EUR` answered
 * `parts: [EUR, GBP]` with `missing: []` and no refusal, and so did `pounds` beside `euros`, `GBP`
 * beside `gbp`, `GBP` beside `GBPX`, and `GBP` beside a row whose currency was the empty string. Add
 * one unitless row to any of those and it refuses. So a null in the set is a precondition of the
 * sentence, `units.every(isCurrencyUnit)` is therefore always false where the record says it, and the
 * *currencies* half of this mirror has no counterpart in the record's money arm to be held against.
 * It is live here regardless: `blocks.ts` prints it over a total of a money column, which can be two
 * codes and no bare row. The test pins that half against the wording alone and says which cases those are.
 */
export const mixedFix = (mixed: readonly string[]): string => {
  const named = mixed.filter((u) => u !== BARE && u !== '');
  const said = [...named, ...(named.length < mixed.length ? [BARE] : [])].join(' and ');
  return `these rows are in ${said}, and two ${mixed.every(isCurrencyCode) ? 'currencies' : 'units'} are never added`;
};

/** A money value built from an amount and the currency of the rows it came from. */
export const asMoney = (amount: number, currency: string | null): MoneyValue | number =>
  currency === null ? amount : { amount, currency };

/**
 * Two totals as one, for the "everything else" bucket a chart carries.
 *
 * The remainder is where a mixed currency hides best: eleven sterling counterparties and one euro
 * one, and the euro one is exactly the row that fell off the bottom of the chart.
 */
export function merge(totals: readonly Total[]): Total {
  const seen = new Set<string>();
  let bare = false;
  let amount = 0;
  let n = 0;
  for (const t of totals) {
    amount += t.amount;
    n += t.n;
    /* THE MARKER IS NOT A CURRENCY, so it never joins the codes: `seen` is what a caller may print
       beside a figure, and one code plus the marker would make a two-currency refusal out of a
       total that is in one. */
    for (const c of t.mixed) {
      if (c === BARE) bare = true;
      else seen.add(c);
    }
    if (t.currency) seen.add(t.currency);
    /* A PART WITH NO CODE IS BARE ONLY WHEN IT IS NOT ALREADY MIXED. A mixed part reports
       `currency: null` exactly as a bare one does, so reading the marker off that alone invented
       rows with no currency for a remainder that was two currencies and nothing else. */
    else if (t.n > 0 && t.mixed.length === 0) bare = true;
  }
  const mixed = seen.size > 1 || (bare && seen.size > 0) ? [...seen, ...(bare ? [BARE] : [])].sort() : [];
  return { amount, currency: mixed.length ? null : ([...seen][0] ?? null), mixed, n };
}

/* ── drawing an amount ──────────────────────────────────────────────────── */

/** How English writes a currency in one of its two displays, or `undefined`; it throws on a code the runtime refuses. */
const written = (currency: string, currencyDisplay: 'symbol' | 'narrowSymbol'): string | undefined =>
  new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay }).formatToParts(0).find((p) => p.type === 'currency')?.value;

/**
 * The symbol a currency is written with, or `null` when it has none of its own and is written by its code.
 *
 * A DRAWING DECISION. `money()` in `braindog-render` still writes `GBP 28,320.00`, code first, and
 * everything that reads figures back out of text reads that. What changes is only the glyphs a
 * screen sets: the record's home currency is written the way a person writes it, `£28,320.00`, and
 * any other currency keeps its code beside the symbol so two currencies never look alike.
 *
 * A CURRENCY ENGLISH WRITES BY ITS CODE HAS NO SYMBOL HERE, even where the runtime knows a narrow one. The narrow
 * display alone gave `E£` for EGP, where English writes `EGP`, as it writes `CHF` and `KWD`, and the contract for
 * money on a screen says a currency with no symbol keeps its code first. A
 * currency that does have one is drawn with its narrow form, `$` rather than `CA$`, because the code after every
 * figure that is not in the home currency already says which dollar it is.
 */
export function symbolOf(currency: string): string | null {
  try {
    if (written(currency, 'symbol')?.toUpperCase() === currency.toUpperCase()) return null;
    const narrow = written(currency, 'narrowSymbol');
    return narrow && narrow.toUpperCase() !== currency.toUpperCase() ? narrow : null;
  } catch {
    return null;
  }
}

/**
 * An amount in parts: the whole and the fraction apart, so a figure can set its pence quieter, and
 * `iso` present only when the currency has a symbol and is not the home one.
 *
 * A CURRENCY WITH NO SYMBOL KEEPS ITS CODE IN FRONT, as part of `lead` (`EGP 58,185.54`), home or not: the code is
 * the only mark it has, so it belongs to the figure, and a second code after it would say the currency twice.
 *
 * `text` is the output of `money()`. Anything that is not a figure `money()` wrote comes back `null`.
 */
export type Drawn = { lead: string; whole: string; fraction: string; iso: string | null };

const WRITTEN = /^([A-Z]{3}) (−?)([\d,]+)(\.\d+)?$/u;

export function drawn(text: string, home: string | null): Drawn | null {
  const m = WRITTEN.exec(text);
  if (!m) return null;
  const [, currency, minus, whole, fraction] = m as unknown as [string, string, string, string, string | undefined];
  const symbol = symbolOf(currency);
  return {
    lead: symbol === null ? `${currency} ${minus}` : `${minus}${symbol}`,
    whole,
    fraction: fraction ?? '',
    iso: symbol !== null && currency !== home ? currency : null,
  };
}

/**
 * A sentence with every figure `money()` wrote in it redrawn the same way, as plain text.
 *
 * `headline` IS A FIGURE STANDING ON ITS OWN, a tile's, where a fraction of all zeros is dropped: "£33,850" and
 * "EGP 58,185", because ".00" under a headline is width a phone does not have and says nothing a round figure does not
 * A fraction that is not all zeros is part of the figure and stays.
 */
export function symbolText(text: string, home: string | null, headline = false): string {
  return text.replace(/\b[A-Z]{3} −?[\d,]+(?:\.\d+)?/gu, (hit) => {
    const d = drawn(hit, home);
    if (!d) return hit;
    const fraction = headline && /^\.0+$/u.test(d.fraction) ? '' : d.fraction;
    /* THE CODE STAYS WITH ITS AMOUNT, so a line of amounts in several currencies breaks between them and never inside one. */
    return `${d.lead}${d.whole}${fraction}${d.iso ? ` ${d.iso}` : ''}`;
  });
}

/* ── money in a sentence the record stored ─────────────────────────────── */

/** An amount as a sentence may hold one: a code, a minus of either kind, the whole grouped or not, and any fraction. */
const STORED = /\b([A-Z]{3}) ([−-]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/gu;

/**
 * The runtime's tender list, which is the list the record refuses a money value against (`currencies.ts` says why it is
 * asked of `Intl` and never kept here).
 */
const TENDER: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/** The digits of a whole, grouped in threes: `2400` and `2,400` are both `2,400`. */
const grouped = (whole: string): string => whole.replace(/,/gu, '').replace(/\B(?=(?:\d{3})+$)/gu, ',');

/**
 * A sentence the record stored, with every amount in it drawn as a screen draws one: `£2,400.00` in the record's own
 * currency, `$4,800.00 USD` in any other, `−£39.00` for money out, and `EGP 58,185.54` for a currency written by its
 * code.
 *
 * AT THE READER, NOT IN THE ROUTE. Home's feed, History, Decide's titles and options and a notification all print words
 * somebody else wrote, so the module that reads them (`news-live.ts`, `governance.ts`, the audit reader) hands them on
 * through here, and no screen formats money of its own.
 *
 * A SENTENCE STORED BEFORE THE KERNEL GROUPED ITS FIGURES READS THE SAME. A rule filled `GBP 2400.00` and `GBP -39.00`
 * until `moneyWords` became the kernel's `moneyText`, and a record keeps every sentence it wrote; so the digits are
 * grouped again and a hyphen in front of them is read as the minus it was, and `symbolText` then draws the figure. Only
 * a code the runtime lists as tender is touched: `ISO 4217` in a sentence is the name of a standard, not four thousand
 * of anything.
 *
 * `home` IS `homeCurrency()` unless a caller holds another, as `Money`'s prop of the same name is. That default is why
 * this module imports `api.ts`, which imports it back: neither reads the other at load, only inside a call, so the cycle
 * leaves no binding unset when it is read.
 */
export function moneyInText(text: string, home: string | null = homeCurrency()): string {
  const spoken = text.replace(STORED, (hit, currency: string, minus: string, whole: string, fraction: string | undefined) =>
    TENDER.has(currency) ? `${currency} ${minus ? '−' : ''}${grouped(whole)}${fraction ?? ''}` : hit,
  );
  return symbolText(spoken, home);
}
