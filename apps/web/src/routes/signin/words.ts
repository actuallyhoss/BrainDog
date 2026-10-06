/**
 * The entry screens' own words: the one line that says what a passkey is.
 *
 * A `words` OBJECT IN A MODULE THESE SCREENS OWN, and not keys in `copy.ts` (`lib/copy.ts` header: no unit
 * edits the aggregate). Sign-up's own words, the question and what follows it, are in `routes/signup/words.ts`.
 *
 * Plain Node may load this file through a test, so it imports only relative `.ts` files.
 */

export const words = {
  /** Under the passkey way in: what a passkey is, in one sentence. */
  passkeyLine: "A passkey opens with your device's own lock, so there is nothing to type or remember.",
};
