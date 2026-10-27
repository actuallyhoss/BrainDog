/* The types of `budget-watch.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A category or a Ledger entry as a script reads it: `spoken` is "categories#3". */
export type WatchRow = { id: string; spoken?: string; version?: number; fields: Record<string, unknown> };
export type WatchWrite = { id: string; version: number; fields: { budget_warned: 'near' | 'over'; warned_month: string } };

export declare function budgetWarnings(categories: WatchRow[], entries: WatchRow[], month: string): WatchWrite[];
export default function run(ctx: unknown): Promise<unknown>;
export declare const BUDGET_WATCH_SCRIPT: Record<string, unknown>;
