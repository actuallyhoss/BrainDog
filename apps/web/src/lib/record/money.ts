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
 * A total, and what it is a total of.
 *
 * `mixed` non-empty is the refusal: the values were in more than one currency, so `amount` is not a
 * figure anybody should see. `currency` is `null` for a total of plain numbers, which is the
 * ordinary case for a count of days or a sum of hours.
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
     others is the same failure wearing a different hat. */
  const mixed = seen.size > 1 || (bare && seen.size > 0) ? [...seen].sort() : [];
  /* A MIXED TOTAL IS IN NO CURRENCY. Returning the first one seen would hand a caller that only
     checks `currency` a code to print beside a figure that is a sum of two — which is the exact
     failure, arrived at through the guard against it. */
  return { amount, currency: mixed.length ? null : currency, mixed, n };
}

/** The sentence a mixed total shows instead of a figure. */
export const mixedFix = (mixed: readonly string[]): string =>
  `these rows are in ${mixed.join(' and ')}, and two currencies are never added`;

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
    for (const c of t.mixed) seen.add(c);
    if (t.currency) seen.add(t.currency);
    else if (t.n > 0) bare = true;
  }
  const mixed = seen.size > 1 || (bare && seen.size > 0) ? [...seen].sort() : [];
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
    return `${d.lead}${d.whole}${d.fraction}${d.iso ? ` ${d.iso}` : ''}`;
  });
}
