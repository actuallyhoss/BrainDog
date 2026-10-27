/**
 * The cash counter's sums: the notes and coins a currency has, the total of what was counted, how far that is from what
 * the record expected, and the row a count is written as.
 *
 * PURE, so a test imports it and the screen draws from it. The note sets are read from `packs/count-cash/note-sets.json`,
 * the same file the pack's test holds the count script to, so the counter and the script cannot disagree about which
 * notes a currency has.
 *
 * MONEY IS WHOLE MINOR UNITS. Every set is counted in hundredths, so a face value of 0.25 is 25 and a count of four of
 * them is 100. A face value is a string, as the pack keeps it (`"0.5"`), so it never becomes a float on the way.
 */

import { exponentOf } from 'braindog-render';

import SETS from '../../../../../packs/count-cash/note-sets.json' with { type: 'json' };

const NOTE_SETS: Readonly<Record<string, readonly string[]>> = SETS;

/** The currencies a person can count by note and coin. */
export const COUNTABLE: readonly string[] = Object.keys(NOTE_SETS);

/** The notes and coins of a currency, largest first, or none where it is counted by its total only. */
export function noteSet(currency: string): readonly string[] {
  return NOTE_SETS[currency.toUpperCase()] ?? [];
}

/**
 * The digits after the point a currency is stored with: two for most, none for yen. The renderer's ISO 4217 table, the
 * one the record divides by, so a counted total is never written in a unit the ledger reads differently.
 */
export { exponentOf };

/** A total typed in the main unit, as whole minor units of its currency: "1,250.5" in a currency of two digits is 125050. */
export function typedTotalOf(text: string, currency: string): number {
  const said = Number(text.replace(/,/gu, '').trim());
  return Number.isFinite(said) && said > 0 ? Math.round(said * 10 ** exponentOf(currency)) : 0;
}

/** A face value in hundredths. */
export const minorOf = (face: string | number): number => Math.round(Number(face) * 100);

/** How many of each note were counted, by face value. A note not named was not counted. */
export type Counts = Readonly<Record<string, number>>;

/** The most of one note a counter can take, so a held-down button stops at a number a box could hold. */
export const MOST = 9999;

/** One more or one less of a note, never below nothing or above `MOST`. */
export const stepped = (n: number, by: 1 | -1): number => Math.min(MOST, Math.max(0, Math.trunc(n) + by));

/** A number typed in a note's box, as a count: digits only, whole, between nothing and `MOST`. */
export function typedCount(text: string): number {
  const digits = text.replace(/\D/gu, '');
  return digits === '' ? 0 : Math.min(MOST, Number(digits));
}

/** The total of a count in hundredths. */
export function totalOf(counts: Counts): number {
  let total = 0;
  for (const [face, n] of Object.entries(counts)) total += n * minorOf(face);
  return total;
}

/** Only the notes that were counted, as the pack keeps them. */
export function notesOf(counts: Counts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const face of Object.keys(counts)) if ((counts[face] ?? 0) > 0) out[face] = counts[face]!;
  return out;
}

/** A face value as it is said: "200", "0.5" and "0.25" stay, "1.0" does not exist. */
export const faceSaid = (face: string): string => String(Number(face));

/** What a count is out by: what was counted less what the record expected. Positive is more cash than expected. */
export const differenceOf = (counted: number, expected: number): number => counted - expected;

/** One line of a difference as a person fills it in: what it was and how much, in the main unit, as typed. */
export type Line = { what: string; amount: string; category: string };

export type Lines = { ok: true; lines: { what: string; amount: number; category?: string }[]; rest: number } | { ok: false; why: string };

/**
 * The lines of a difference as the pack takes them, and what is left over for Discrepancy (in hundredths).
 *
 * A BLANK LINE IS NOT A LINE (both boxes empty), so a form that offers a spare row to type in is not refused for it.
 * A line with only one box filled, a sum that is not above nothing, or lines that together pass the difference are
 * refused in words, because the script would refuse them and file nothing.
 */
export function linesOf(lines: readonly Line[], difference: number): Lines {
  const out: { what: string; amount: number; category?: string }[] = [];
  let sum = 0;
  for (const l of lines) {
    const what = l.what.trim();
    const typed = l.amount.trim();
    if (what === '' && typed === '') continue;
    if (what === '') return { ok: false, why: 'Say what each line was.' };
    const amount = Number(typed.replace(/,/gu, ''));
    if (typed === '' || !Number.isFinite(amount) || amount <= 0) return { ok: false, why: `${what} needs an amount above nothing.` };
    const cents = minorOf(amount);
    sum += cents;
    out.push({ what, amount: cents / 100, ...(l.category.trim() === '' ? {} : { category: l.category.trim() }) });
  }
  if (sum > Math.abs(difference)) return { ok: false, why: 'Together the lines are more than the difference.' };
  return { ok: true, lines: out, rest: Math.abs(difference) - sum };
}

/** How the difference is recorded. */
export type Reconcile = 'lines' | 'discrepancy';

/**
 * The row a count is written as. `counted` is the total, `denominations` the notes behind it, and `lines` and
 * `reconcile` only when the cash was out and a person chose how to record it.
 */
export function countFields(input: {
  account: string | number;
  currency: string;
  counts: Counts;
  day: string;
  out: boolean;
  reconcile: Reconcile;
  lines: readonly { what: string; amount: number; category?: string }[];
}): Record<string, unknown> {
  const notes = notesOf(input.counts);
  const fields: Record<string, unknown> = {
    account: input.account,
    on: input.day,
    counted: { amount: totalOf(input.counts), currency: input.currency },
    denominations: { currency: input.currency, notes },
  };
  if (input.out) {
    fields.reconcile = input.reconcile;
    if (input.reconcile === 'lines' && input.lines.length > 0) fields.lines = input.lines;
  }
  return fields;
}
