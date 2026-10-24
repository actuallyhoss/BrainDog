/* The types of `kind-drafts.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

type Row = { id: string; spoken?: string; version?: number; fields: Record<string, unknown> };
export type KindAsk = { cause: string; question: string; body_kind: 'rowset'; body: { register: 'kpis'; rows: Record<string, unknown>[]; why: string } };
export declare function kindDrafts(project: Row, kpis: readonly Row[]): KindAsk | { nothing: string };
export default function run(ctx: unknown): Promise<unknown>;
export declare const KIND_DRAFTS_SCRIPT: Record<string, unknown>;
export declare const KIND_DRAFTS_RULE: Record<string, unknown>;
export declare const KIND_DRAFTS: Record<string, unknown>[];
