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
 * IT IS THE RECORD'S WORD, AND IT USED TO BE THIS FILE'S OWN. `packages/kernel/src/metrics.ts`
 * writes `g.u ?? 'no unit'` into the same refusal, twice, and that is the copy a paying customer
 * reads; the sample said `no currency` and the two therefore described the same two rows in
 * different words, one on the screen the product demonstrates itself on and one on the screen
 * somebody works from. The equality assertion written to stop exactly that held only the two web
 * modules to each other, so it passed the whole time. `money.test.ts` now reads the mark out of the
 * kernel's source and pins all three.
 *
 * AND IT IS A UNIT RATHER THAN A CURRENCY BECAUSE THE SET IT JOINS IS UNITS. `GBP and no unit` is
 * a list of two units, one of which is money; `GBP and no currency` is a list with a hole in it.
 *
 * SPELLED HERE AND NOT IMPORTED, because `metrics.ts` imports this module and a constant cannot
 * travel back up that edge without an import cycle. `metrics.ts` declares the same string for its
 * own set and `forecast.ts` reads it from there.
 *
 * THE SECOND COPY IS NOT PERMANENT. The edge runs metrics to money, so the way out is for
 * `metrics.ts` to delete its own line and re-export this one, and then the equality assertion has
 * nothing left to guard. That file belonged to another change when this one was written.
 */
export const BARE = 'no unit';

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
     for the rows somebody has to go and fix. `metrics.ts` and `forecast.ts` both mark theirs, and
     the kernel writes `no unit` into the same sentence; this was the summing site that did not. */
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
 * THE WORDING IS THE KERNEL'S, THE CHOICE OF WHEN TO SAY IT IS THIS SIDE'S, and the difference is
 * worth writing down because it is what is still divergent. `packages/kernel/src/metrics.ts:1072`
 * refuses a mixed `money` field with *"two currencies are never added"* and `:1077` a mixed
 * `quantity` with *"two units are never added"* under `QUANTITY_MIXED_UNIT`, and the comment above
 * the two gives the reason they were ever separated: *"a sentence about money attached to a figure
 * about metres"*. It splits on the FIELD'S TYPE, though, and not on what the set turned out to
 * hold: a money field with a row carrying no currency goes down the money arm, where
 * `g.u ?? 'no unit'` names that row, so the sentence a live record prints for the rows below is
 * *"these rows are in GBP and no unit, and two currencies are never added"*. This mirror declares
 * no `quantity` type at all (`schema.ts:39`), so the kernel's second arm is not a case anything
 * here can reach, and taking its clause is this file's own judgement that one sterling row and one
 * plain number are not two currencies. What that leaves is the record saying "currencies" about
 * the two rows this says "units" about, and the line that closes it is in the kernel's money arm
 * rather than here. `money.test.ts` reads both clauses back out of the kernel, so a rewording there
 * fails here rather than drifting again.
 */
export const mixedFix = (mixed: readonly string[]): string =>
  `these rows are in ${mixed.join(' and ')}, and two ${mixed.includes(BARE) ? 'units' : 'currencies'} are never added`;

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
 * The symbol a currency is written with, or `null` when the runtime knows none beyond its code.
 *
 * A DRAWING DECISION. `money()` in `braindog-render` still writes `GBP 28,320.00`, code first, and
 * everything that reads figures back out of text reads that. What changes is only the glyphs a
 * screen sets: the record's home currency is written the way a person writes it, `£28,320.00`, and
 * any other currency keeps its code beside the symbol so two currencies never look alike.
 */
export function symbolOf(currency: string): string | null {
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value;
    return part && part.toUpperCase() !== currency.toUpperCase() ? part : null;
  } catch {
    return null;
  }
}

/**
 * The currency most of a record's money is in, or `null` when it holds no money.
 *
 * Read from the values rather than set as a constant, because a constant pinned to sterling is the
 * bug `currencyFor` was written to remove. A tie goes to the code first in alphabetical order, so
 * the answer does not depend on the order rows were read in.
 */
export function homeOf(values: Iterable<unknown>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const c = currencyOf(value);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [c, n] of [...counts].sort(([a], [b]) => a.localeCompare(b)))
    if (best === null || n > counts.get(best)!) best = c;
  return best;
}

/**
 * An amount in parts: the whole and the fraction apart, so a figure can set its pence quieter, and
 * `iso` present only when the currency is not the home one or has no symbol.
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
  const foreign = currency !== home || symbol === null;
  return {
    lead: `${minus}${symbol ?? ''}`,
    whole,
    fraction: fraction ?? '',
    iso: foreign ? currency : null,
  };
}

/** A sentence with every figure `money()` wrote in it redrawn the same way, as plain text. */
export function symbolText(text: string, home: string | null): string {
  return text.replace(/\b[A-Z]{3} −?[\d,]+(?:\.\d+)?/gu, (hit) => {
    const d = drawn(hit, home);
    if (!d) return hit;
    if (d.lead.replace('−', '') === '') return hit;
    /* THE CODE STAYS WITH ITS AMOUNT, so a line of amounts in several currencies breaks between them and never inside one. */
    return `${d.lead}${d.whole}${d.fraction}${d.iso ? ` ${d.iso}` : ''}`;
  });
}
