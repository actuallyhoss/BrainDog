/* The types of `close-account.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** An account as a script reads it: `spoken` is "accounts#3". One it could move to needs only its id and fields. */
export type CloseAccountRow = { id: string; spoken: string; version: number; fields: Record<string, unknown> };
export type CloseOther = { id: string; fields: Record<string, unknown> };
/** One change, in the words of `ctx.update`: what it is made to, the version it was read at, and the fields. */
export type ClosePatch = { id: string; version: number; fields: Record<string, unknown> };
/** One leg of a move, as `ctx.write('transactions', leg)` takes it: `account` is the account's own id. */
export type CloseLeg = {
  what: string;
  on: string;
  direction: 'in' | 'out';
  amount: { amount: number; currency: string };
  account: string;
  transfer: true;
  state: 'cleared';
};
/**
 * An answer. `patches` is what the gate makes on the pick. A move has none: its `legs` and the close in `then` are
 * made together by the run handed the answer.
 */
export type CloseOption = { label: string; because: string; patches?: ClosePatch[]; legs?: CloseLeg[]; then?: ClosePatch[] };
export type CloseAsk = { cause: string; question: string; about: string; options: CloseOption[] };
/** The changes, the legs to add and the sentence that says them, the one question, or why nothing changed. */
export type Closed = { writes: ClosePatch[]; legs: CloseLeg[]; said: string } | { ask: CloseAsk } | { nothing: string };

/**
 * `holds` is what the record rolls the account to, in minor units of its own currency, and the typed balance when
 * left out; `on` the day a move is dated; `others` the accounts it may move to; `answer` the words of an answer picked.
 */
export declare function closeAccount(account: CloseAccountRow, opts?: { holds?: number; on?: string; others?: readonly CloseOther[]; answer?: string }): Closed;
export default function run(ctx: unknown): Promise<unknown>;
export declare const CLOSE_ACCOUNT_SCRIPT: Record<string, unknown>;
