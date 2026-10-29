/* The types of `category-stays.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

export type StaysAsk = { cause: string; question: string; about: string; options: { id: string; label: string; because: string }[] };
export declare function staysAsk(name: string, n: number, categoryId: string, about: string): StaysAsk;
export default function run(ctx: unknown): Promise<unknown>;
export declare const CATEGORY_STAYS_SCRIPT: Record<string, unknown>;
