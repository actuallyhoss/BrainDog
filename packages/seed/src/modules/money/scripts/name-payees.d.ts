/* The types of `name-payees.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A payee name or a Ledger line as a script reads it. */
export type PayeeRow = { id?: string; seq?: number | null; version?: number; fields: Record<string, unknown> };

export declare function payeeNameFor(names: readonly (PayeeRow | Record<string, unknown>)[], text: unknown): string | null;
export declare function nameable(fields: Record<string, unknown>): boolean;
export declare const bankWords: (fields: Record<string, unknown>) => unknown;
export default function run(ctx: unknown): Promise<unknown>;
export declare const NAME_PAYEES_SCRIPT: Record<string, unknown>;
