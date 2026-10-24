/* The types of `move-line.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

import type { SettleAsk, SettleRow } from './settle.js';

export declare function twinLine(bill: SettleRow, lines: readonly SettleRow[], opts?: { fold?: (text: string) => string | null }): { line: SettleRow } | { nothing: string };
export declare function moveLine(bill: SettleRow, line: SettleRow, next: unknown): { ask: SettleAsk } | { nothing: string };
export default function run(ctx: unknown): Promise<unknown>;
export declare const MOVE_LINE_SCRIPT: Record<string, unknown>;
export declare const MOVE_LINE_RULE: Record<string, unknown>;
