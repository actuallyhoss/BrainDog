/* The types of `plans-from-names.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A part on Instalments or a plan on Plans, as a script reads it: `spoken` is "installments#7". */
export type PlanRow = { list: string; id: string; spoken: string; version: number; fields: Record<string, unknown> };
/** One change, in the words of `ctx.update`: what it is made to, the version it was read at, and the fields. */
export type PlanPatch = { id: string; version: number; fields: Record<string, unknown> };

/** The plans to make, the changes to parts and plans, and how many parts wait on a plan made in this run. */
export declare function plansFromNames(parts: PlanRow[], plans: PlanRow[]): { plans: Record<string, unknown>[]; writes: PlanPatch[]; waiting: number };
export default function run(ctx: unknown): Promise<unknown>;
export declare const PLANS_FROM_NAMES_SCRIPT: Record<string, unknown>;
