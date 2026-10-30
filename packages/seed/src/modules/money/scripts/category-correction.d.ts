/* The types of `category-correction.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

export type CorrectionAsk = { cause: string; question: string; about: string; options: { id: string; label: string; because: string }[] };
export declare function correctionAsk(name: string, categoryId: string, about: string): CorrectionAsk;
export default function run(ctx: unknown): Promise<unknown>;
export declare const CATEGORY_CORRECTION_SCRIPT: Record<string, unknown>;
