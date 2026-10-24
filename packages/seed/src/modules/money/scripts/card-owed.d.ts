/* The types of `card-owed.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

import type { SettlePatch, SettleRow } from './settle.js';

export declare function cardOwed(account: SettleRow, entry: SettleRow | null): { writes: SettlePatch[]; said: string } | { nothing: string };
export default function run(ctx: unknown): Promise<unknown>;
export declare const CARD_OWED_SCRIPT: Record<string, unknown>;
export declare const CARD_OWED_RULES: Record<string, unknown>[];
export declare const CARD_OWED: Record<string, unknown>[];
