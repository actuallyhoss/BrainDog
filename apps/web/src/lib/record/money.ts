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
import { AMOUNT_SPACE, exponentOf, readAmount, writeAmount, type Amount, type WrittenAmount } from 'braindog-render';
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

/**
 * The sign a currency is written with, or `null` when it has none of its own and is written by its code.
 *
 * NOT A RULE OF THIS FILE'S. The one table that says how an amount is written on a screen is `braindog-render`'s
 * `money.ts`, and this asks it: the sign is whatever the one writer puts in front of the home currency's figure. This
 * module kept a sign table of its own, and with two tables one record wrote `$3.63 USD` in a cell, `US$4,012.46` on a
 * bar and `EGP -700` in a line. So `£` for GBP, `$` for USD, and `null` for EGP, CHF and KWD, which English writes by
 * their codes ("EGP 1,350", his word, 9 October, never "E£1,350").
 */
export function symbolOf(currency: string): string | null {
  return writeAmount({ minor: 0, currency }, currency, 'read')?.sign || null;
}

/**
 * THE SMALLEST AMOUNT A TILE SAYS IN WHOLE UNITS: ten thousand of the currency. Below it the fraction is a part of the
 * figure a person checks against a statement, and "£100" for £100.49 or "£1,000" for £999.50 was a different amount
 * (research audit 14-15a, M6). From ten thousand up the fraction is a rounding a glance does not miss.
 */
const WHOLE_FROM = 10_000n;

/**
 * A TILE'S AMOUNT IN WHOLE UNITS, in minor units still: 1,086,213.41 is 1,086,213.00, and a half rounds up, away from
 * nought. Under `WHOLE_FROM` units the amount is as it was. WHICH AMOUNT A HEADLINE SAYS is this module's; how any
 * amount is written is the one writer's, so the rounded amount goes to it like any other.
 */
function wholeUnits(amount: Amount): Amount {
  const unit = 10n ** BigInt(exponentOf(amount.currency));
  const size = amount.minor < 0n ? -amount.minor : amount.minor;
  if (unit === 1n || size / unit < WHOLE_FROM) return amount;
  const whole = ((size + unit / 2n) / unit) * unit;
  return { minor: amount.minor < 0n ? -whole : whole, currency: amount.currency };
}

/**
 * An amount in parts: the whole and the fraction apart, so a figure can set its pence quieter, and
 * `iso` present only when the code stands after the figure, which is a currency with a sign that is not the home one.
 *
 * A CURRENCY WITH NO SIGN KEEPS ITS CODE IN FRONT, as part of `lead` (`EGP 58,185.54`), home or not: the code is
 * the only mark it has, so it belongs to the figure, and a second code after it would say the currency twice.
 * `lead` also holds the minus, in front of everything (`−EGP 497.26`, `−$12.00`), as the writer's table has it.
 *
 * `text` is the output of `money()`. Anything that is not a figure `money()` wrote comes back `null`.
 */
export type Drawn = { lead: string; whole: string; fraction: string; iso: string | null };

/** How `Setting` and the older `true`/`false` map onto the amount a figure says and the writer's own two settings. */
function written(amount: Amount, home: string | null, setting: Setting | boolean): WrittenAmount | null {
  const headline = setting === true || setting === 'headline';
  return writeAmount(headline ? wholeUnits(amount) : amount, home, setting === 'exact' ? 'exact' : 'read');
}

/**
 * `headline` IS A TILE'S FIGURE, OR THE PAGE'S ONE LINE: an amount of ten thousand or more is in whole units
 * (`wholeUnits`). `figure` keeps the amount exact, for a bar's value or any figure read against others. `true` is
 * `headline`. A currency English writes by its code keeps its code in both, as it does everywhere ("EGP 1,350").
 *
 * THE PARTS ARE THE ONE WRITER'S (`writeAmount` in `braindog-render`), set out the way `Money` draws them. Left to
 * the default, the parts keep every minor unit, since a cell of a ledger is what asks for them.
 */
export function drawn(text: string, home: string | null, setting: boolean | 'headline' | 'figure' = false): Drawn | null {
  const amount = readAmount(text);
  const w = amount && written(amount, home, setting === true || setting === 'headline' ? 'headline' : 'exact');
  if (!w) return null;
  return {
    lead: `${w.minus}${w.codePlace === 'before' ? `${w.code}${AMOUNT_SPACE}` : w.sign}`,
    whole: w.whole,
    fraction: w.fraction,
    iso: w.codePlace === 'after' ? w.code : null,
  };
}

