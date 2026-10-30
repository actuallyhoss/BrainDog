/* The types of `ledger-twice.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */
type Line = { id: string; spoken: string; seq: number; version: number; fields: Record<string, unknown> };
export function bankless(text: string): string;
export function twiceOf(rows: readonly Line[]): { keep: Line; other: Line; gap: number }[];
export function twiceAsk(pairs: readonly { keep: Line; other: Line; gap: number }[], now: string): Record<string, unknown> | null;
export default function run(ctx: unknown): Promise<unknown>;
export declare const LEDGER_TWICE_SCRIPT: Record<string, unknown>;
