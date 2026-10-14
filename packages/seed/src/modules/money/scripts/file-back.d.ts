/* The types of `file-back.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A filing rule or a Ledger entry as a script reads it. */
export type FilingRow = { id: string; register?: string; seq: number | null; version: number; fields: Record<string, unknown> };
/** How a rule fits an entry: the ladder's rung (1 to 4), the rule's text in characters, and whether the payee key made it fit. */
export type FilingFit = { rung: 1 | 2 | 3 | 4; long: number; folded: boolean };

export declare function filingFits(rule: FilingRow | Record<string, unknown>, entry: Record<string, unknown>, key?: (text: string) => string | null): FilingFit | null;
export declare function filingWinner(rules: readonly FilingRow[], entry: Record<string, unknown>): { id: string } | { tie: true } | null;
export declare function fileable(
  rule: FilingRow,
  entries: readonly FilingRow[],
  rivals: readonly FilingRow[],
  key: ((text: string) => string | null) | undefined,
  most: number,
): FilingRow[];
export declare function unfiled(ctx: unknown, where: readonly unknown[], from: string, to: string): Promise<{ rows: FilingRow[]; short: boolean }>;
export default function run(ctx: unknown): Promise<unknown>;
export declare const FILE_BACK_SCRIPT: Record<string, unknown>;
