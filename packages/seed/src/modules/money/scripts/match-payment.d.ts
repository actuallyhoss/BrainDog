/* The types of `match-payment.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A Ledger entry, a bill, an instalment or a repeating line, as a script reads it: `spoken` is "recurring#7". */
export type MatchRow = { list: string; id: string; spoken: string; version: number; fields: Record<string, unknown> };
/** One change, in the words of `ctx.update`: what it is made to, the version it was read at, and the fields. */
export type MatchPatch = { id: string; version: number; fields: Record<string, unknown> };
/** The thing the payment pays: its list, its handle ("obligations#4") and its id. */
export type MatchLink = { list: string; item: string; id: string };
/** An answer. `patches` is the link the gate writes on the pick; a repeating line holds no link, so it has none. */
export type MatchOption = { id: string; label: string; because: string; patches?: MatchPatch[] };
export type MatchAsk = { cause: string; question: string; about: string; options: MatchOption[] };
/** The link, where it is written and the sentence that says it; the one question; or why nothing was linked. */
export type Matched = { link: MatchLink; writes: MatchPatch[]; said: string } | { ask: MatchAsk } | { nothing: string };

/**
 * `items` is what is open to pay; `fold` a text to its payee key (`payeeKey`), letters and digits alone when left
 * out; `answer` the words of an answer picked.
 */
export declare function matchPayment(payment: MatchRow, items: readonly MatchRow[], opts?: { fold?: (text: string) => string | null; answer?: string }): Matched;
/** The kernel's `bankKey`: the key a bank's spelling of a payee folds to, or `null` when nothing of it is a payee. */
export declare function payeeKey(text: string): string | null;
export default function run(ctx: unknown): Promise<unknown>;
export declare const MATCH_PAYMENT_SCRIPT: Record<string, unknown>;
