/* The types of `offer-budgets.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A category or a Ledger entry as a script reads it: `spoken` is "categories#3". */
export type BudgetRow = { id: string; spoken?: string; version?: number; fields: Record<string, unknown> };
/** One change an answer makes, in the words of a script's `ask`. */
export type BudgetPatch = { id: string; version: number; fields: { budget: { amount: number; currency: string } } };
export type BudgetAsk = {
  cause: string;
  question: string;
  about: string;
  options: { id: string; label: string; because: string; patches?: BudgetPatch[] }[];
};

export declare function roundUp(minor: number, exp: number): number;
export declare function said(minor: number, currency: string, exp: number): string;
export declare function budgetOffer(categories: BudgetRow[], entries: BudgetRow[], home: string | null, month: string, last: string): BudgetAsk | null;
export default function run(ctx: unknown): Promise<unknown>;
export declare const OFFER_BUDGETS_SCRIPT: Record<string, unknown>;
