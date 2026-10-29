/**
 * The widget Today's read carried, handed to the board's offer (`offer.svelte.ts`) with no rune here, so the plain module
 * that reads Today (`home/today-read.ts`) and every test that imports it run under plain Node. The last one heard is kept,
 * so an offer heard before the board's module loads is still the one it starts from.
 */

let listener: ((v: unknown) => void) | null = null;
let last: { v: unknown } | null = null;

/** Heard in Today's answer. */
export function hearOffer(v: unknown): void {
  last = { v };
  listener?.(v);
}

/** The board's offer, told every offer heard from now on, and the last one already heard. */
export function onOfferHeard(fn: (v: unknown) => void): void {
  listener = fn;
  if (last !== null) fn(last.v);
}
