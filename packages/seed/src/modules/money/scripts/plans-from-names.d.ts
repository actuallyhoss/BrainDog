/* The types of `plans-from-names.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A part on Instalments or a plan on Plans, as a script reads it: `spoken` is "installments#7". */
export type PlanRow = { list: string; id: string; spoken: string; version: number; fields: Record<string, unknown> };
/** One change, in the words of `ctx.update`: what it is made to, the version it was read at, and the fields. */
export type PlanPatch = { id: string; version: number; fields: Record<string, unknown> };
/** Plans here twice under one name: the oldest, kept, and the others. */
export type PlanTwins = { keep: PlanRow; others: PlanRow[] };
/** The one question a run over every plan asks about its twins, in a script's `ask` words. */
export type PlanTwinsAsk = {
  cause: string;
  question: string;
  about: string[];
  options: { id: string; label: string; because: string; patches?: PlanPatch[] }[];
};

/** The plans to make, the changes to parts and plans, how many parts wait on a plan made in this run, and the twins. */
export declare function plansFromNames(
  parts: PlanRow[],
  plans: PlanRow[],
): { plans: Record<string, unknown>[]; writes: PlanPatch[]; waiting: number; twins: PlanTwins[] };
export declare function planKey(name: unknown): string;
export declare function twinsAsk(twins: PlanTwins[]): PlanTwinsAsk | null;
export default function run(ctx: unknown): Promise<unknown>;
export declare const PLANS_FROM_NAMES_SCRIPT: Record<string, unknown>;
