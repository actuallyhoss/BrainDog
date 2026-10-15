/* The types of `settle.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A bill, an instalment, a repeating line or a Ledger entry, as a script reads it: `spoken` is "recurring#7". */
export type SettleRow = { list: string; id: string; spoken: string; version: number; fields: Record<string, unknown> };
/** One change, in the words of `ctx.update`: what it is made to, the version it was read at, and the fields. */
export type SettlePatch = { id: string; version: number; fields: Record<string, unknown> };
export type SettleAsk = { cause: string; question: string; about: string; options: { label: string; because: string; patches?: SettlePatch[] }[] };
/**
 * The changes and the sentence that says them, the one question, why nothing changed, or (handed `quiet`) why a
 * payment was not counted on a repeating line, in one sentence for the payment.
 */
export type Settled = { writes: SettlePatch[]; said: string } | { ask: SettleAsk } | { nothing: string } | { left: string };

/**
 * `next` is the day a repeating line moves to (`cycleOn`), `null` when it has none; `before` what a bill's other
 * payments already came to, in minor units of the bill's currency. `quiet`: a line off its amount asks nothing.
 * `told`: "It went through" with no payment, so `payment` may be `null` and only "Next" moves, and not at all
 * once the line's day is `today` or later.
 */
export declare function settle(
  item: SettleRow,
  payment: SettleRow | null,
  opts?: { next?: string | null; before?: number; quiet?: boolean; told?: boolean; today?: string },
): Settled;
export declare function cycleOn(fields: Readonly<Record<string, unknown>>, rest?: readonly number[]): string | null;
export default function run(ctx: unknown): Promise<unknown>;
export declare const SETTLE_SCRIPT: Record<string, unknown>;
