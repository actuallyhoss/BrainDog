/**
 * EACH CARD'S FACTS OVER A FIGURE, laid into the cells its columns draw: the record's `facts` (the kernel's
 * `card-facts.ts` `factsOf`), one entry a card and one fact a figure column in column order, said as words.
 *
 * A COUNT IS ITS NUMBER and money goes through the formatter the page already uses, handed in as `money` so this file
 * imports nothing the entry pulls. A fact the record read nothing for is `null`, and the card draws no fact rather than
 * "0": nought is a reading, nothing is not.
 */

/** A column as a cards block declares it, as far as this file reads it. */
type Column = { readonly as?: unknown; readonly metric?: unknown; readonly [key: string]: unknown };

/** One cell a card's fact over a figure fills: the column's place among the block's columns, and its words. */
export type FactCell = { at: number; text: string | null };

/** How many facts over a figure a card reads: the kernel's `CARD_FIGURE_FACTS_MOST`. */
const MOST = 3;

/** Where a block's facts over a figure sit among its columns, in column order, at most a card's worth. */
export function factColumnsAt(columns: readonly Column[]): number[] {
  const at: number[] = [];
  columns.forEach((c, i) => {
    if (c?.as === 'fact' && typeof c.metric === 'string' && at.length < MOST) at.push(i);
  });
  return at;
}

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  v !== null &&
  typeof v === 'object' &&
  Number.isInteger((v as { amount?: unknown }).amount) &&
  typeof (v as { currency?: unknown }).currency === 'string' &&
  (v as { currency: string }).currency.trim() !== '';

/** One fact as the words a card draws, or `null` for nothing. */
function said(v: unknown, money: (amount: number, currency: string) => string): string | null {
  /* `v || 0`: a nought that came out of a subtraction as -0 is said as 0, never "-0". */
  if (typeof v === 'number') return Number.isFinite(v) ? (v || 0).toLocaleString('en-u-nu-latn', { maximumFractionDigits: 2 }) : null;
  return isMoney(v) ? money(v.amount, v.currency.trim().toUpperCase()) : null;
}

/**
 * Per card, the cells its facts over a figure fill. `facts` is the record's answer as it came over the wire, so anything
 * that is not one list a card is read as no facts, and a card the record said nothing for fills its cells with nothing.
 */
export function factCells(columns: readonly Column[], facts: unknown, money: (amount: number, currency: string) => string): FactCell[][] {
  const at = factColumnsAt(columns);
  if (at.length === 0 || !Array.isArray(facts)) return [];
  return facts.map((card) => at.map((i, k) => ({ at: i, text: Array.isArray(card) ? said(card[k], money) : null })));
}