/**
 * How a figure is set where it stands: `exact` in a ledger or a table, every minor unit shown, since that is where
 * amounts are compared; `sentence` in words a person reads, a note, a question, a line of the feed, where a fraction
 * of all zeros says nothing ("£39", "−£9,190"); `figure`, a value standing alone that is still read against others, a
 * bar's or a split's, exact ("£58,185.54"); and `headline`, a tile's figure or the page's one line, in whole units from
 * ten thousand up ("£1,086,213", "EGP 1,086,213").
 */
export type Setting = 'exact' | 'sentence' | 'figure' | 'headline';

/** A figure `money()` wrote, where it stands in other words: the code, a true minus or none, grouped digits, a fraction. */
const WRITTEN = /\b([A-Z]{3}) (−?)(\d{1,3}(?:,\d{3})*)(?:\.(\d+))?(?![\d,]*\d)/gu;

/**
 * The amount in one such figure, or `null`. Three capitals the runtime does not list as tender are not money. A
 * SENTENCE MAY LEAVE MINOR UNITS UNSAID, "Pay USD 20" or "GBP 12.5", and that is still the amount: the units missing
 * are noughts, filled in so the strict reader takes it. More places than the currency has is not an amount of it.
 */
function amountIn(currency: string, minus: string, whole: string, fraction = ''): Amount | null {
  const exp = exponentOf(currency);
  if (!TENDER.has(currency) || fraction.length > exp) return null;
  return readAmount(`${currency} ${minus}${whole}${exp > 0 ? `.${fraction.padEnd(exp, '0')}` : ''}`);
}

/**
 * A sentence with every figure `money()` wrote in it redrawn the same way, as plain text.
 *
 * ONE SPELLING A CURRENCY, IN EVERY SETTING, and it is the one writer's table (`braindog-render`'s `money.ts`), which a
 * table cell, a bar and a chart are written by too. The home currency by its sign alone, "£39" and never "£39 GBP";
 * any other with its code after the figure, "$4,800 USD", since the narrow `$` is the same mark for four dollars; a
 * currency with no sign by its code in front, "EGP 700"; and the minus in front of everything, "−EGP 497.26". This
 * function kept a rule of its own, and it differed from the writer's by a space and by where the minus stood.
 *
 * A FRACTION OF ALL ZEROS IS DROPPED OUTSIDE A LEDGER: "£33,850" and "EGP 58,185", because ".00" in a sentence is width
 * a phone does not have and says nothing a round figure does not. A fraction that is not all zeros is part of the figure
 * and stays. A HEADLINE OF TEN THOUSAND OR MORE IS WHOLE UNITS (DIRECTION §37): "EGP 1,086,213.41" over Today is
 * "EGP 1,086,213", with the piastres gone; "£999.50" stays "£999.50", since a smaller
 * amount rounded is a different amount (research audit M6). A bar asks for `figure`, which is never rounded. `true` is
 * `headline` and `false` is `sentence`, as the callers that predate the settings pass them; a table cell asks for `exact`.
 */
export function symbolText(text: string, home: string | null, setting: Setting | boolean = 'sentence'): string {
  return text.replace(WRITTEN, (hit: string, currency: string, minus: string, whole: string, fraction: string | undefined) => {
    const amount = amountIn(currency, minus, whole, fraction);
    /* What is not an amount is left as it was written. */
    return (amount && written(amount, home, setting)?.text) ?? hit;
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
 * A sentence the record stored, with every amount in it drawn as a screen draws one: `£2,400` in the record's own
 * currency, `$4,800 USD` in any other, `−£39` for money out, `£12.50` where the pence are not round, and `EGP 58,185.54`
 * for a currency written by its code. A caller drawing a ledger passes `exact` and keeps every `.00`.
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
export function moneyInText(text: string, home: string | null = homeCurrency(), setting: Setting = 'sentence'): string {
  const spoken = text.replace(STORED, (hit, currency: string, minus: string, whole: string, fraction: string | undefined) =>
    TENDER.has(currency) ? `${currency} ${minus ? '−' : ''}${grouped(whole)}${fraction ?? ''}` : hit,
  );
  return symbolText(spoken, home, setting);
}
