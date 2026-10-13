/* The types of `settle.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A bill, an instalment, a repeating line or a Ledger entry, as a script reads it: `spoken` is "recurring#7". */
export type SettleRow = { list: string; id: string; spoken: string; version: number; fields: Record<string, unknown> };
/** One change, in the words of `ctx.update`: what it is made to, the version it was read at, and the fields. */
export type SettlePatch = { id: string; version: number; fields: Record<string, unknown> };
export type SettleAsk = { cause: string; question: string; about: string; options: { label: string; because: string; patches?: SettlePatch[] }[] };
/** The changes and the sentence that says them, the one question, or why nothing changed. */
export type Settled = { writes: SettlePatch[]; said: string } | { ask: SettleAsk } | { nothing: string };

/**
 * `next` is the day a repeating line moves to (`cycleOn`), `null` when it has none; `before` what a bill's other
 * payments already came to, in minor units of the bill's currency.
 */
export declare function settle(item: SettleRow, payment: SettleRow, opts?: { next?: string | null; before?: number }): Settled;
export declare function cycleOn(fields: Readonly<Record<string, unknown>>, rest?: readonly number[]): string | null;
export default function run(ctx: unknown): Promise<unknown>;
export declare const SETTLE_SCRIPT: Record<string, unknown>;
