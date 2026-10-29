/* The types of `file-paid.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

import type { SettlePatch, SettleRow } from './settle.js';

/**
 * The one change that files `payment` under the category of `item`, the bill or repeating line it pays, or why none.
 * `categories` are the record's, as `categoriesFor` reads them; `kinds` a bill's kinds in words (`BILL_KINDS`).
 */
export declare function fileUnder(
  payment: SettleRow,
  item: SettleRow,
  categories: readonly { id: string; fields: Record<string, unknown> }[],
  kinds?: Readonly<Record<string, string>>,
): { writes: SettlePatch[]; said: string } | { nothing: string };
export declare function categoriesFor(ctx: unknown, fields: Readonly<Record<string, unknown>>): Promise<{ id: string; fields: Record<string, unknown> }[] | null>;
export declare const BILL_KINDS: Readonly<Record<string, string>>;
export default function run(ctx: unknown): Promise<unknown>;
export declare const FILE_PAID_SCRIPT: Record<string, unknown>;
export declare const FILE_PAID_RULE: Record<string, unknown>;
