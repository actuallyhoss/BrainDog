/* The types of `learn-category.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** An answer to the question, in the words a script's `ask` uses. */
export type LearnOption = { id: string; label: string; because: string };
export type LearnAsk = { cause: string; question: string; about: string; options: LearnOption[] };

/** The question for one payee: `whom` as a person reads it, `under` the category's name, `n` how many more would be filed. */
export declare function learnAsk(whom: string, under: string, n: number, key: string, about: string): LearnAsk;
export default function run(ctx: unknown): Promise<unknown>;
export declare const LEARN_CATEGORY_SCRIPT: Record<string, unknown>;
